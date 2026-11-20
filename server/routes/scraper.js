'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const muxjs = require('mux.js');
const store = require('../db/store');
const { isSafeExternalUrl } = require('../middleware/security');

const router = express.Router();

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36';

// Server-side AES-256-GCM key to mask all upstream stream/subtitle URLs & headers from the browser
const PROXY_KEY = crypto
  .createHash('sha256')
  .update(process.env.SESSION_SECRET || `cinepulse_proxy_${__dirname}`)
  .digest();

function encryptProxyPayload(payload) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', PROXY_KEY, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

function decryptProxyPayload(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const buf = Buffer.from(token, 'base64url');
    if (buf.length < 29) return null;
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', PROXY_KEY, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch {
    return null;
  }
}

function buildProxyUrl(targetUrl, referer = '', origin = '') {
  if (!targetUrl || typeof targetUrl !== 'string') return '';
  const token = encryptProxyPayload({
    u: targetUrl,
    r: referer || '',
    o: origin || '',
  });
  return `/api/scraper/proxy?token=${encodeURIComponent(token)}`;
}

// In-memory stream resolution cache (15 minutes TTL)
const RESOLVE_CACHE_TTL_MS = 15 * 60 * 1000;
const resolveCache = new Map();

// ============================================================================
// 1. Primary Native WASM Stream Extractor
// ============================================================================
const UPSTREAM_A_REFERER = 'https://vidlink.pro/';
const UPSTREAM_A_ORIGIN = 'https://vidlink.pro';

let wasmReady = false;
let bootPromise = null;

function bootWasmEngine() {
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

      const scriptCode = fs.readFileSync(scriptPath, 'utf8');
      (0, eval)(scriptCode);

      if (typeof globalThis.Dm !== 'function') {
        throw new Error('WASM bridge constructor not found');
      }

      const go = new globalThis.Dm();
      const wasmBuf = fs.readFileSync(wasmPath);
      const { instance } = await WebAssembly.instantiate(wasmBuf, go.importObject);
      go.run(instance);

      await new Promise((r) => setTimeout(r, 450));
      if (typeof globalThis.getAdv !== 'function') {
        throw new Error('Token generator not initialized');
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

async function probeMp4UrlReachable(rawUrl, referer, origin) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const res = await fetch(rawUrl, {
      method: 'GET',
      headers: {
        'User-Agent': UA,
        Referer: referer,
        Origin: origin,
        Range: 'bytes=0-1',
      },
      signal: controller.signal,
    });
    const ct = String(res.headers.get('content-type') || '').toLowerCase();
    const ok =
      (res.status === 200 || res.status === 206) &&
      !ct.includes('text/html');
    const totalBytes = res.headers.get('content-range')
      ? Number(String(res.headers.get('content-range')).split('/')[1] || 0)
      : Number(res.headers.get('content-length') || 0);
    return { ok, status: res.status, totalBytes };
  } catch {
    return { ok: false, status: 0, totalBytes: 0 };
  } finally {
    clearTimeout(timer);
  }
}

