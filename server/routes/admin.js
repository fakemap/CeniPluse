const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const store = require('../db/store');
const { UPLOADS_DIR, PORT } = require('../config');
const { formatBytes } = require('../utils/mediaScanner');
const {
  maskSecret,
  requireAdminAuth,
  isAllowedVideoFile,
  isAllowedImageFile,
  sanitizeString,
} = require('../middleware/security');

const router = express.Router();

// Protect all /api/admin routes with RBAC admin verification
router.use(requireAdminAuth);

// Multer storage for video uploads into configured mediaDir
const videoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = store.getSettings().mediaDir;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const safeName = path.basename(file.originalname).replace(/[^\w.\-\s()]/g, '_');
    cb(null, safeName);
  },
});

// Multer storage for poster/backdrop image uploads
const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `img_${Date.now()}_${crypto.randomBytes(3).toString('hex')}${ext}`);
  },
});

const uploadVideo = multer({
  storage: videoStorage,
  limits: { fileSize: 4 * 1024 * 1024 * 1024 }, // 4 GB cap
  fileFilter: (req, file, cb) => {
    if (!isAllowedVideoFile(file.originalname)) {
      return cb(new Error('Unsupported video format. Allowed: .mp4, .mkv, .webm, .mov, .m4v'));
    }
    cb(null, true);
  },
});

const uploadImage = multer({
  storage: imageStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!isAllowedImageFile(file.originalname)) {
      return cb(new Error('Unsupported image format. Allowed: .jpg, .jpeg, .png, .webp, .avif'));
    }
    cb(null, true);
  },
});

function getLanUrls(port) {
  const urls = [`http://localhost:${port}`];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        urls.push(`http://${net.address}:${port}`);
      }
    }
  }
  return urls;
}

// GET /api/admin/overview - Settings (with masked secrets!) + platform analytics + LAN URLs
router.get('/overview', (req, res) => {
  const movies = store.getMovies();
  const settings = store.getSettings();
  const totalSources = movies.reduce((acc, m) => acc + (m.sources?.length || 0), 0);
  const totalViews = movies.reduce((acc, m) => acc + (m.views || 0), 0);
  const totalDownloads = movies.reduce((acc, m) => acc + (m.downloads || 0), 0);

  res.json({
    settings: {
      ...settings,
      tmdbApiKey: maskSecret(settings.tmdbApiKey),
      hasTmdbKey: Boolean(settings.tmdbApiKey),
    },
    stats: {
      totalTitles: movies.length,
      totalMovies: movies.filter((m) => m.type === 'movie').length,
      totalSeries: movies.filter((m) => m.type === 'series').length,
      totalSources,
      totalViews,
      totalDownloads,
    },
    lanUrls: getLanUrls(PORT),
    mediaDirExists: fs.existsSync(settings.mediaDir),
  });
});

// PUT /api/admin/settings
router.put('/settings', (req, res) => {
  const patch = {};
  if (typeof req.body.siteName === 'string') {
    patch.siteName = sanitizeString(req.body.siteName, 60) || 'CeniPluse';
  }
  if (typeof req.body.tagline === 'string') {
    patch.tagline = sanitizeString(req.body.tagline, 140);
  }
  if (
    typeof req.body.tmdbApiKey === 'string' &&
    !req.body.tmdbApiKey.includes('•')
  ) {
    patch.tmdbApiKey = sanitizeString(req.body.tmdbApiKey, 300);
  }
  if (typeof req.body.defaultQuality === 'string') {
    patch.defaultQuality = sanitizeString(req.body.defaultQuality, 16);
  }
  if (typeof req.body.autoplayNext === 'boolean') {
    patch.autoplayNext = req.body.autoplayNext;
  }

  if (typeof req.body.mediaDir === 'string' && req.body.mediaDir.trim()) {
    const resolved = path.resolve(req.body.mediaDir.trim());
    patch.mediaDir = resolved;
  }

  const updated = store.updateSettings(patch);
  res.json({
    settings: {
      ...updated,
      tmdbApiKey: maskSecret(updated.tmdbApiKey),
      hasTmdbKey: Boolean(updated.tmdbApiKey),
    },
    mediaDirExists: fs.existsSync(updated.mediaDir),
  });
});

