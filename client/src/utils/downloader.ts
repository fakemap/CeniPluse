export interface DownloadProgress {
  percent: number;
  loadedBytes: number;
  totalBytes?: number;
  label: string;
}

function saveBlobToDisk(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 15000);
}

function formatMb(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb.toFixed(1)} MB`;
}

/**
 * Downloads a .vtt subtitle via fetch + Blob so browsers never block it.
 */
export async function downloadSubtitleFile(url: string, filename: string): Promise<void> {
  const sep = url.includes('?') ? '&' : '?';
  const fetchUrl = url.includes('download=1') ? url : `${url}${sep}download=1`;
  const res = await fetch(fetchUrl);
  if (!res.ok) {
    throw new Error(`Subtitle server returned HTTP ${res.status}`);
  }
  const text = await res.text();
  if (!text.trim()) {
    throw new Error('Subtitle file was empty');
  }
  const blob = new Blob([text], { type: 'text/vtt;charset=utf-8' });
  saveBlobToDisk(blob, filename);
}

/**
 * Downloads an HLS (.m3u8) stream in parallel segments (each < 3MB so it works on Vercel too),
 * decrypting AES-128 segments in-browser via Web Crypto API, and saves as a .ts video file.
 */
async function downloadHlsInBrowser(opts: {
  manifestUrl: string;
  quality: string;
  filename: string;
  onProgress?: (p: DownloadProgress) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const { manifestUrl, quality, filename, onProgress, signal } = opts;
  // Strip download=1 so the proxy returns the rewritten .m3u8 manifest
  const cleanManifestUrl = manifestUrl
    .replace(/([?&])download=1(&|$)/g, (_, p1, p2) => (p2 ? p1 : ''))
    .replace(/[?&]$/, '');

  onProgress?.({ percent: 1, loadedBytes: 0, label: 'Fetching video playlist...' });

  const masterRes = await fetch(cleanManifestUrl, { signal });
  if (!masterRes.ok) throw new Error(`Stream server returned HTTP ${masterRes.status}`);
  let playlistText = await masterRes.text();
  if (!playlistText.trimStart().startsWith('#EXTM3U')) {
    throw new Error('Invalid stream playlist');
  }

  // If master playlist, pick variant closest to requested quality (1080/720/480/360)
  if (playlistText.includes('#EXT-X-STREAM-INF')) {
    const lines = playlistText.split('\n').map((l) => l.trim());
    const variants: Array<{ height: number; url: string }> = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
        const resMatch = lines[i].match(/RESOLUTION=\d+x(\d+)/i);
        const bwMatch = lines[i].match(/BANDWIDTH=(\d+)/i);
        const height = resMatch
          ? Number(resMatch[1])
          : bwMatch
          ? Math.round(Number(bwMatch[1]) / 3500)
          : 720;
        const nextUrl = lines[i + 1];
        if (nextUrl && !nextUrl.startsWith('#')) {
          variants.push({ height, url: nextUrl });
        }
      }
    }
    if (variants.length > 0) {
      const targetHeight = Number(quality.replace(/\D/g, '')) || 1080;
      variants.sort((a, b) => Math.abs(a.height - targetHeight) - Math.abs(b.height - targetHeight));
      const variantRes = await fetch(variants[0].url, { signal });
      if (!variantRes.ok) throw new Error(`Variant playlist returned HTTP ${variantRes.status}`);
      playlistText = await variantRes.text();
    }
  }

  // Parse media playlist segments & optional AES-128 key
  const lines = playlistText.split('\n').map((l) => l.trim()).filter(Boolean);
  let mediaSeq = 0;
  let activeKey: CryptoKey | null = null;
  let activeIv: Uint8Array | null = null;
  const keyCache = new Map<string, CryptoKey>();

  const segments: Array<{
    seq: number;
    url: string;
    key: CryptoKey | null;
    iv: Uint8Array | null;
  }> = [];

  for (const line of lines) {
    if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
      mediaSeq = Number(line.split(':')[1]) || 0;
    } else if (line.startsWith('#EXT-X-KEY:')) {
      const method = line.match(/METHOD=([^,]+)/i)?.[1];
      const uri = line.match(/URI="([^"]+)"/i)?.[1];
      const ivHex = line.match(/IV=0x([0-9A-Fa-f]+)/i)?.[1];
      if (method === 'AES-128' && uri) {
        let imported = keyCache.get(uri);
        if (!imported) {
          const kRes = await fetch(uri, { signal });
          if (kRes.ok) {
            const keyBytes = await kRes.arrayBuffer();
            if (keyBytes.byteLength === 16) {
              imported = await crypto.subtle.importKey('raw', keyBytes, 'AES-CBC', false, [
                'decrypt',
              ]);
              keyCache.set(uri, imported);
            }
          }
        }
        activeKey = imported || null;
        if (ivHex) {
          const padded = ivHex.padStart(32, '0');
          const ivArr = new Uint8Array(16);
          for (let i = 0; i < 16; i++) {
            ivArr[i] = parseInt(padded.slice(i * 2, i * 2 + 2), 16);
          }
          activeIv = ivArr;
        } else {
          activeIv = null;
        }
      } else if (method === 'NONE') {
        activeKey = null;
        activeIv = null;
      }
    } else if (!line.startsWith('#')) {
      segments.push({
        seq: mediaSeq + segments.length,
        url: line,
        key: activeKey,
        iv: activeIv,
      });
    }
  }

  if (segments.length === 0) {
    throw new Error('No downloadable video segments found in playlist');
  }

  const buffers: Array<ArrayBuffer | null> = new Array(segments.length).fill(null);
  let completed = 0;
  let loadedBytes = 0;
  let nextIdx = 0;
  const CONCURRENCY = 4;

  const worker = async () => {
    while (nextIdx < segments.length) {
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      const idx = nextIdx++;
      const seg = segments[idx];
      const res = await fetch(seg.url, { signal });
      if (!res.ok) continue;
      let buf = await res.arrayBuffer();
      if (seg.key) {
        let iv = seg.iv;
        if (!iv) {
          iv = new Uint8Array(16);
          const view = new DataView(iv.buffer);
          view.setUint32(12, seg.seq, false);
        }
        buf = await crypto.subtle.decrypt(
          { name: 'AES-CBC', iv: iv as BufferSource },
          seg.key,
          buf
        );
      }
      buffers[idx] = buf;
      completed++;
      loadedBytes += buf.byteLength;
      const pct = Math.min(99, Math.round((completed / segments.length) * 100));
      onProgress?.({
        percent: pct,
        loadedBytes,
        label: `Downloading ${pct}% (${completed}/${segments.length} parts • ${formatMb(loadedBytes)})`,
      });
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, segments.length) }, worker));

  const validParts = buffers.filter((b): b is ArrayBuffer => b !== null);
  if (validParts.length === 0) {
    throw new Error('All video segments failed to download');
  }

  onProgress?.({
    percent: 100,
    loadedBytes,
    label: `Saving file (${formatMb(loadedBytes)})...`,
  });

  const tsFilename = filename.replace(/\.mp4$/i, '.ts');
  const blob = new Blob(validParts, { type: 'video/mp2t' });
  saveBlobToDisk(blob, tsFilename);
}

/**
 * Downloads a direct MP4 in 3 MB Range chunks (compatible with Vercel's 4.5 MB function limit)
 * or uses native browser download on localhost / non-serverless hosts.
 */
export async function downloadVideoWithProgress(opts: {
  url: string;
  sourceType: 'mp4' | 'hls';
  quality: string;
  filename: string;
  onProgress?: (p: DownloadProgress) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const { url, sourceType, quality, filename, onProgress, signal } = opts;
  const isLocalHost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname.startsWith('192.168.') ||
      window.location.hostname.startsWith('10.'));

  // HLS streams always use in-browser parallel segment assembly so they work on Vercel AND localhost
  if (sourceType === 'hls') {
    return downloadHlsInBrowser({
      manifestUrl: url,
      quality,
      filename,
      onProgress,
      signal,
    });
  }

  // Direct MP4: probe first 2 bytes to verify reachability & get total file size
  const baseUrl = url
    .replace(/([?&])download=1(&|$)/g, (_, p1, p2) => (p2 ? p1 : ''))
    .replace(/[?&]$/, '');

  onProgress?.({ percent: 1, loadedBytes: 0, label: 'Connecting to download server...' });

  const probeRes = await fetch(baseUrl, {
    headers: { Range: 'bytes=0-1' },
    signal,
  });

  if (!probeRes.ok && probeRes.status !== 206) {
    throw new Error(`Download server returned HTTP ${probeRes.status}`);
  }

  // On localhost / dedicated Node server, hand off directly to the browser's native download manager!
  if (isLocalHost) {
    const sep = url.includes('?') ? '&' : '?';
    const dlHref = `${url}${url.includes('download=1') ? '' : `${sep}download=1`}&filename=${encodeURIComponent(
      filename
    )}`;
    const a = document.createElement('a');
    a.href = dlHref;
    a.download = filename;
    a.rel = 'noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    onProgress?.({ percent: 100, loadedBytes: 0, label: 'Download started in your browser!' });
    return;
  }

  // On Vercel / serverless: fetch MP4 in 3 MB Range chunks (under 4.5 MB response limit)
  const contentRange = probeRes.headers.get('content-range') || '';
  const totalBytes = contentRange.includes('/')
    ? Number(contentRange.split('/')[1])
    : Number(probeRes.headers.get('content-length') || 0);

  if (!totalBytes || !isFinite(totalBytes) || totalBytes <= 0) {
    // Small / unknown size fallback
    const fullRes = await fetch(baseUrl, { signal });
    if (!fullRes.ok) throw new Error(`Download failed (HTTP ${fullRes.status})`);
    const blob = await fullRes.blob();
    saveBlobToDisk(blob, filename);
    onProgress?.({ percent: 100, loadedBytes: blob.size, label: 'Download complete!' });
    return;
  }

  const CHUNK_SIZE = 3 * 1024 * 1024; // 3 MB per request (safe under Vercel 4.5 MB limit)
  const totalChunks = Math.ceil(totalBytes / CHUNK_SIZE);
  const parts: Array<ArrayBuffer | null> = new Array(totalChunks).fill(null);
  let loadedBytes = 0;
  let nextChunk = 0;
  const CONCURRENCY = 4;

  const worker = async () => {
    while (nextChunk < totalChunks) {
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      const idx = nextChunk++;
      const start = idx * CHUNK_SIZE;
      const end = Math.min(totalBytes - 1, start + CHUNK_SIZE - 1);
      const res = await fetch(baseUrl, {
        headers: { Range: `bytes=${start}-${end}` },
        signal,
      });
      if (!res.ok && res.status !== 206) {
        throw new Error(`Chunk ${idx + 1} failed (HTTP ${res.status})`);
      }
      const buf = await res.arrayBuffer();
      parts[idx] = buf;
      loadedBytes += buf.byteLength;
      const pct = Math.min(99, Math.round((loadedBytes / totalBytes) * 100));
      onProgress?.({
        percent: pct,
        loadedBytes,
        totalBytes,
        label: `Downloading ${pct}% (${formatMb(loadedBytes)} / ${formatMb(totalBytes)})`,
      });
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, totalChunks) }, worker));

  onProgress?.({
    percent: 100,
    loadedBytes,
    totalBytes,
    label: `Saving ${filename} (${formatMb(totalBytes)})...`,
  });

  const blob = new Blob(parts.filter((p): p is ArrayBuffer => p !== null), { type: 'video/mp4' });
  saveBlobToDisk(blob, filename);
}
