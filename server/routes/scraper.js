'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const { isSafeExternalUrl } = require('../middleware/security');

const router = express.Router();

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36';

// In-memory stream resolution cache (15 minutes TTL)
const RESOLVE_CACHE_TTL_MS = 15 * 60 * 1000;
const resolveCache = new Map();

function buildProxyUrl(targetUrl, referer = '', origin = '') {
  if (!targetUrl || typeof targetUrl !== 'string') return '';
  const qs = new URLSearchParams({ url: targetUrl });
  if (referer) qs.set('referer', referer);
  if (origin) qs.set('origin', origin);
  return `/api/scraper/proxy?${qs.toString()}`;
}

// ============================================================================
// 1. 4texas4/movie-scraper — VidLink Native WASM HLS Extractor
// ============================================================================
const VIDLINK_REFERER = 'https://vidlink.pro/';
const VIDLINK_ORIGIN = 'https://vidlink.pro';

let wasmReady = false;
let bootPromise = null;

function bootVidlinkWasm() {
  if (wasmReady) return Promise.resolve();
  if (bootPromise) return bootPromise;

  bootPromise = (async () => {
    try {
      globalThis.window = globalThis;
      globalThis.self = globalThis;
      if (!globalThis.document) {
        globalThis.document = {
          createElement: () => ({}),
          body: { appendChild: () => {} },
        };
      }

      const sodium = require('libsodium-wrappers');
      await sodium.ready;
      globalThis.sodium = sodium;

      const scriptPath = path.join(__dirname, '..', 'scraper', 'script.js');
      const wasmPath = path.join(__dirname, '..', 'scraper', 'fu.wasm');

      // Evaluate Go WASM bridge script in global scope
      const scriptCode = fs.readFileSync(scriptPath, 'utf8');
      (0, eval)(scriptCode);

      if (typeof globalThis.Dm !== 'function') {
        throw new Error('Go WASM bridge Dm() constructor not found');
      }

      const go = new globalThis.Dm();
      const wasmBuf = fs.readFileSync(wasmPath);
      const { instance } = await WebAssembly.instantiate(wasmBuf, go.importObject);
      go.run(instance);

      await new Promise((r) => setTimeout(r, 450));
      if (typeof globalThis.getAdv !== 'function') {
        throw new Error('getAdv not found after WASM boot');
      }
      wasmReady = true;
    } catch (err) {
      bootPromise = null;
      throw err;
    }
  })();

  return bootPromise;
}

