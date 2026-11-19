const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.webm', '.mov', '.m4v', '.ogg']);
const SUBTITLE_EXTENSIONS = new Set(['.vtt', '.srt']);

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i >= 2 ? 2 : 0)} ${units[i]}`;
}

/**
 * Parses common movie/series filename patterns into structured metadata
 * e.g. "Inception.2010.1080p.BluRay.x264.mp4" -> { title: "Inception", year: 2010, quality: "1080p" }
 */
function parseMediaFilename(filename) {
  const ext = path.extname(filename).toLowerCase();
  const base = path.basename(filename, ext);

  // Extract quality tag
  let quality = 'HD';
  if (/2160p|4k|uhd/i.test(base)) quality = '4K';
  else if (/1080p|fhd/i.test(base)) quality = '1080p';
  else if (/720p/i.test(base)) quality = '720p';
  else if (/480p|sd/i.test(base)) quality = '480p';
  else if (/360p/i.test(base)) quality = '360p';

  // Detect episode pattern S01E02
  const episodeMatch = base.match(/S(\d{1,2})E(\d{1,2})/i);
  const season = episodeMatch ? Number(episodeMatch[1]) : null;
  const episode = episodeMatch ? Number(episodeMatch[2]) : null;

  // Detect release year (1920 - 2035)
  const yearMatch = base.match(/(?:^|[\s._\-(])((19[2-9]\d)|(20[0-3]\d))(?:[\s._\-)]|$)/);
  const year = yearMatch ? Number(yearMatch[1]) : new Date().getFullYear();

  // Clean title by stripping quality/release tags and replacing separators
  let cleaned = base
    .replace(/S\d{1,2}E\d{1,2}.*/i, '')
    .replace(/(?:19[2-9]\d|20[0-3]\d).*/g, '')
    .replace(/(2160p|1080p|720p|480p|4k|uhd|bluray|brrip|web-dl|webrip|hdtv|x264|x265|hevc|aac|dts|hdr|remux).*/gi, '')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) cleaned = base.replace(/[._-]+/g, ' ').trim();

  return {
    title: cleaned,
    year,
    quality,
    type: episodeMatch ? 'series' : 'movie',
    season,
    episode,
    extension: ext.replace('.', '').toUpperCase(),
  };
}

/**
 * Safely resolves a relative path inside mediaRoot, blocking path traversal.
 */
function safeResolveMediaPath(mediaRoot, relativePath) {
  const normalizedRoot = path.resolve(mediaRoot);
  const target = path.resolve(normalizedRoot, relativePath);
  if (!target.startsWith(normalizedRoot + path.sep) && target !== normalizedRoot) {
    return null;
  }
  return target;
}

/**
 * Recursively scans a directory for video files and paired subtitles.
 */
function scanMediaDirectory(mediaRoot, maxDepth = 3) {
  const normalizedRoot = path.resolve(mediaRoot);
  if (!fs.existsSync(normalizedRoot)) {
    return { exists: false, root: normalizedRoot, files: [] };
  }

  const results = [];

  function walk(dir, depth) {
    if (depth > maxDepth) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    const subtitleMap = new Map();
    for (const entry of entries) {
      if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SUBTITLE_EXTENSIONS.has(ext)) {
          const full = path.join(dir, entry.name);
          const stem = path.basename(entry.name, ext).toLowerCase();
          if (!subtitleMap.has(stem)) subtitleMap.set(stem, []);
          subtitleMap.get(stem).push({
            filename: entry.name,
            relativePath: path.relative(normalizedRoot, full).replace(/\\/g, '/'),
            format: ext.replace('.', ''),
          });
        }
      }
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        walk(fullPath, depth + 1);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (!VIDEO_EXTENSIONS.has(ext)) continue;

        let stat;
        try {
          stat = fs.statSync(fullPath);
        } catch {
          continue;
        }

        const relPath = path.relative(normalizedRoot, fullPath).replace(/\\/g, '/');
        const stem = path.basename(entry.name, ext).toLowerCase();
        const parsed = parseMediaFilename(entry.name);

        // Match exact stem or prefix subtitles (e.g. movie.en.srt)
        const subtitles = [];
        for (const [subStem, subItems] of subtitleMap.entries()) {
          if (subStem === stem || subStem.startsWith(`${stem}.`)) {
            subItems.forEach((s) => {
              const langPart = subStem.replace(stem, '').replace(/^\./, '').toUpperCase() || 'EN';
              subtitles.push({
                label: `${langPart} (${s.format.toUpperCase()})`,
                lang: langPart.toLowerCase().slice(0, 2) || 'en',
                url: `/api/media/subtitle?file=${encodeURIComponent(s.relativePath)}`,
                relativePath: s.relativePath,
              });
            });
          }
        }

        const id = 'local_' + crypto.createHash('md5').update(relPath).digest('hex').slice(0, 12);

        results.push({
          id,
          filename: entry.name,
          relativePath: relPath,
          folder: path.dirname(relPath) === '.' ? 'Root' : path.dirname(relPath),
          sizeBytes: stat.size,
          sizeFormatted: formatBytes(stat.size),
          modifiedAt: stat.mtime.toISOString(),
          streamUrl: `/api/media/stream?file=${encodeURIComponent(relPath)}`,
          downloadUrl: `/api/media/download?file=${encodeURIComponent(relPath)}`,
          subtitles,
          ...parsed,
        });
      }
    }
  }

  walk(normalizedRoot, 0);
  results.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));

  return {
    exists: true,
    root: normalizedRoot,
    count: results.length,
    totalSizeBytes: results.reduce((acc, f) => acc + f.sizeBytes, 0),
    totalSizeFormatted: formatBytes(results.reduce((acc, f) => acc + f.sizeBytes, 0)),
    files: results,
  };
}

module.exports = {
  scanMediaDirectory,
  safeResolveMediaPath,
  parseMediaFilename,
  formatBytes,
  VIDEO_EXTENSIONS,
  SUBTITLE_EXTENSIONS,
};
