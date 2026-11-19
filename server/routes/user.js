const express = require('express');
const store = require('../db/store');
const {
  signSessionToken,
  verifySessionToken,
  sanitizeString,
} = require('../middleware/security');

const router = express.Router();

// POST /api/user/auth/login - Issues an HMAC-SHA256 signed session token
router.post('/auth/login', (req, res) => {
  const email = sanitizeString(req.body?.email, 120).toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  const role = 'admin';
  const token = signSessionToken({ email, role });
  res.json({ email, role, token });
});

// GET /api/user/auth/session - Validates an existing session token
router.get('/auth/session', (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token =
    (authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '') ||
    req.headers['x-cinepulse-token'] ||
    '';
  const claims = verifySessionToken(String(token));
  if (!claims) return res.status(401).json({ authenticated: false });
  res.json({ authenticated: true, email: claims.email, role: claims.role });
});

// GET /api/user/state - Watchlist + Continue Watching + public settings
router.get('/state', (req, res) => {
  const settings = store.getSettings();
  res.json({
    watchlist: store.getWatchlist(),
    continueWatching: store.getContinueWatching(),
    settings: {
      siteName: settings.siteName || 'CineBox',
      tagline: settings.tagline || 'Stream, Discover & Download',
      hasTmdbKey: Boolean(settings.tmdbApiKey),
      mediaDir: settings.mediaDir,
      defaultQuality: settings.defaultQuality || '1080p',
      autoplayNext: settings.autoplayNext !== false,
    },
  });
});

// POST /api/user/watchlist/toggle
router.post('/watchlist/toggle', (req, res) => {
  const { movieId } = req.body;
  if (!movieId) return res.status(400).json({ error: 'movieId is required' });
  const result = store.toggleWatchlist(movieId);
  res.json(result);
});

// POST /api/user/progress - Save resume timestamp
router.post('/progress', (req, res) => {
  const { movieId, episodeId, title, poster, currentTime, duration, sourceId } = req.body;
  if (!movieId || currentTime === undefined) {
    return res.status(400).json({ error: 'movieId and currentTime are required' });
  }
  const saved = store.saveProgress({
    movieId,
    episodeId,
    title,
    poster,
    currentTime: Number(currentTime),
    duration: Number(duration || 0),
    sourceId,
  });
  res.json(saved);
});

// DELETE /api/user/progress/:movieId
router.delete('/progress/:movieId', (req, res) => {
  store.removeProgress(req.params.movieId);
  res.json({ ok: true });
});

// GET /api/user/reviews/:movieId
router.get('/reviews/:movieId', (req, res) => {
  const movieId = sanitizeString(decodeURIComponent(req.params.movieId || ''), 160);
  if (!movieId) return res.json({ items: [] });
  res.json({ items: store.getComments(movieId) });
});

// POST /api/user/reviews/:movieId
router.post('/reviews/:movieId', (req, res) => {
  const movieId = sanitizeString(decodeURIComponent(req.params.movieId || ''), 160);
  if (!movieId) return res.status(400).json({ error: 'movieId is required' });

  const author = sanitizeString(req.body?.author || 'Viewer', 60) || 'Viewer';
  const text = sanitizeString(req.body?.text || '', 600);
  if (!text) return res.status(400).json({ error: 'Review text is required' });

  const rawRating = Number(req.body?.rating);
  const rating = Number.isFinite(rawRating) ? Math.min(10, Math.max(1, Math.round(rawRating))) : 8;

  const review = {
    id: `rev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    author,
    rating,
    text,
    createdAt: new Date().toISOString(),
  };

  store.addComment(movieId, review);
  res.status(201).json(review);
});

module.exports = router;