function formatBytes(bytesInput) {
  const bytes = Number(bytesInput);
  if (!isFinite(bytes) || bytes <= 0) return 'HD';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${Math.round(mb)} MB`;
}

async function scrapeVidlinkNative({ tmdbId, type, season, episode }) {
  await bootVidlinkWasm();
  const token = globalThis.getAdv(String(tmdbId));
  if (!token) throw new Error('VidLink WASM getAdv returned null');

  const apiUrl =
    type === 'tv'
      ? `https://vidlink.pro/api/b/tv/${token}/${season || 1}/${episode || 1}?multiLang=0`
      : `https://vidlink.pro/api/b/movie/${token}?multiLang=0`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(apiUrl, {
      headers: {
        Referer: VIDLINK_REFERER,
        Origin: VIDLINK_ORIGIN,
        'User-Agent': UA,
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`VidLink API status ${res.status}`);
    const data = await res.json();
    const stream = data?.stream;
    if (!stream) throw new Error('No stream object in VidLink response');

    const sources = [];

    // Case 1: HLS playlist URL
    if (stream.playlist && typeof stream.playlist === 'string') {
      const customRef = stream.headers?.Referer || stream.headers?.referer || VIDLINK_REFERER;
      const customOrig = stream.headers?.Origin || stream.headers?.origin || VIDLINK_ORIGIN;
      sources.push({
        id: `vidlink_wasm_hls_${tmdbId}_${season || 0}_${episode || 0}`,
        label: 'VidLink Direct (Ad-Free HLS)',
        provider: 'vidlink-native',
        quality: '1080p',
        type: 'hls',
        size: 'Adaptive HLS',
        codec: 'HLS.js Native',
        url: buildProxyUrl(stream.playlist, customRef, customOrig),
        rawUrl: stream.playlist,
      });
    }

    // Case 2: Multi-quality direct MP4 dictionary (stream.qualities: { 360, 480, 720, 1080, 4k })
    if (stream.qualities && typeof stream.qualities === 'object') {
      const qualityOrder = ['4k', '2160', '1080', '720', '480', '360'];
      const entries = Object.entries(stream.qualities).sort((a, b) => {
        const ia = qualityOrder.indexOf(String(a[0]).toLowerCase().replace(/p$/, ''));
        const ib = qualityOrder.indexOf(String(b[0]).toLowerCase().replace(/p$/, ''));
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      });

      for (const [qKey, qVal] of entries) {
        if (!qVal || !qVal.url) continue;
        const rawUrl = String(qVal.url);
        const isHls = qVal.type === 'hls' || /\.m3u8(\?|$)/i.test(rawUrl);
        const normQual = /^\d+$/.test(String(qKey)) ? `${qKey}p` : String(qKey).toUpperCase();
        const isHakuna = rawUrl.includes('hakunaymatata');
        const customRef =
          qVal.headers?.Referer ||
          qVal.headers?.referer ||
          (isHakuna ? 'https://lok-lok.cc/' : VIDLINK_REFERER);
        const customOrig =
          qVal.headers?.Origin ||
          qVal.headers?.origin ||
          (isHakuna ? 'https://lok-lok.cc' : VIDLINK_ORIGIN);
        const proxied = buildProxyUrl(rawUrl, customRef, customOrig);
        const formattedSize = qVal.size ? formatBytes(qVal.size) : isHls ? 'Adaptive' : 'Direct MP4';

        sources.push({
          id: `vidlink_wasm_${tmdbId}_${qKey}_${season || 0}_${episode || 0}`,
          label: `VidLink Direct ${normQual}`,
          provider: 'vidlink-native',
          quality: normQual,
          type: isHls ? 'hls' : 'mp4',
          size: formattedSize,
          codec: qVal.codecName ? String(qVal.codecName).toUpperCase() : isHls ? 'HLS' : 'MP4',
          url: proxied,
          downloadUrl: !isHls ? `${proxied}&download=1` : '',
          rawUrl,
        });
      }
    }

    if (sources.length === 0) {
      throw new Error('No playable playlist or qualities in VidLink response');
    }

    const subtitles = Array.isArray(stream.captions)
      ? stream.captions
          .filter((c) => c && (c.url || c.file))
          .map((c) => ({
            label: c.language || c.label || c.lanName || 'Subtitle',
            lang: c.id || c.srclang || c.lan || 'en',
            url: buildProxyUrl(c.url || c.file, VIDLINK_REFERER, VIDLINK_ORIGIN),
          }))
      : [];

    return {
      sources,
      subtitles,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================================
// 2. cinepro-org/core — Multi-Provider Scrapers (VidRock, Videasy, VixSrc, VidNest, CineSu)
// ============================================================================

// --- 2A. VidRock Provider (AES-CBC item encryption) ---
const VIDROCK_PASSPHRASE = 'x7k9mPqT2rWvY8zA5bC3nF6hJ2lK4mN9';
const VIDROCK_BASE = 'https://vidrock.net/';
const VIDROCK_SUB_BASE = 'https://sub.vdrk.site';
const VIDROCK_PROXY_PREFIX = 'https://proxy.vidrock.store/';

function encryptVidrockItemId(itemId) {
  const key = Buffer.from(VIDROCK_PASSPHRASE, 'utf8');
  const iv = Buffer.from(VIDROCK_PASSPHRASE.substring(0, 16), 'utf8');
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(itemId), 'utf8'), cipher.final()]);
  return encrypted
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function scrapeVidRock({ tmdbId, type, season, episode }) {
  const itemId = type === 'tv' ? `${tmdbId}_${season || 1}_${episode || 1}` : `${tmdbId}`;
  const encrypted = encryptVidrockItemId(itemId);
  const apiUrl = `${VIDROCK_BASE}api/${type === 'tv' ? 'tv' : 'movie'}/${encrypted}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(apiUrl, {
      headers: {
        'User-Agent': UA,
        Accept: 'application/json, text/javascript, */*; q=0.01',
        Referer: VIDROCK_BASE,
        Origin: 'https://vidrock.net',
      },
      signal: controller.signal,
    });
    if (!res.ok) return { sources: [], subtitles: [] };
    const resp = await res.json();
    if (!resp || typeof resp !== 'object') return { sources: [], subtitles: [] };

    const sources = [];
    let idx = 0;

    for (const [, stream] of Object.entries(resp)) {
      if (!stream || !stream.url) continue;

      if (stream.url.includes('hls2.vdrk.site')) {
        try {
          const cdnRes = await fetch(stream.url, {
            headers: { 'User-Agent': UA, Referer: VIDROCK_BASE },
            signal: controller.signal,
          });
          if (cdnRes.ok) {
            const cdnList = await cdnRes.json();
            if (Array.isArray(cdnList)) {
              for (const obj of cdnList) {
                if (!obj || !obj.url) continue;
                let finalUrl = obj.url;
                if (finalUrl.startsWith(VIDROCK_PROXY_PREFIX)) {
                  finalUrl = decodeURIComponent(
                    finalUrl.slice(VIDROCK_PROXY_PREFIX.length).replace(/^\//, '')
                  );
                }
                const isMp4 = finalUrl.includes('.mp4');
                const qual = obj.resolution ? `${String(obj.resolution).replace(/p$/i, '')}p` : '1080p';
                sources.push({
                  id: `vidrock_${tmdbId}_${++idx}`,
                  label: `VidRock CDN (${qual})`,
                  provider: 'vidrock',
                  quality: qual,
                  type: isMp4 ? 'mp4' : 'hls',
                  size: isMp4 ? 'Direct MP4' : 'Adaptive HLS',
                  url: buildProxyUrl(finalUrl, 'https://lok-lok.cc/', 'https://lok-lok.cc'),
                  downloadUrl: isMp4 ? buildProxyUrl(finalUrl, 'https://lok-lok.cc/', 'https://lok-lok.cc') : '',
                });
              }
            }
          }
        } catch {
          // ignore CDN sub-request failure
        }
        continue;
      }

      const isMp4 = stream.url.includes('.mp4');
      sources.push({
        id: `vidrock_${tmdbId}_${++idx}`,
        label: `VidRock (${stream.language || 'English'})`,
        provider: 'vidrock',
        quality: '1080p',
        type: isMp4 ? 'mp4' : 'hls',
        size: isMp4 ? 'Direct MP4' : 'Adaptive HLS',
        url: buildProxyUrl(stream.url, VIDROCK_BASE, 'https://vidrock.net'),
        downloadUrl: isMp4 ? buildProxyUrl(stream.url, VIDROCK_BASE, 'https://vidrock.net') : '',
      });
    }

    // Fetch VidRock subtitles in parallel
    const subtitles = [];
    try {
      const subUrl =
        type === 'tv'
          ? `${VIDROCK_SUB_BASE}/v2/tv/${tmdbId}/${season || 1}/${episode || 1}`
          : `${VIDROCK_SUB_BASE}/v2/movie/${tmdbId}`;
      const subRes = await fetch(subUrl, {
        headers: { 'User-Agent': UA, Referer: VIDROCK_BASE },
        signal: controller.signal,
      });
      if (subRes.ok) {
        const subsData = await subRes.json();
        if (Array.isArray(subsData)) {
          subsData.slice(0, 12).forEach((s) => {
            if (s && s.file) {
              subtitles.push({
                label: s.label || 'Subtitle',
                lang: (s.label || 'en').slice(0, 2).toLowerCase(),
                url: buildProxyUrl(s.file, subUrl, VIDROCK_SUB_BASE),
              });
            }
          });
        }
      }
    } catch {
      // ignore subtitle error
    }

    return { sources, subtitles };
  } finally {
    clearTimeout(timer);
  }
}

// --- 2B. Videasy Provider (api.videasy.net + enc-dec.app decryptor) ---
const VIDEASY_SERVERS = [
  { name: 'mb-flix', url: 'https://api.videasy.net/mb-flix/sources-with-title', language: 'english' },
  { name: '1movies', url: 'https://api.videasy.net/1movies/sources-with-title', language: 'english' },
  { name: 'cdn', url: 'https://api.videasy.net/cdn/sources-with-title', language: 'english' },
  { name: 'superflix', url: 'https://api.videasy.net/superflix/sources-with-title', language: 'english' },
];

async function scrapeVideasy({ tmdbId, type, season, episode, title, year }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7500);
  try {
    const sources = [];
    const subtitles = [];
    let idx = 0;

    await Promise.allSettled(
      VIDEASY_SERVERS.map(async (srv) => {
        const params = new URLSearchParams({
          title: title || '',
          mediaType: type === 'tv' ? 'tv' : 'movie',
          tmdbId: String(tmdbId),
          episodeId: String(type === 'tv' ? episode || 1 : 1),
          seasonId: String(type === 'tv' ? season || 1 : 1),
          language: srv.language,
        });
        if (type !== 'tv' && year) params.set('year', String(year));

        const res = await fetch(`${srv.url}?${params.toString()}`, {
          headers: {
            'User-Agent': UA,
            Accept: 'application/json, */*; q=0.01',
            Referer: 'https://player.videasy.net/',
            Origin: 'https://player.videasy.net',
          },
          signal: controller.signal,
        });
        if (!res.ok) return;
        const blob = await res.text();
        if (!blob || blob.length < 12) return;

        const decRes = await fetch('https://enc-dec.app/api/dec-videasy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: blob, id: String(tmdbId) }),
          signal: controller.signal,
        });
        if (!decRes.ok) return;
        const decJson = await decRes.json();
        const result = decJson?.result;
        if (!result || !Array.isArray(result.sources)) return;

        result.sources.forEach((s) => {
          if (!s || !s.url) return;
          const isHls =
            (s.type || '').toLowerCase().includes('hls') ||
            s.url.toLowerCase().includes('.m3u8');
          const qual = /^\d{3,4}p$|^4K$|^HD$/i.test(String(s.quality || '').trim())
            ? String(s.quality).trim()
            : '1080p';
          sources.push({
            id: `videasy_${srv.name}_${++idx}`,
            label: `Videasy ${srv.name.toUpperCase()} (${qual})`,
            provider: 'videasy',
            quality: qual,
            type: isHls ? 'hls' : 'mp4',
            size: isHls ? 'Adaptive HLS' : 'Direct MP4',
            url: buildProxyUrl(s.url, 'https://player.videasy.net/', 'https://player.videasy.net'),
            downloadUrl: !isHls
              ? buildProxyUrl(s.url, 'https://player.videasy.net/', 'https://player.videasy.net')
              : '',
          });
        });

        if (Array.isArray(result.subtitles)) {
          result.subtitles.slice(0, 8).forEach((sub) => {
            if (sub && sub.url) {
              subtitles.push({
                label: sub.lang || sub.language || 'Subtitle',
                lang: (sub.lang || sub.language || 'en').slice(0, 2).toLowerCase(),
                url: buildProxyUrl(sub.url, 'https://player.videasy.net/', 'https://player.videasy.net'),
              });
            }
          });
        }
      })
    );

    return { sources, subtitles };
  } finally {
    clearTimeout(timer);
  }
}

// --- 2C. VixSrc Provider (vixsrc.to) ---
async function scrapeVixSrc({ tmdbId, type, season, episode }) {
  const baseUrl = 'https://vixsrc.to';
  const pageUrl =
    type === 'tv'
      ? `${baseUrl}/api/tv/${tmdbId}/${season || 1}/${episode || 1}`
      : `${baseUrl}/api/movie/${tmdbId}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);
  try {
    const apiRes = await fetch(pageUrl, {
      headers: { 'User-Agent': UA, Referer: baseUrl, Origin: baseUrl },
      signal: controller.signal,
    });
    if (!apiRes.ok) return { sources: [], subtitles: [] };
    const sublink = await apiRes.json();
    if (!sublink || !sublink.src) return { sources: [], subtitles: [] };

    const embedRes = await fetch(`${baseUrl}${sublink.src}`, {
      headers: { 'User-Agent': UA, Referer: baseUrl, Origin: baseUrl },
      signal: controller.signal,
    });
    if (!embedRes.ok) return { sources: [], subtitles: [] };
    const html = await embedRes.text();

    const token = html.match(/token["']\s*:\s*["']([^"']+)/)?.[1];
    const expires = html.match(/expires["']\s*:\s*["']([^"']+)/)?.[1];
    const playlist = html.match(/url\s*:\s*["']([^"']+)/)?.[1];
    if (!token || !expires || !playlist) return { sources: [], subtitles: [] };

    const sep = playlist.includes('?') ? '&' : '?';
    const masterUrl = `${playlist}${sep}token=${token}&expires=${expires}&h=1`;

    return {
      sources: [
        {
          id: `vixsrc_${tmdbId}`,
          label: 'VixSrc Cloud (1080p HLS)',
          provider: 'vixsrc',
          quality: '1080p',
          type: 'hls',
          size: 'Adaptive HLS',
          url: buildProxyUrl(masterUrl, pageUrl, baseUrl),
        },
      ],
      subtitles: [],
    };
  } finally {
    clearTimeout(timer);
  }
}

// --- 2D. VidNest Provider (new.vidnest.fun custom alphabet base64 decryptor) ---
const VIDNEST_ALPHABET =
  'RB0fpH8ZEyVLkv7c2i6MAJ5u3IKFDxlS1NTsnGaqmXYdUrtzjwObCgQP94hoeW+/=';
const VIDNEST_MAP = (() => {
  const m = {};
  for (let i = 0; i < VIDNEST_ALPHABET.length; i++) m[VIDNEST_ALPHABET[i]] = i;
  return m;
})();

function decodeVidnestPayload(input) {
  if (!input || typeof input !== 'string') return null;
  let padded = input;
  const mod = padded.length % 4;
  if (mod !== 0) padded += '='.repeat(4 - mod);
  const bytes = [];
  for (let i = 0; i < padded.length; i += 4) {
    const c0 = VIDNEST_MAP[padded[i]] ?? 64;
    const c1 = VIDNEST_MAP[padded[i + 1]] ?? 64;
    const c2 = padded[i + 2] === '=' ? 64 : VIDNEST_MAP[padded[i + 2]] ?? 64;
    const c3 = padded[i + 3] === '=' ? 64 : VIDNEST_MAP[padded[i + 3]] ?? 64;
    bytes.push(((c0 << 2) | (c1 >> 4)) & 0xff);
    if (c2 !== 64) bytes.push((((c1 & 0x0f) << 4) | (c2 >> 2)) & 0xff);
    if (c3 !== 64) bytes.push((((c2 & 0x03) << 6) | c3) & 0xff);
  }
  return JSON.parse(Buffer.from(bytes).toString('utf8'));
}

async function scrapeVidNest({ tmdbId, type, season, episode }) {
  const servers = ['allmovies', 'hollymoviehd', 'purstream', 'klikxxi'];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);
  try {
    const sources = [];
    let idx = 0;

    await Promise.allSettled(
      servers.map(async (srv) => {
        const url =
          type === 'tv'
            ? `https://new.vidnest.fun/${srv}/tv/${tmdbId}/${season || 1}/${episode || 1}`
            : `https://new.vidnest.fun/${srv}/movie/${tmdbId}`;
        const res = await fetch(url, {
          headers: {
            'User-Agent': UA,
            Referer: 'https://vidnest.fun/',
            Origin: 'https://vidnest.fun',
          },
          signal: controller.signal,
        });
        if (!res.ok) return;
        const json = await res.json();
        if (!json || !json.data) return;
        const root = decodeVidnestPayload(json.data);
        if (!root) return;

        const rawList = Array.isArray(root.sources)
          ? root.sources
          : Array.isArray(root.streams)
          ? root.streams
          : root.url && typeof root.url === 'string'
          ? [{ url: root.url, quality: '1080p' }]
          : [];

        rawList.forEach((s) => {
          const streamUrl = s.url || s.file || s.link;
          if (!streamUrl || typeof streamUrl !== 'string') return;
          const isMp4 = streamUrl.includes('.mp4');
          const qual = s.quality || '1080p';
          sources.push({
            id: `vidnest_${srv}_${++idx}`,
            label: `VidNest ${srv.toUpperCase()} (${qual})`,
            provider: 'vidnest',
            quality: String(qual),
            type: isMp4 ? 'mp4' : 'hls',
            size: isMp4 ? 'Direct MP4' : 'Adaptive HLS',
            url: buildProxyUrl(streamUrl, 'https://vidnest.fun/', 'https://vidnest.fun'),
            downloadUrl: isMp4
              ? buildProxyUrl(streamUrl, 'https://vidnest.fun/', 'https://vidnest.fun')
              : '',
          });
        });
      })
    );

    return { sources, subtitles: [] };
  } finally {
    clearTimeout(timer);
  }
}