// POST /api/admin/movies - Create new title
router.post('/movies', (req, res) => {
  const b = req.body;
  if (!b.title || !b.title.trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }

  const genres = Array.isArray(b.genres)
    ? b.genres.filter(Boolean)
    : String(b.genres || '')
        .split(',')
        .map((g) => g.trim())
        .filter(Boolean);

  const sources = Array.isArray(b.sources)
    ? b.sources.map((s, idx) => ({
        id: s.id || 'src_' + crypto.randomBytes(4).toString('hex'),
        label: s.label || `Server ${idx + 1}`,
        quality: s.quality || '1080p',
        type: s.type || (/\.m3u8(\?|$)/i.test(s.url || '') ? 'hls' : 'mp4'),
        codec: s.codec || 'H.264 / AAC',
        size: s.size || 'Unknown',
        url: (s.url || '').trim(),
        downloadUrl: (s.downloadUrl || s.url || '').trim(),
        status: s.status || 'online',
      }))
    : [];

  const movie = {
    id: `${b.type === 'series' ? 'ser' : 'mov'}_${crypto.randomBytes(5).toString('hex')}`,
    tmdbId: b.tmdbId ? Number(b.tmdbId) : null,
    type: b.type === 'series' ? 'series' : 'movie',
    title: b.title.trim(),
    tagline: (b.tagline || '').trim(),
    overview: (b.overview || '').trim() || 'No synopsis added yet.',
    year: Number(b.year) || new Date().getFullYear(),
    runtime: Number(b.runtime) || 0,
    rating: Math.min(10, Math.max(0, Number(b.rating) || 8.0)),
    votes: Number(b.votes) || 1,
    maturity: b.maturity || 'PG-13',
    language: b.language || 'English',
    genres: genres.length ? genres : ['Uncategorized'],
    featured: Boolean(b.featured),
    trending: Boolean(b.trending),
    poster: (b.poster || '').trim(),
    backdrop: (b.backdrop || b.poster || '').trim(),
    trailerYoutubeId: (b.trailerYoutubeId || '').trim(),
    director: (b.director || 'Unknown').trim(),
    cast: Array.isArray(b.cast) ? b.cast : [],
    seasons: Array.isArray(b.seasons) ? b.seasons : undefined,
    sources,
    subtitles: Array.isArray(b.subtitles) ? b.subtitles : [],
    downloads: 0,
    views: 0,
    createdAt: new Date().toISOString(),
  };

  store.addMovie(movie);
  res.status(201).json(movie);
});

// PUT /api/admin/movies/:id - Update existing title
router.put('/movies/:id', (req, res) => {
  const existing = store.getMovieById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Title not found' });

  const b = req.body;
  const updates = {};
  const scalarFields = [
    'title',
    'tagline',
    'overview',
    'type',
    'maturity',
    'language',
    'poster',
    'backdrop',
    'trailerYoutubeId',
    'director',
  ];
  scalarFields.forEach((f) => {
    if (b[f] !== undefined) updates[f] = String(b[f]).trim();
  });

  if (b.year !== undefined) updates.year = Number(b.year) || existing.year;
  if (b.runtime !== undefined) updates.runtime = Number(b.runtime) || 0;
  if (b.rating !== undefined) updates.rating = Math.min(10, Math.max(0, Number(b.rating) || 0));
  if (b.featured !== undefined) updates.featured = Boolean(b.featured);
  if (b.trending !== undefined) updates.trending = Boolean(b.trending);

  if (b.genres !== undefined) {
    updates.genres = Array.isArray(b.genres)
      ? b.genres.filter(Boolean)
      : String(b.genres)
          .split(',')
          .map((g) => g.trim())
          .filter(Boolean);
  }
  if (Array.isArray(b.sources)) updates.sources = b.sources;
  if (Array.isArray(b.seasons)) updates.seasons = b.seasons;
  if (Array.isArray(b.subtitles)) updates.subtitles = b.subtitles;

  const updated = store.updateMovie(req.params.id, updates);
  res.json(updated);
});

// DELETE /api/admin/movies/:id
router.delete('/movies/:id', (req, res) => {
  const deleted = store.deleteMovie(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Title not found' });
  res.json({ ok: true });
});

// POST /api/admin/movies/:id/sources - Add a new stream/download mirror
router.post('/movies/:id/sources', (req, res) => {
  const movie = store.getMovieById(req.params.id);
  if (!movie) return res.status(404).json({ error: 'Title not found' });

  const { label, quality = '1080p', type, codec = 'H.264 / AAC', size = 'Unknown', url, downloadUrl } = req.body;
  if (!url || !url.trim()) return res.status(400).json({ error: 'Stream URL is required' });

  const detectedType = type || (/\.m3u8(\?|$)/i.test(url.trim()) ? 'hls' : 'mp4');
  const source = {
    id: 'src_' + crypto.randomBytes(4).toString('hex'),
    label: (label || `Server ${(movie.sources?.length || 0) + 1}`).trim(),
    quality,
    type: detectedType,
    codec,
    size,
    url: url.trim(),
    downloadUrl: (downloadUrl || (detectedType === 'hls' ? '' : url)).trim(),
    status: 'online',
  };

  const sources = [...(movie.sources || []), source];
  const updated = store.updateMovie(movie.id, { sources });
  res.status(201).json({ source, movie: updated });
});

// DELETE /api/admin/movies/:id/sources/:sourceId
router.delete('/movies/:id/sources/:sourceId', (req, res) => {
  const movie = store.getMovieById(req.params.id);
  if (!movie) return res.status(404).json({ error: 'Title not found' });

  const sources = (movie.sources || []).filter((s) => s.id !== req.params.sourceId);
  const updated = store.updateMovie(movie.id, { sources });
  res.json({ movie: updated });
});

// POST /api/admin/upload/video - Upload video file into local mediaDir
router.post('/upload/video', uploadVideo.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No video file uploaded' });
  const filename = req.file.filename;
  res.status(201).json({
    filename,
    sizeBytes: req.file.size,
    sizeFormatted: formatBytes(req.file.size),
    streamUrl: `/api/media/stream?file=${encodeURIComponent(filename)}`,
    downloadUrl: `/api/media/download?file=${encodeURIComponent(filename)}`,
  });
});

// POST /api/admin/upload/poster - Upload poster/backdrop image
router.post('/upload/poster', uploadImage.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file uploaded' });
  res.status(201).json({
    filename: req.file.filename,
    url: `/uploads/${req.file.filename}`,
  });
});

module.exports = router;