async function scrapeEngineOne({ tmdbId, type, season, episode }) {
  await bootWasmEngine();
  const token = globalThis.getAdv(String(tmdbId));
  if (!token) throw new Error('Token generation returned null');

  const apiUrl =
    type === 'tv'
      ? `https://vidlink.pro/api/b/tv/${token}/${season || 1}/${episode || 1}?multiLang=0`
      : `https://vidlink.pro/api/b/movie/${token}?multiLang=0`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(apiUrl, {
      headers: {
        Referer: UPSTREAM_A_REFERER,
        Origin: UPSTREAM_A_ORIGIN,
        'User-Agent': UA,
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Upstream status ${res.status}`);
    const data = await res.json();
    const stream = data?.stream;
    if (!stream) throw new Error('No stream object');

    const sources = [];

    if (stream.playlist && typeof stream.playlist === 'string') {
      const customRef = stream.headers?.Referer || stream.headers?.referer || UPSTREAM_A_REFERER;
      const customOrig = stream.headers?.Origin || stream.headers?.origin || UPSTREAM_A_ORIGIN;
      const proxied = buildProxyUrl(stream.playlist, customRef, customOrig);
      sources.push({
        quality: '1080p',
        type: 'hls',
        size: 'Adaptive HLS',
        codec: 'H.264 / HLS',
        url: proxied,
        downloadUrl: `${proxied}&download=1`,
      });
    }

    if (stream.qualities && typeof stream.qualities === 'object') {
      const qualityOrder = ['4k', '2160', '1080', '720', '480', '360'];
      const entries = Object.entries(stream.qualities).sort((a, b) => {
        const ia = qualityOrder.indexOf(String(a[0]).toLowerCase().replace(/p$/, ''));
        const ib = qualityOrder.indexOf(String(b[0]).toLowerCase().replace(/p$/, ''));
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      });

      // Verify first MP4 quality is reachable; on timeout (status 0) keep it rather than dropping all links
      let vaultReachable = true;
      let probedBytes = 0;
      if (entries.length > 0) {
        const [, firstVal] = entries[0];
        if (firstVal && firstVal.url) {
          const isHakuna = String(firstVal.url).includes('hakunaymatata');
          const testRef =
            firstVal.headers?.Referer ||
            firstVal.headers?.referer ||
            (isHakuna ? 'https://filmboom.top/' : UPSTREAM_A_REFERER);
          const testOrig =
            firstVal.headers?.Origin ||
            firstVal.headers?.origin ||
            (isHakuna ? 'https://filmboom.top' : UPSTREAM_A_ORIGIN);
          const probe = await probeMp4UrlReachable(String(firstVal.url), testRef, testOrig);
          // Only drop if upstream explicitly rejected with 404/410/428/429 (not on slow timeout)
          vaultReachable = probe.ok || probe.status === 0;
          probedBytes = probe.totalBytes;
        }
      }

      if (vaultReachable) {
        for (const [qKey, qVal] of entries) {
          if (!qVal || !qVal.url) continue;
          const rawUrl = String(qVal.url);
          const isHls = qVal.type === 'hls' || /\.m3u8(\?|$)/i.test(rawUrl);
          const normQual = /^\d+$/.test(String(qKey)) ? `${qKey}p` : String(qKey).toUpperCase();
          const isHakuna = rawUrl.includes('hakunaymatata');
          const customRef =
            qVal.headers?.Referer ||
            qVal.headers?.referer ||
            (isHakuna ? 'https://filmboom.top/' : UPSTREAM_A_REFERER);
          const customOrig =
            qVal.headers?.Origin ||
            qVal.headers?.origin ||
            (isHakuna ? 'https://filmboom.top' : UPSTREAM_A_ORIGIN);
          const proxied = buildProxyUrl(rawUrl, customRef, customOrig);
          const formattedSize = qVal.size
            ? formatBytes(qVal.size)
            : probedBytes > 0
            ? formatBytes(probedBytes)
            : isHls
            ? 'Adaptive'
            : 'Direct MP4';

          sources.push({
            quality: normQual,
            type: isHls ? 'hls' : 'mp4',
            size: formattedSize,
            codec: qVal.codecName ? String(qVal.codecName).toUpperCase() : isHls ? 'HLS' : 'MP4',
            url: proxied,
            downloadUrl: `${proxied}&download=1`,
          });
        }
      }
    }

    const subtitles = Array.isArray(stream.captions)
      ? stream.captions
          .filter((c) => c && (c.url || c.file))
          .map((c) => ({
            label: c.language || c.label || c.lanName || 'Subtitle',
            lang: c.id || c.srclang || c.lan || 'en',
            url: buildProxyUrl(c.url || c.file, UPSTREAM_A_REFERER, UPSTREAM_A_ORIGIN),
          }))
      : [];

    return { sources, subtitles };
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================================
// 2. Multi-Engine Stream Resolvers (Engines 2..6)
// ============================================================================
const ENGINE2_PASSPHRASE = 'x7k9mPqT2rWvY8zA5bC3nF6hJ2lK4mN9';
const ENGINE2_BASE = 'https://vidrock.net/';
const ENGINE2_SUB_BASE = 'https://sub.vdrk.site';
const ENGINE2_PROXY_PREFIX = 'https://proxy.vidrock.store/';

function encryptEngine2ItemId(itemId) {
  const key = Buffer.from(ENGINE2_PASSPHRASE, 'utf8');
  const iv = Buffer.from(ENGINE2_PASSPHRASE.substring(0, 16), 'utf8');
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(itemId), 'utf8'), cipher.final()]);
  return encrypted
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function scrapeEngineTwo({ tmdbId, type, season, episode }) {
  const itemId = type === 'tv' ? `${tmdbId}_${season || 1}_${episode || 1}` : `${tmdbId}`;
  const encrypted = encryptEngine2ItemId(itemId);
  const apiUrl = `${ENGINE2_BASE}api/${type === 'tv' ? 'tv' : 'movie'}/${encrypted}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5500);
  try {
    const res = await fetch(apiUrl, {
      headers: {
        'User-Agent': UA,
        Accept: 'application/json, text/javascript, */*; q=0.01',
        Referer: ENGINE2_BASE,
        Origin: 'https://vidrock.net',
      },
      signal: controller.signal,
    });
    if (!res.ok) return { sources: [], subtitles: [] };
    const resp = await res.json();
    if (!resp || typeof resp !== 'object') return { sources: [], subtitles: [] };

    const sources = [];

    for (const [, stream] of Object.entries(resp)) {
      if (!stream || !stream.url) continue;

      if (stream.url.includes('hls2.vdrk.site')) {
        try {
          const cdnRes = await fetch(stream.url, {
            headers: { 'User-Agent': UA, Referer: ENGINE2_BASE },
            signal: controller.signal,
          });
          if (cdnRes.ok) {
            const cdnList = await cdnRes.json();
            if (Array.isArray(cdnList)) {
              for (const obj of cdnList) {
                if (!obj || !obj.url) continue;
                let finalUrl = obj.url;
                if (finalUrl.startsWith(ENGINE2_PROXY_PREFIX)) {
                  finalUrl = decodeURIComponent(
                    finalUrl.slice(ENGINE2_PROXY_PREFIX.length).replace(/^\//, '')
                  );
                }
                const isMp4 = finalUrl.includes('.mp4');
                const qual = obj.resolution ? `${String(obj.resolution).replace(/p$/i, '')}p` : '1080p';
                const proxied = buildProxyUrl(finalUrl, 'https://filmboom.top/', 'https://filmboom.top');
                sources.push({
                  quality: qual,
                  type: isMp4 ? 'mp4' : 'hls',
                  size: isMp4 ? 'Direct MP4' : 'Adaptive HLS',
                  url: proxied,
                  downloadUrl: `${proxied}&download=1`,
                });
              }
            }
          }
        } catch {
          // ignore CDN error
        }
        continue;
      }

      const isMp4 = stream.url.includes('.mp4');
      const proxied = buildProxyUrl(stream.url, ENGINE2_BASE, 'https://vidrock.net');
      sources.push({
        quality: '1080p',
        type: isMp4 ? 'mp4' : 'hls',
        size: isMp4 ? 'Direct MP4' : 'Adaptive HLS',
        url: proxied,
        downloadUrl: `${proxied}&download=1`,
      });
    }

    const subtitles = [];
    try {
      const subUrl =
        type === 'tv'
          ? `${ENGINE2_SUB_BASE}/v2/tv/${tmdbId}/${season || 1}/${episode || 1}`
          : `${ENGINE2_SUB_BASE}/v2/movie/${tmdbId}`;
      const subRes = await fetch(subUrl, {
        headers: { 'User-Agent': UA, Referer: ENGINE2_BASE },
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
                url: buildProxyUrl(s.file, subUrl, ENGINE2_SUB_BASE),
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

/**
 * Engine 4 (VixSrc): Resolves master .m3u8 AND parses its multi-resolution
 * variants (1080p, 720p, 480p, 360p) + embedded VTT subtitle tracks!
 */
async function scrapeEngineFour({ tmdbId, type, season, episode }) {
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
    const masterProxied = buildProxyUrl(masterUrl, pageUrl, baseUrl);

    const sources = [
      {
        quality: '1080p',
        type: 'hls',
        size: '890 MB',
        url: masterProxied,
        downloadUrl: `${masterProxied}&download=1&quality=1080`,
      },
    ];
    const subtitles = [];

    // Fetch master M3U8 to extract distinct resolution variants (720p, 480p, etc.) and subtitles
    try {
      const mRes = await fetch(masterUrl, {
        headers: { 'User-Agent': UA, Referer: pageUrl, Origin: baseUrl },
        signal: controller.signal,
      });
      if (mRes.ok) {
        const mText = await mRes.text();
        const base = masterUrl.split('?')[0];
        const baseDir = base.substring(0, base.lastIndexOf('/') + 1);
        const parsedOrigin = new URL(masterUrl).origin;
        const toAbs = (u) =>
          u.startsWith('http')
            ? u
            : u.startsWith('/')
            ? `${parsedOrigin}${u}`
            : `${baseDir}${u}`;

        // Extract variant streams (#EXT-X-STREAM-INF:...RESOLUTION=WxH)
        const lines = mText.split('\n');
        const parsedVariants = [];
        const seenRes = new Set();
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line.startsWith('#EXT-X-STREAM-INF:')) {
            const resMatch = line.match(/RESOLUTION=(\d+)x(\d+)/i);
            const avgBwMatch = line.match(/AVERAGE-BANDWIDTH=(\d+)/i);
            const bwMatch = line.match(/(?:^|[:,])BANDWIDTH=(\d+)/i);
            const bandwidth = Number(avgBwMatch?.[1] || bwMatch?.[1] || 0);
            const width = resMatch ? Number(resMatch[1]) : 0;
            const rawHeight = resMatch ? Number(resMatch[2]) : 0;
            const height =
              width >= 3800 || rawHeight >= 2000
                ? 2160
                : width >= 1800 || rawHeight >= 1000
                ? 1080
                : width >= 1200 || rawHeight >= 700
                ? 720
                : width >= 800 || rawHeight >= 460
                ? 480
                : rawHeight > 0
                ? 360
                : 0;
            const nextUri = (lines[i + 1] || '').trim();
            if (height > 0 && nextUri && !nextUri.startsWith('#')) {
              const qualLabel = `${height}p`;
              if (!seenRes.has(qualLabel)) {
                seenRes.add(qualLabel);
                // Estimate for a typical 100-min film; client refines with actual title runtime
                const estBytes = bandwidth > 0 ? Math.round((bandwidth / 8) * 6000) : 0;
                const estSize =
                  estBytes > 0
                    ? `~${formatBytes(estBytes)}`
                    : height >= 1080
                    ? '~1.4 GB'
                    : height >= 720
                    ? '~800 MB'
                    : height >= 480
                    ? '~450 MB'
                    : '~250 MB';
                parsedVariants.push({
                  quality: qualLabel,
                  type: 'hls',
                  size: estSize,
                  bandwidth,
                  url: masterProxied,
                  downloadUrl: `${masterProxied}&download=1&quality=${height}`,
                });
              }
            }
          } else if (line.startsWith('#EXT-X-MEDIA:TYPE=SUBTITLES')) {
            const uri = line.match(/URI="([^"]+)"/)?.[1];
            const name = line.match(/NAME="([^"]+)"/)?.[1] || 'Subtitle';
            const lang = line.match(/LANGUAGE="([^"]+)"/)?.[1] || 'en';
            if (uri) {
              subtitles.push({
                label: name,
                lang: lang.slice(0, 2).toLowerCase(),
                url: buildProxyUrl(toAbs(uri), pageUrl, baseUrl),
              });
            }
          }
        }
        if (parsedVariants.length > 0) {
          sources.length = 0;
          sources.push(...parsedVariants);
        }
      }
    } catch {
      // keep default 1080p master entry
    }

    return {
      sources,
      subtitles,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function scrapeEngineSix({ tmdbId, type, season, episode }) {
  const baseUrl = 'https://cine.su';
  const manifestUrl =
    type === 'tv'
      ? `${baseUrl}/v1/stream/master/tv/${tmdbId}/${season || 1}/${episode || 1}.m3u8`
      : `${baseUrl}/v1/stream/master/movie/${tmdbId}.m3u8`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
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
    const proxied = buildProxyUrl(manifestUrl, `${baseUrl}/en/watch`, baseUrl);
    return {
      sources: [
        {
          quality: '1080p',
          type: 'hls',
          size: 'Adaptive HLS',
          url: proxied,
          downloadUrl: `${proxied}&download=1`,
        },
      ],
      subtitles: [],
    };
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================================
// 2B. Exact TMDB/IMDB-Matched OpenSubtitles v3 Resolver (Accurate Series/Movie SRT)
// ============================================================================
const imdbIdCache = new Map();
const SUB_LANG_NAMES = {
  eng: 'English',
  spa: 'Español',
  fra: 'Français',
  fre: 'Français',
  ara: 'العربية',
  por: 'Português',
  pob: 'Português (BR)',
  deu: 'Deutsch',
  ger: 'Deutsch',
  ita: 'Italiano',
  jpn: '日本語',
  kor: '한국어',
  hin: 'हिन्दी',
  ind: 'Indonesian',
  tur: 'Türkçe',
  rus: 'Русский',
  zho: '中文',
  chi: '中文',
  ben: 'বাংলা',
  tgl: 'Filipino',
  nld: 'Nederlands',
  dut: 'Nederlands',
  pol: 'Polski',
  vie: 'Tiếng Việt',
  tha: 'ไทย',
};

async function resolveImdbIdFromTmdb(tmdbId, type) {
  if (!tmdbId) return null;
  const cacheKey = `${type}:${tmdbId}`;
  if (imdbIdCache.has(cacheKey)) return imdbIdCache.get(cacheKey);

  const key = (store.getSettings().tmdbApiKey || process.env.TMDB_API_KEY || '').trim();
  if (!key) return null;

  const endpoint =
    type === 'tv'
      ? `https://api.themoviedb.org/3/tv/${tmdbId}/external_ids`
      : `https://api.themoviedb.org/3/movie/${tmdbId}/external_ids`;
  const isBearer = key.length > 50 || key.startsWith('eyJ');
  const url = isBearer ? endpoint : `${endpoint}?api_key=${encodeURIComponent(key)}`;
  const headers = { Accept: 'application/json' };
  if (isBearer) headers.Authorization = `Bearer ${key}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json();
    const imdbId = typeof data.imdb_id === 'string' && data.imdb_id.startsWith('tt') ? data.imdb_id : null;
    if (imdbId) {
      if (imdbIdCache.size > 500) imdbIdCache.delete(imdbIdCache.keys().next().value);
      imdbIdCache.set(cacheKey, imdbId);
    }
    return imdbId;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchExactOpenSubtitles({ tmdbId, type, season, episode }) {
  const imdbId = await resolveImdbIdFromTmdb(tmdbId, type);
  if (!imdbId) return { sources: [], subtitles: [] };

  const subEndpoint =
    type === 'tv'
      ? `https://opensubtitles-v3.strem.io/subtitles/series/${imdbId}:${season || 1}:${episode || 1}.json`
      : `https://opensubtitles-v3.strem.io/subtitles/movie/${imdbId}.json`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(subEndpoint, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) return { sources: [], subtitles: [] };
    const data = await res.json();
    const list = Array.isArray(data?.subtitles) ? data.subtitles : [];
    if (list.length === 0) return { sources: [], subtitles: [] };

    // Prefer single-file BluRay/WEB-DL/1080p/720p releases, skip split CD1/CD2 releases
    const scoreRelease = (s) => {
      const name = String(s.subtitleFileName || s.movieReleaseName || '').toLowerCase();
      let score = 0;
      if (/\bcd1\b|\bcd2\b|disc\s*1|disc\s*2/.test(name)) score -= 50;
      if (/web-?dl|webrip|bluray|bdrip|brrip/.test(name)) score += 20;
      if (/1080p|720p/.test(name)) score += 10;
      if (s.SubEncoding === 'UTF-8') score += 5;
      return score;
    };

    const byLang = new Map();
    for (const item of list) {
      if (!item || !item.url || !item.lang) continue;
      const code = String(item.lang).toLowerCase().slice(0, 3);
      const label = SUB_LANG_NAMES[code];
      if (!label) continue;
      const sc = scoreRelease(item);
      const existing = byLang.get(label);
      if (!existing || sc > existing.score) {
        byLang.set(label, {
          score: sc,
          label,
          lang: code.slice(0, 2),
          url: buildProxyUrl(item.url, 'https://opensubtitles-v3.strem.io/', 'https://opensubtitles-v3.strem.io'),
        });
      }
    }

    const subtitles = Array.from(byLang.values())
      .sort((a, b) => (a.label === 'English' ? -1 : b.label === 'English' ? 1 : a.label.localeCompare(b.label)))
      .map(({ label, lang, url }) => ({ label, lang, url }));

    return { sources: [], subtitles };
  } catch {
    return { sources: [], subtitles: [] };
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================================
// 3. Season Pack & Episode Archive Scraper (Engine 7)
// ============================================================================
async function scrapeSeasonArchives({ title, type = 'movie', season = 1 }) {
  if (!title || !String(title).trim()) {
    return { seasonDownloads: [] };
  }

  const cleanTitle = String(title).trim();
  const searchUrl =
    type === 'tv'
      ? `https://mycima.tube/search/${encodeURIComponent(cleanTitle)}/list/series`
      : `https://mycima.tube/search/${encodeURIComponent(cleanTitle)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const searchRes = await fetch(searchUrl, {
      headers: { 'User-Agent': UA },
      signal: controller.signal,
    });
    if (!searchRes.ok) return { seasonDownloads: [] };
    const html = await searchRes.text();

    const gridRegex =
      /class=["'][^"']*Thumb--GridItem[^"']*["'][\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*title=["']([^"']+)["']/gi;
    const matches = [];
    let m;
    while ((m = gridRegex.exec(html)) !== null && matches.length < 4) {
      matches.push({ href: m[1], title: m[2] });
    }

    const seasonDownloads = [];

    if (matches.length > 0) {
      const targetPageRes = await fetch(matches[0].href, {
        headers: { 'User-Agent': UA },
        signal: controller.signal,
      });
      if (targetPageRes.ok) {
        const targetHtml = await targetPageRes.text();
        const dlBlockMatch = targetHtml.match(
          /class=["'][^"']*Season--Download--Mycima--Single[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i
        );
        if (dlBlockMatch) {
          const block = dlBlockMatch[1];
          const linkRegex =
            /<a[^>]+href=["']([^"']+)["'][\s\S]*?(?:<resolution[^>]*>([^<]+)<\/resolution>)?/gi;
          let dl;
          let idx = 0;
          while ((dl = linkRegex.exec(block)) !== null && idx < 6) {
            idx++;
            const qual = (dl[2] || '1080p').trim();
            seasonDownloads.push({
              id: `season_pack_${idx}`,
              quality: qual,
              label: `Season ${season} Full Pack — Server ${idx} (${qual})`,
              url: dl[1],
            });
          }
        }
      }
    }

    return { seasonDownloads };
  } catch {
    return { seasonDownloads: [] };
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/scraper/resolve
 * Returns white-labeled, encrypted proxy sources labeled cleanly as:
 * "Server 1 (1080p)", "Server 2 (720p)", "Server 3 (480p)", etc.
 * Zero upstream provider names or raw source URLs are ever exposed to the client.
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
        scrapeEngineOne(context),
        scrapeEngineFour(context),
        scrapeEngineTwo(context),
        scrapeEngineSix(context),
        fetchExactOpenSubtitles(context),
      ]
    : [];

  const [providerResults, archiveResult] = await Promise.all([
    Promise.allSettled(tasks),
    title && type === 'tv'
      ? scrapeSeasonArchives(context)
      : Promise.resolve({ seasonDownloads: [] }),
  ]);

  const rawSources = [];
  const subtitles = [];

  // Prioritize accurate subtitles:
  // 1) Engine 4 embedded stream-synced subs (index 1)
  // 2) Exact IMDB+Season+Episode OpenSubtitles v3 (index 4)
  // 3) Engine 2 (index 2) & Engine 1 (index 0) as fallback for additional languages
  const subtitlePriorityOrder = [1, 4, 2, 0, 3];

  providerResults.forEach((r) => {
    if (r.status === 'fulfilled' && r.value) {
      if (Array.isArray(r.value.sources) && r.value.sources.length > 0) {
        rawSources.push(...r.value.sources);
      }
    }
  });

  subtitlePriorityOrder.forEach((idx) => {
    const r = providerResults[idx];
    if (r && r.status === 'fulfilled' && r.value && Array.isArray(r.value.subtitles)) {
      subtitles.push(...r.value.subtitles);
    }
  });

  // Sort direct MP4 mirrors first, then HLS mirrors, ordered by resolution descending
  const parseResScore = (q) => {
    const s = String(q || '').toLowerCase();
    if (s.includes('4k') || s.includes('2160')) return 2160;
    const m = s.match(/(\d{3,4})/);
    return m ? Number(m[1]) : 720;
  };
  rawSources.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'mp4' ? -1 : 1;
    return parseResScore(b.quality) - parseResScore(a.quality);
  });

  // Assign clean, white-labeled sequential names: "Server 1 (1080p)", "Server 2 (720p)", etc.
  const sources = rawSources.map((src, index) => {
    const serverNum = index + 1;
    const qual = src.quality || '1080p';
    return {
      id: `srv_${tmdbId || 'custom'}_${season}_${episode}_${serverNum}`,
      label: `Server ${serverNum} (${qual})`,
      quality: qual,
      type: src.type === 'mp4' ? 'mp4' : 'hls',
      size: src.size || (src.type === 'mp4' ? 'Direct MP4' : 'Adaptive HLS'),
      bandwidth: src.bandwidth || 0,
      codec: src.codec || (src.type === 'mp4' ? 'MP4' : 'HLS'),
      url: src.url,
      downloadUrl: src.downloadUrl || `${src.url}&download=1`,
    };
  });

  // Deduplicate subtitles by label + lang
  const seenSubKeys = new Set();
  const uniqueSubtitles = subtitles.filter((s) => {
    const key = `${String(s.label).toLowerCase()}_${String(s.lang).toLowerCase()}`;
    if (!s.url || seenSubKeys.has(key)) return false;
    seenSubKeys.add(key);
    return true;
  });

  const payload = {
    tmdbId: tmdbId ? Number(tmdbId) : null,
    type,
    season: type === 'tv' ? season : undefined,
    episode: type === 'tv' ? episode : undefined,
    sources,
    subtitles: uniqueSubtitles,
    seasonPacks: archiveResult.seasonDownloads || [],
    ...(req.query.diag === '1'
      ? {
          diag: providerResults.map((r, i) => ({
            e: i + 1,
            st: r.status,
            n: r.status === 'fulfilled' ? r.value?.sources?.length || 0 : 0,
            s: r.status === 'fulfilled' ? r.value?.subtitles?.length || 0 : 0,
            err: r.status === 'rejected' ? String(r.reason?.message || '').slice(0, 80) : '',
          })),
        }
      : {}),
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

// ============================================================================
// Encrypted HLS & Media Segment Proxy + On-the-Fly HLS-to-Video File Downloader
// ============================================================================
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

async function fetchUpstreamBuffer(targetUrl, customHeaders = {}) {
  const stream = await fetchUpstream(targetUrl, customHeaders);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function resolveRelativeUrl(rawUri, manifestUrl) {
  const base = manifestUrl.split('?')[0];
  const baseDir = base.substring(0, base.lastIndexOf('/') + 1);
  const parsedOrigin = new URL(manifestUrl).origin;
  const t = rawUri.trim();
  if (t.startsWith('http://') || t.startsWith('https://')) return t;
  if (t.startsWith('//')) return `https:${t}`;
  if (t.startsWith('/')) return `${parsedOrigin}${t}`;
  return `${baseDir}${t}`;
}

function rewriteM3u8Manifest(body, manifestUrl, referer, origin, onlyQuality = '') {
  let workingBody = body;

  // When onlyQuality is requested (for ffmpeg MP4 remux), keep only the closest video variant
  if (onlyQuality && workingBody.includes('#EXT-X-STREAM-INF:')) {
    const targetH = Number(String(onlyQuality).replace(/\D/g, '')) || 1080;
    const rawLines = workingBody.split('\n');
    const variants = [];
    for (let i = 0; i < rawLines.length; i++) {
      const l = rawLines[i].trim();
      if (l.startsWith('#EXT-X-STREAM-INF:')) {
        const resM = l.match(/RESOLUTION=\d+x(\d+)/i);
        const h = resM ? Number(resM[1]) : 720;
        variants.push({ idx: i, height: h });
      }
    }
    if (variants.length > 0) {
      variants.sort((a, b) => Math.abs(a.height - targetH) - Math.abs(b.height - targetH));
      const keepIdx = variants[0].idx;
      const filtered = [];
      for (let i = 0; i < rawLines.length; i++) {
        const l = rawLines[i].trim();
        if (l.startsWith('#EXT-X-MEDIA:TYPE=SUBTITLES')) continue;
        if (l.startsWith('#EXT-X-STREAM-INF:')) {
          if (i === keepIdx) {
            filtered.push(rawLines[i]);
            if (rawLines[i + 1] !== undefined) filtered.push(rawLines[i + 1]);
          }
          i++; // skip URI line
          continue;
        }
        filtered.push(rawLines[i]);
      }
      workingBody = filtered.join('\n');
    }
  }

  const hasEnglishAudio = /#EXT-X-MEDIA:TYPE=AUDIO[^\n]*(?:LANGUAGE="en|NAME="English)/i.test(
    workingBody
  );

  return workingBody
    .split('\n')
    .map((line) => {
      let currentLine = line;
      const trimmed = currentLine.trim();
      if (!trimmed) return currentLine;

      // Prefer English audio track as DEFAULT=YES,AUTOSELECT=YES when present
      if (hasEnglishAudio && trimmed.startsWith('#EXT-X-MEDIA:TYPE=AUDIO')) {
        const isEng = /LANGUAGE="en|NAME="English/i.test(trimmed);
        currentLine = currentLine
          .replace(/DEFAULT=(YES|NO)/gi, `DEFAULT=${isEng ? 'YES' : 'NO'}`)
          .replace(/AUTOSELECT=(YES|NO)/gi, `AUTOSELECT=${isEng ? 'YES' : 'NO'}`);
      }

      if (trimmed.startsWith('#')) {
        return currentLine.replace(/URI="([^"]+)"/g, (_match, uri) => {
          const abs = resolveRelativeUrl(uri, manifestUrl);
          return `URI="${buildProxyUrl(abs, referer, origin)}"`;
        });
      }

      const abs = resolveRelativeUrl(trimmed, manifestUrl);
      return buildProxyUrl(abs, referer, origin);
    })
    .join('\n');
}

async function parseHlsMediaSegments(playlistBody, playlistUrl, customHeaders) {
  const lines = playlistBody.split('\n');
  let aesKey = null;
  let aesIv = null;
  let mediaSequence = 0;
  const keyCache = new Map();
  const segments = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
      mediaSequence = Number(line.split(':')[1]) || 0;
    } else if (line.startsWith('#EXT-X-KEY:')) {
      const method = line.match(/METHOD=([^,]+)/i)?.[1];
      const uri = line.match(/URI="([^"]+)"/i)?.[1];
      const ivHex = line.match(/IV=0x([0-9A-Fa-f]+)/i)?.[1];
      if (method === 'AES-128' && uri) {
        const keyUrl = resolveRelativeUrl(uri, playlistUrl);
        if (!keyCache.has(keyUrl)) {
          keyCache.set(keyUrl, await fetchUpstreamBuffer(keyUrl, customHeaders));
        }
        aesKey = keyCache.get(keyUrl);
        aesIv = ivHex ? Buffer.from(ivHex.padStart(32, '0'), 'hex') : null;
      } else if (method === 'NONE') {
        aesKey = null;
        aesIv = null;
      }
    } else if (!line.startsWith('#')) {
      segments.push({
        seq: mediaSequence + segments.length,
        url: resolveRelativeUrl(line, playlistUrl),
        key: aesKey,
        iv: aesIv,
      });
    }
  }
  return segments;
}

async function fetchDecryptedSegment(seg, customHeaders) {
  let segBuf = await fetchUpstreamBuffer(seg.url, customHeaders);
  if (seg.key && seg.key.length === 16) {
    let ivBuf = seg.iv;
    if (!ivBuf) {
      ivBuf = Buffer.alloc(16, 0);
      ivBuf.writeUInt32BE(seg.seq, 12);
    }
    const decipher = crypto.createDecipheriv('aes-128-cbc', seg.key, ivBuf);
    segBuf = Buffer.concat([decipher.update(segBuf), decipher.final()]);
  }
  return segBuf;
}

// Standard MPEG-2 CRC32 (poly 0x04C11DB7, MSB-first) for clean PAT/PMT generation
function mpegCrc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i] << 24;
    for (let b = 0; b < 8; b++) {
      crc = (crc & 0x80000000) ? ((crc << 1) ^ 0x04c11db7) >>> 0 : (crc << 1) >>> 0;
    }
  }
  return crc >>> 0;
}

function buildPatPacket(pmtPid = 0x1000, cc = 0) {
  const pkt = Buffer.alloc(188, 0xff);
  pkt[0] = 0x47;
  pkt[1] = 0x40;
  pkt[2] = 0x00;
  pkt[3] = 0x10 | (cc & 0x0f);
  pkt[4] = 0x00;
  const section = Buffer.from([
    0x00, 0xb0, 0x0d, 0x00, 0x01, 0xc1, 0x00, 0x00, 0x00, 0x01,
    0xe0 | ((pmtPid >> 8) & 0x1f), pmtPid & 0xff,
  ]);
  section.copy(pkt, 5);
  pkt.writeUInt32BE(mpegCrc32(section), 5 + section.length);
  return pkt;
}

function buildPmtPacket(pmtPid = 0x1000, videoPid = 0x0100, audioPid = 0x0101, cc = 0) {
  const pkt = Buffer.alloc(188, 0xff);
  pkt[0] = 0x47;
  pkt[1] = 0x40 | ((pmtPid >> 8) & 0x1f);
  pkt[2] = pmtPid & 0xff;
  pkt[3] = 0x10 | (cc & 0x0f);
  pkt[4] = 0x00;
  const section = Buffer.from([
    0x02, 0xb0, 0x17, 0x00, 0x01, 0xc1, 0x00, 0x00,
    0xe0 | ((videoPid >> 8) & 0x1f), videoPid & 0xff,
    0xf0, 0x00,
    // Video: H.264 (0x1B) on videoPid
    0x1b, 0xe0 | ((videoPid >> 8) & 0x1f), videoPid & 0xff, 0xf0, 0x00,
    // Audio: AAC ADTS (0x0F) on audioPid
    0x0f, 0xe0 | ((audioPid >> 8) & 0x1f), audioPid & 0xff, 0xf0, 0x00,
  ]);
  section.copy(pkt, 5);
  pkt.writeUInt32BE(mpegCrc32(section), 5 + section.length);
  return pkt;
}

/**
 * Combines separate Video-only and Audio-only MPEG-TS segments (which often collide on PID 0x0100)
 * into a single tightly interleaved valid MPEG-TS stream (Video PID 0x0100, Audio PID 0x0101)
 * with unified PAT/PMT so both VLC and Windows Media Player play smoothly in sync.
 */
function combineVideoAudioTs(vBuf, aBuf, seq = 0) {
  if (!aBuf || aBuf.length === 0) return vBuf;

  const vPkts = [];
  for (let off = 0; off + 188 <= vBuf.length; off += 188) {
    if (vBuf[off] !== 0x47) continue;
    const pid = ((vBuf[off + 1] & 0x1f) << 8) | vBuf[off + 2];
    if (pid === 0 || pid === 17 || pid === 0x1000) continue;
    const pkt = Buffer.from(vBuf.subarray(off, off + 188));
    pkt[1] = (pkt[1] & 0xe0) | 0x01;
    pkt[2] = 0x00;
    vPkts.push(pkt);
  }

  const aPkts = [];
  for (let off = 0; off + 188 <= aBuf.length; off += 188) {
    if (aBuf[off] !== 0x47) continue;
    const pid = ((aBuf[off + 1] & 0x1f) << 8) | aBuf[off + 2];
    if (pid === 0 || pid === 17 || pid === 0x1000) continue;
    const pkt = Buffer.from(aBuf.subarray(off, off + 188));
    pkt[1] = (pkt[1] & 0xe0) | 0x01;
    pkt[2] = 0x01;
    aPkts.push(pkt);
  }

  // Interleave video and audio packets evenly so mux.js aligns audio & video frames cleanly
  const out = [
    buildPatPacket(0x1000, seq & 0x0f),
    buildPmtPacket(0x1000, 0x0100, 0x0101, seq & 0x0f),
  ];
  const ratio = aPkts.length > 0 ? Math.max(1, Math.floor(vPkts.length / aPkts.length)) : vPkts.length;
  let vi = 0;
  let ai = 0;
  while (vi < vPkts.length || ai < aPkts.length) {
    for (let k = 0; k < ratio && vi < vPkts.length; k++) {
      out.push(vPkts[vi++]);
    }
    if (ai < aPkts.length) {
      out.push(aPkts[ai++]);
    }
  }
  return Buffer.concat(out);
}

/**
 * Pure-JavaScript HLS (.m3u8) -> Fragmented MP4 (.mp4) live downloader using mux.js.
 * Zero child processes, zero external binaries (works reliably on Bot-Hosting.net, Linux, Docker, Windows).
 */
async function streamHlsAsVideoDownload({
  manifestBody,
  manifestUrl,
  customHeaders,
  requestedQuality,
  filename,
  req,
  res,
}) {
  let mediaPlaylistBody = manifestBody;
  let mediaPlaylistUrl = manifestUrl;
  let audioSegments = [];

  // If this is a master playlist (#EXT-X-STREAM-INF), select the best matching video variant + English audio track
  if (manifestBody.includes('#EXT-X-STREAM-INF:')) {
    const lines = manifestBody.split('\n');
    const variants = [];
    const audioTracks = [];

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i].trim();
      if (l.startsWith('#EXT-X-STREAM-INF:')) {
        const resMatch = l.match(/RESOLUTION=(\d+)x(\d+)/i);
        const w = resMatch ? Number(resMatch[1]) : 0;
        const h = resMatch ? Number(resMatch[2]) : 720;
        const normH =
          w >= 3800 || h >= 2000
            ? 2160
            : w >= 1800 || h >= 1000
            ? 1080
            : w >= 1200 || h >= 700
            ? 720
            : w >= 800 || h >= 460
            ? 480
            : 360;
        const nextLine = (lines[i + 1] || '').trim();
        if (nextLine && !nextLine.startsWith('#')) {
          variants.push({
            height: normH,
            url: resolveRelativeUrl(nextLine, manifestUrl),
          });
        }
      } else if (l.startsWith('#EXT-X-MEDIA:TYPE=AUDIO')) {
        const uri = l.match(/URI="([^"]+)"/i)?.[1];
        if (uri) {
          const isEng = /LANGUAGE="en|NAME="English/i.test(l);
          audioTracks.push({
            isEng,
            url: resolveRelativeUrl(uri, manifestUrl),
          });
        }
      }
    }

    if (variants.length > 0) {
      const targetHeight = Number(String(requestedQuality || '1080').replace(/\D/g, '')) || 1080;
      variants.sort(
        (a, b) => Math.abs(a.height - targetHeight) - Math.abs(b.height - targetHeight)
      );
      mediaPlaylistUrl = variants[0].url;
      const buf = await fetchUpstreamBuffer(mediaPlaylistUrl, customHeaders);
      mediaPlaylistBody = buf.toString('utf8');
    }

    if (audioTracks.length > 0) {
      const chosenAudio = audioTracks.find((a) => a.isEng) || audioTracks[0];
      try {
        const aBuf = await fetchUpstreamBuffer(chosenAudio.url, customHeaders);
        audioSegments = await parseHlsMediaSegments(
          aBuf.toString('utf8'),
          chosenAudio.url,
          customHeaders
        );
      } catch {
        audioSegments = [];
      }
    }
  }

  const videoSegments = await parseHlsMediaSegments(
    mediaPlaylistBody,
    mediaPlaylistUrl,
    customHeaders
  );

  const safeFilename = (filename || 'cinepulse-video.mp4')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.ts$/i, '.mp4');

  res.statusCode = 200;
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
  res.setHeader('Cache-Control', 'no-store');

  let aborted = false;
  res.on('close', () => {
    if (!res.writableEnded) aborted = true;
  });

  const transmuxer = new muxjs.mp4.Transmuxer({
    remux: true,
    keepOriginalTimestamps: false,
  });
  if (typeof transmuxer.setBaseMediaDecodeTime === 'function') {
    transmuxer.setBaseMediaDecodeTime(0);
  }

  let wroteInit = false;
  const pendingWrites = [];

  transmuxer.on('data', (segment) => {
    if (aborted || res.writableEnded) return;
    if (!wroteInit && segment.initSegment && segment.initSegment.byteLength > 0) {
      pendingWrites.push(Buffer.from(segment.initSegment));
      wroteInit = true;
    }
    if (segment.data && segment.data.byteLength > 0) {
      pendingWrites.push(Buffer.from(segment.data));
    }
  });

  const flushWrites = async () => {
    while (pendingWrites.length > 0) {
      if (aborted || res.writableEnded) return;
      const chunk = pendingWrites.shift();
      const ok = res.write(chunk);
      if (!ok) {
        await new Promise((resolve) => {
          res.once('drain', resolve);
          res.once('close', resolve);
        });
      }
    }
  };

  for (let i = 0; i < videoSegments.length; i++) {
    if (aborted || res.writableEnded) break;
    try {
      const [vBuf, aBuf] = await Promise.all([
        fetchDecryptedSegment(videoSegments[i], customHeaders),
        audioSegments[i]
          ? fetchDecryptedSegment(audioSegments[i], customHeaders).catch(() => null)
          : Promise.resolve(null),
      ]);
      const combinedTs = combineVideoAudioTs(vBuf, aBuf, i);
      transmuxer.push(new Uint8Array(combinedTs));
      transmuxer.flush();
      await flushWrites();
    } catch {
      // skip faulty segment and continue
    }
  }

  if (!res.writableEnded) {
    res.end();
  }
}

function convertTextToSrt(rawText) {
  const clean = String(rawText || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  const blocks = clean.split(/\n{2,}/);
  const cues = [];
  let idx = 1;

  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;
    if (/^(WEBVTT|NOTE|STYLE|REGION)/i.test(lines[0])) continue;

    // Find the timecode line (supports both VTT 00:00:01.200 / 01:02.300 and SRT 00:00:01,200)
    const timeIdx = lines.findIndex((l) => l.includes('-->'));
    if (timeIdx === -1) continue;

    const rawTime = lines[timeIdx];
    const parts = rawTime.split('-->');
    if (parts.length < 2) continue;

    const normTime = (t) => {
      const token = t.trim().split(/\s+/)[0].replace('.', ',');
      const segs = token.split(':');
      if (segs.length === 2) {
        return `00:${segs[0].padStart(2, '0')}:${segs[1]}`;
      }
      if (segs.length === 3) {
        return `${segs[0].padStart(2, '0')}:${segs[1].padStart(2, '0')}:${segs[2]}`;
      }
      return token;
    };

    const textLines = lines
      .slice(timeIdx + 1)
      .map((l) => l.replace(/<\/?[^>]+>/g, '').trim())
      .filter(Boolean);
    if (textLines.length === 0) continue;

    cues.push(`${idx}\r\n${normTime(parts[0])} --> ${normTime(parts[1])}\r\n${textLines.join('\r\n')}`);
    idx++;
  }

  return cues.join('\r\n\r\n') + (cues.length ? '\r\n' : '');
}

function convertTextToVtt(rawText) {
  let text = String(rawText || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  if (!text.trimStart().startsWith('WEBVTT')) {
    text = 'WEBVTT\n\n' + text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  }
  return text;
}

router.get('/proxy', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Expose-Headers',
    'Content-Length, Content-Range, Accept-Ranges, Content-Disposition'
  );

  let rawUrl = '';
  let referer = UPSTREAM_A_REFERER;
  let origin = UPSTREAM_A_ORIGIN;

  if (req.query.token) {
    const decoded = decryptProxyPayload(String(req.query.token));
    if (!decoded || !decoded.u) {
      return res.status(400).json({ error: 'Invalid stream token' });
    }
    rawUrl = String(decoded.u).trim();
    if (decoded.r) referer = String(decoded.r).trim();
    if (decoded.o) origin = String(decoded.o).trim();
  } else if (req.query.url) {
    rawUrl = String(req.query.url).trim();
    if (req.query.referer) referer = String(req.query.referer).trim();
    if (req.query.origin) origin = String(req.query.origin).trim();
  }

  if (!rawUrl || !isSafeExternalUrl(rawUrl)) {
    return res.status(400).json({ error: 'Valid stream token is required' });
  }

  const isDownload = req.query.download === '1';
  const requestedFilename = String(req.query.filename || '').trim();
  const wantsSrt =
    String(req.query.format || '').toLowerCase() === 'srt' ||
    /\.srt$/i.test(requestedFilename);

  const customHeaders = {
    Referer: referer,
    Origin: origin,
  };
  if (req.headers.range && !isDownload) {
    customHeaders.Range = req.headers.range;
  } else if (req.headers.range && isDownload) {
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
    const isSubtitle =
      wantsSrt ||
      /\.vtt$|\.srt$/i.test(cleanPath) ||
      ct.includes('text/vtt') ||
      ct.includes('subrip') ||
      rawUrl.includes('subs5.strem.io') ||
      rawUrl.includes('sub.vdrk.site');

    if (isM3u8) {
      const chunks = [];
      for await (const chunk of upstream) chunks.push(chunk);
      const body = Buffer.concat(chunks).toString('utf8');

      if (body.trimStart().startsWith('#EXTM3U')) {
        // If this is an HLS Subtitle playlist (.m3u8 pointing to .vtt segments) and user wants SRT/subtitle
        const isSubtitlePlaylist =
          wantsSrt || (/\.vtt(\?|$|\n)/i.test(body) && !body.includes('#EXT-X-STREAM-INF'));
        if (isSubtitlePlaylist && (isDownload || wantsSrt)) {
          const segUrls = body
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l && !l.startsWith('#'))
            .map((l) => resolveRelativeUrl(l, rawUrl));
          const stitched = [];
          for (const su of segUrls) {
            try {
              const sBuf = await fetchUpstreamBuffer(su, { Referer: referer, Origin: origin });
              stitched.push(sBuf.toString('utf8'));
            } catch {
              // ignore individual segment failure
            }
          }
          const combinedRaw = stitched.join('\n\n');
          const outText = wantsSrt ? convertTextToSrt(combinedRaw) : convertTextToVtt(combinedRaw);
          res.statusCode = 200;
          res.setHeader(
            'Content-Type',
            wantsSrt ? 'application/x-subrip; charset=utf-8' : 'text/vtt; charset=utf-8'
          );
          if (isDownload) {
            const safeName = requestedFilename
              ? requestedFilename.replace(/[^a-zA-Z0-9._-]/g, '_')
              : wantsSrt
              ? 'cinepulse-subtitle.srt'
              : 'cinepulse-subtitle.vtt';
            res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
          }
          return res.send(outText);
        }

        if (isDownload) {
          return await streamHlsAsVideoDownload({
            manifestBody: body,
            manifestUrl: rawUrl,
            customHeaders: { Referer: referer, Origin: origin },
            requestedQuality: req.query.quality,
            filename: requestedFilename || 'cinepulse-video.mp4',
            req,
            res,
          });
        }
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Cache-Control', 'no-store');
        return res.send(
          rewriteM3u8Manifest(body, rawUrl, referer, origin, String(req.query.onlyQuality || ''))
        );
      }

      res.setHeader('Content-Type', ct || 'text/plain');
      return res.send(body);
    }

    if (isSubtitle) {
      const chunks = [];
      for await (const chunk of upstream) chunks.push(chunk);
      const rawSubText = Buffer.concat(chunks).toString('utf8');
      const outText = wantsSrt ? convertTextToSrt(rawSubText) : convertTextToVtt(rawSubText);
      res.statusCode = 200;
      res.setHeader(
        'Content-Type',
        wantsSrt ? 'application/x-subrip; charset=utf-8' : 'text/vtt; charset=utf-8'
      );
      if (isDownload) {
        const safeName = requestedFilename
          ? requestedFilename.replace(/[^a-zA-Z0-9._-]/g, '_')
          : wantsSrt
          ? 'cinepulse-subtitle.srt'
          : 'cinepulse-subtitle.vtt';
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
      }
      return res.send(outText);
    }

    res.statusCode = upstream.statusCode || 200;
    res.setHeader('Content-Type', ct || 'application/octet-stream');
    if (isDownload) {
      const ext = isSubtitle ? '.vtt' : '.mp4';
      const safeName = requestedFilename
        ? requestedFilename.replace(/[^a-zA-Z0-9._-]/g, '_')
        : `cinepulse-download${ext}`;
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
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
      res.status(502).json({ error: 'Stream server temporarily unavailable' });
    }
  }
});

module.exports = router;