// --- 2E. CineSu Provider (cine.su) ---
async function scrapeCineSu({ tmdbId, type, season, episode }) {
  const baseUrl = 'https://cine.su';
  const manifestUrl =
    type === 'tv'
      ? `${baseUrl}/v1/stream/master/tv/${tmdbId}/${season || 1}/${episode || 1}.m3u8`
      : `${baseUrl}/v1/stream/master/movie/${tmdbId}.m3u8`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(manifestUrl, {
      method: 'HEAD',
      headers: {
        'User-Agent': UA,
        Referer: `${baseUrl}/en/watch`,
        Origin: baseUrl,
      },
      signal: controller.signal,
    });
    if (res.status !== 200) return { sources: [], subtitles: [] };
    return {
      sources: [
        {
          id: `cinesu_${tmdbId}`,
          label: 'CineSu Direct (1080p HLS)',
          provider: 'cinesu',
          quality: '1080p',
          type: 'hls',
          size: 'Adaptive HLS',
          url: buildProxyUrl(manifestUrl, `${baseUrl}/en/watch`, baseUrl),
        },
      ],
      subtitles: [],
    };
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================================
// 3. yousefkotp/Movies-and-Series-Scraper — MyCima Watch & Full-Season Download Scraper
// ============================================================================
async function scrapeMyCima({ title, type = 'movie', season = 1, episode = 1 }) {
  if (!title || !String(title).trim()) {
    return { watchEmbedUrl: '', seasonDownloads: [], matches: [] };
  }

  const cleanTitle = String(title).trim();
  const searchUrl =
    type === 'tv'
      ? `https://mycima.tube/search/${encodeURIComponent(cleanTitle)}/list/series`
      : `https://mycima.tube/search/${encodeURIComponent(cleanTitle)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);
  try {
    const searchRes = await fetch(searchUrl, {
      headers: { 'User-Agent': UA },
      signal: controller.signal,
    });
    if (!searchRes.ok) {
      return { watchEmbedUrl: '', seasonDownloads: [], matches: [] };
    }
    const html = await searchRes.text();

    // Extract Thumb--GridItem anchors: <div class="Thumb--GridItem"><a href="..." title="...">
    const gridRegex =
      /class=["'][^"']*Thumb--GridItem[^"']*["'][\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*title=["']([^"']+)["']/gi;
    const matches = [];
    let m;
    while ((m = gridRegex.exec(html)) !== null && matches.length < 6) {
      matches.push({ href: m[1], title: m[2] });
    }

    let watchEmbedUrl = '';
    const seasonDownloads = [];

    if (matches.length > 0) {
      const targetPageRes = await fetch(matches[0].href, {
        headers: { 'User-Agent': UA },
        signal: controller.signal,
      });
      if (targetPageRes.ok) {
        const targetHtml = await targetPageRes.text();

        // Check for watch iframe: <iframe name="watch" data-lazy-src="..." or src="...">
        const iframeMatch =
          targetHtml.match(/<iframe[^>]+name=["']watch["'][^>]+data-lazy-src=["']([^"']+)["']/i) ||
          targetHtml.match(/<iframe[^>]+data-lazy-src=["']([^"']+)["'][^>]+name=["']watch["']/i) ||
          targetHtml.match(/<iframe[^>]+name=["']watch["'][^>]+src=["']([^"']+)["']/i);

        if (iframeMatch && iframeMatch[1]) {
          watchEmbedUrl = iframeMatch[1].trim();
        }

        // Check for Season Download block: <ul class="Season--Download--Mycima--Single">
        const dlBlockMatch = targetHtml.match(
          /class=["'][^"']*Season--Download--Mycima--Single[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i
        );
        if (dlBlockMatch) {
          const block = dlBlockMatch[1];
          const linkRegex =
            /<a[^>]+href=["']([^"']+)["'][\s\S]*?(?:<resolution[^>]*>([^<]+)<\/resolution>)?/gi;
          let dl;
          let idx = 0;
          while ((dl = linkRegex.exec(block)) !== null && idx < 8) {
            idx++;
            seasonDownloads.push({
              id: `mycima_dl_${idx}`,
              quality: (dl[2] || '1080p').trim(),
              label: `MyCima Season ${season} Pack (${(dl[2] || 'HD').trim()})`,
              url: dl[1],
            });
          }
        }
      }
    }

    return {
      watchEmbedUrl,
      seasonDownloads,
      matches,
    };
  } catch {
    return { watchEmbedUrl: '', seasonDownloads: [], matches: [] };
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/scraper/resolve
 * Query params: tmdbId, type ('movie' | 'tv' | 'series'), season, episode, title, year
 * Runs 4texas4/movie-scraper (VidLink Native WASM), cinepro-org/core providers
 * (VidRock, Videasy, VixSrc, VidNest, CineSu), and yousefkotp MyCima scraper in parallel!
 */
router.get('/resolve', async (req, res) => {
  const tmdbId = String(req.query.tmdbId || req.query.id || '').trim();
  const rawType = String(req.query.type || 'movie').toLowerCase();
  const type = rawType === 'tv' || rawType === 'series' ? 'tv' : 'movie';
  const season = Math.max(1, Number(req.query.season || req.query.s || 1));
  const episode = Math.max(1, Number(req.query.episode || req.query.e || 1));
  const title = String(req.query.title || '').trim();
  const year = String(req.query.year || '').trim();

  if (!tmdbId && !title) {
    return res.status(400).json({ error: 'tmdbId or title is required' });
  }

  const cacheKey = `${type}:${tmdbId}:${season}:${episode}`;
  const cached = resolveCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return res.json({ ...cached.payload, cached: true });
  }

  const context = { tmdbId, type, season, episode, title, year };

  const tasks = tmdbId
    ? [
        scrapeVidlinkNative(context),
        scrapeVidRock(context),
        scrapeVideasy(context),
        scrapeVixSrc(context),
        scrapeVidNest(context),
        scrapeCineSu(context),
      ]
    : [];

  const [providerResults, mycimaResult] = await Promise.all([
    Promise.allSettled(tasks),
    title ? scrapeMyCima(context) : Promise.resolve({ watchEmbedUrl: '', seasonDownloads: [], matches: [] }),
  ]);

  const sources = [];
  const subtitles = [];
  const diagnostics = [];
  const providerNames = ['vidlink-native', 'vidrock', 'videasy', 'vixsrc', 'vidnest', 'cinesu'];

  providerResults.forEach((r, idx) => {
    const pName = providerNames[idx];
    if (r.status === 'fulfilled' && r.value) {
      if (Array.isArray(r.value.sources) && r.value.sources.length > 0) {
        sources.push(...r.value.sources);
        diagnostics.push({ provider: pName, status: 'ok', count: r.value.sources.length });
      } else {
        diagnostics.push({ provider: pName, status: 'empty', count: 0 });
      }
      if (Array.isArray(r.value.subtitles)) {
        subtitles.push(...r.value.subtitles);
      }
    } else if (r.status === 'rejected') {
      diagnostics.push({
        provider: pName,
        status: 'error',
        error: r.reason?.message || 'Failed',
      });
    }
  });

  // Deduplicate subtitles by label/url
  const seenSubUrls = new Set();
  const uniqueSubtitles = subtitles.filter((s) => {
    if (!s.url || seenSubUrls.has(s.url)) return false;
    seenSubUrls.add(s.url);
    return true;
  });

  const payload = {
    tmdbId: tmdbId ? Number(tmdbId) : null,
    type,
    season: type === 'tv' ? season : undefined,
    episode: type === 'tv' ? episode : undefined,
    sources,
    subtitles: uniqueSubtitles,
    mycima: mycimaResult,
    diagnostics,
  };

  if (sources.length > 0) {
    if (resolveCache.size > 300) {
      const oldest = resolveCache.keys().next().value;
      resolveCache.delete(oldest);
    }
    resolveCache.set(cacheKey, {
      payload,
      expiresAt: Date.now() + RESOLVE_CACHE_TTL_MS,
    });
  }

  return res.json(payload);
});

/**
 * GET /api/scraper/mycima
 * Direct endpoint for yousefkotp/Movies-and-Series-Scraper search & season pack downloads
 */
router.get('/mycima', async (req, res) => {
  const title = String(req.query.title || '').trim();
  const type = req.query.type === 'tv' || req.query.type === 'series' ? 'tv' : 'movie';
  const season = Math.max(1, Number(req.query.season || 1));
  const episode = Math.max(1, Number(req.query.episode || 1));

  if (!title) {
    return res.status(400).json({ error: 'title is required' });
  }
  const result = await scrapeMyCima({ title, type, season, episode });
  res.json(result);
});

/**
 * HLS & Media Segment Proxy (from 4texas4/movie-scraper + cinepro-org/core)
 * Rewrites .m3u8 master & media playlists so all segments, keys, and sub-manifests
 * inherit custom Referer/Origin headers and stream smoothly in native HTML5 + HLS.js.
 */
function fetchUpstream(targetUrl, customHeaders = {}, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Too many upstream redirects'));
    if (!isSafeExternalUrl(targetUrl)) {
      return reject(new Error('Blocked unsafe upstream URL'));
    }

    const client = targetUrl.startsWith('https') ? https : http;
    const req = client.get(
      targetUrl,
      {
        headers: {
          'User-Agent': UA,
          Accept: '*/*',
          ...customHeaders,
        },
        timeout: 12000,
      },
      (res) => {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          const loc = res.headers.location;
          const nextUrl = loc.startsWith('http') ? loc : new URL(loc, targetUrl).href;
          res.resume();
          return resolve(fetchUpstream(nextUrl, customHeaders, redirects + 1));
        }
        resolve(res);
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('Upstream request timed out'));
    });
    req.on('error', reject);
  });
}

function rewriteM3u8Manifest(body, manifestUrl, referer, origin) {
  const base = manifestUrl.split('?')[0];
  const baseDir = base.substring(0, base.lastIndexOf('/') + 1);
  const parsedOrigin = new URL(manifestUrl).origin;

  const toAbsolute = (rawUri) => {
    const t = rawUri.trim();
    if (t.startsWith('http://') || t.startsWith('https://')) return t;
    if (t.startsWith('//')) return `https:${t}`;
    if (t.startsWith('/')) return `${parsedOrigin}${t}`;
    return `${baseDir}${t}`;
  };

  return body
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      // Rewrite URI="..." attributes inside #EXT-X-KEY, #EXT-X-MAP, #EXT-X-MEDIA
      if (trimmed.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/g, (_match, uri) => {
          const abs = toAbsolute(uri);
          return `URI="${buildProxyUrl(abs, referer, origin)}"`;
        });
      }

      const abs = toAbsolute(trimmed);
      return buildProxyUrl(abs, referer, origin);
    })
    .join('\n');
}

router.get('/proxy', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const rawUrl = String(req.query.url || '').trim();
  const referer = String(req.query.referer || VIDLINK_REFERER).trim();
  const origin = String(req.query.origin || VIDLINK_ORIGIN).trim();

  if (!rawUrl || !isSafeExternalUrl(rawUrl)) {
    return res.status(400).json({ error: 'Valid external stream url is required' });
  }

  const customHeaders = {
    Referer: referer,
    Origin: origin,
  };
  if (req.headers.range) {
    customHeaders.Range = req.headers.range;
  }

  try {
    const upstream = await fetchUpstream(rawUrl, customHeaders);
    const ct = String(upstream.headers['content-type'] || '').toLowerCase();
    const cleanPath = rawUrl.split('?')[0];
    const isM3u8 =
      ct.includes('mpegurl') ||
      ct.includes('m3u8') ||
      /\.m3u8?$/i.test(cleanPath);

    if (isM3u8) {
      const chunks = [];
      for await (const chunk of upstream) chunks.push(chunk);
      const body = Buffer.concat(chunks).toString('utf8');

      // Verify it actually looks like an HLS playlist
      if (body.trimStart().startsWith('#EXTM3U')) {
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Cache-Control', 'no-store');
        return res.send(rewriteM3u8Manifest(body, rawUrl, referer, origin));
      }

      res.setHeader('Content-Type', ct || 'text/plain');
      return res.send(body);
    }

    res.statusCode = upstream.statusCode || 200;
    res.setHeader('Content-Type', ct || 'application/octet-stream');
    if (req.query.download === '1') {
      res.setHeader('Content-Disposition', 'attachment; filename="cinepulse-video.mp4"');
    }
    if (upstream.headers['content-length']) {
      res.setHeader('Content-Length', upstream.headers['content-length']);
    }
    if (upstream.headers['content-range']) {
      res.setHeader('Content-Range', upstream.headers['content-range']);
    }
    if (upstream.headers['accept-ranges']) {
      res.setHeader('Accept-Ranges', upstream.headers['accept-ranges']);
    }
    upstream.pipe(res);
  } catch (err) {
    if (!res.headersSent) {
      res.status(502).json({ error: err.message || 'Upstream stream proxy failed' });
    }
  }
});

module.exports = router;
