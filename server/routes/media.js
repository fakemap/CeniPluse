const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('../db/store');
const { scanMediaDirectory, safeResolveMediaPath } = require('../utils/mediaScanner');
const { srtToVtt } = require('../utils/srtToVtt');

const router = express.Router();

const MIME_MAP = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.ogg': 'video/ogg',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
};

function getMediaRoot() {
  return store.getSettings().mediaDir;
}

// GET /api/media/scan - Scan configured local media directory
router.get('/scan', (req, res) => {
  const result = scanMediaDirectory(getMediaRoot());
  res.json(result);
});

// GET /api/media/stream?file=relative/path.mp4 - HTTP 206 Range Streaming
router.get('/stream', (req, res) => {
  const relFile = req.query.file;
  if (!relFile) return res.status(400).json({ error: 'Missing file parameter' });

  const absPath = safeResolveMediaPath(getMediaRoot(), String(relFile));
  if (!absPath || !fs.existsSync(absPath)) {
    return res.status(404).json({ error: 'Media file not found' });
  }

  const stat = fs.statSync(absPath);
  if (!stat.isFile()) return res.status(400).json({ error: 'Not a file' });

  const fileSize = stat.size;
  const ext = path.extname(absPath).toLowerCase();
  const contentType = MIME_MAP[ext] || 'application/octet-stream';
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const chunkSize = 2 * 1024 * 1024; // 2MB chunks for responsive seeking
    const end = parts[1]
      ? Math.min(parseInt(parts[1], 10), fileSize - 1)
      : Math.min(start + chunkSize - 1, fileSize - 1);

    if (isNaN(start) || start >= fileSize || start > end) {
      res.status(416).set('Content-Range', `bytes */${fileSize}`).end();
      return;
    }

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
    });

    const stream = fs.createReadStream(absPath, { start, end });
    stream.on('error', () => res.end());
    stream.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Accept-Ranges': 'bytes',
      'Content-Type': contentType,
    });
    const stream = fs.createReadStream(absPath);
    stream.on('error', () => res.end());
    stream.pipe(res);
  }
});

// GET /api/media/download?file=relative/path.mp4 - Direct file download
router.get('/download', (req, res) => {
  const relFile = req.query.file;
  if (!relFile) return res.status(400).json({ error: 'Missing file parameter' });

  const absPath = safeResolveMediaPath(getMediaRoot(), String(relFile));
  if (!absPath || !fs.existsSync(absPath)) {
    return res.status(404).json({ error: 'Media file not found' });
  }

  const filename = path.basename(absPath);
  res.download(absPath, filename);
});

// GET /api/media/subtitle?file=relative/path.srt - Serves VTT (auto-converts SRT)
router.get('/subtitle', (req, res) => {
  const relFile = req.query.file;
  if (!relFile) return res.status(400).json({ error: 'Missing file parameter' });

  const absPath = safeResolveMediaPath(getMediaRoot(), String(relFile));
  if (!absPath || !fs.existsSync(absPath)) {
    return res.status(404).json({ error: 'Subtitle file not found' });
  }

  const ext = path.extname(absPath).toLowerCase();
  const raw = fs.readFileSync(absPath, 'utf-8');
  const vtt = ext === '.srt' ? srtToVtt(raw) : raw;

  res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
  res.send(vtt);
});

// POST /api/media/import - Promote a local scanned file into the main CineBox catalog
router.post('/import', (req, res) => {
  const { relativePath } = req.body;
  if (!relativePath) return res.status(400).json({ error: 'relativePath is required' });

  const scan = scanMediaDirectory(getMediaRoot());
  const file = scan.files.find((f) => f.relativePath === relativePath);
  if (!file) return res.status(404).json({ error: 'Local media file not found' });

  const newMovie = {
    id: 'mov_local_' + crypto.randomBytes(4).toString('hex'),
    tmdbId: null,
    type: file.type || 'movie',
    title: file.title,
    tagline: `Local Drive (${file.folder})`,
    overview: `Streamed directly from your local media drive (${file.filename}, ${file.sizeFormatted}). Edit this entry in Admin Studio to add a custom poster, plot, or additional mirrors.`,
    year: file.year,
    runtime: 0,
    rating: 8.0,
    votes: 1,
    maturity: 'PG-13',
    language: 'English',
    genres: ['Local Library'],
    featured: false,
    trending: false,
    poster: '',
    backdrop: '',
    trailerYoutubeId: '',
    director: 'Local Media',
    cast: [],
    sources: [
      {
        id: 'src_loc_' + crypto.randomBytes(3).toString('hex'),
        label: `Local Drive — ${file.extension}`,
        quality: file.quality || 'HD',
        type: 'mp4',
        codec: file.extension,
        size: file.sizeFormatted,
        url: file.streamUrl,
        downloadUrl: file.downloadUrl,
        status: 'online',
      },
    ],
    subtitles: file.subtitles || [],
    downloads: 0,
    views: 0,
    createdAt: new Date().toISOString(),
  };

  store.addMovie(newMovie);
  res.status(201).json(newMovie);
});

module.exports = router;
