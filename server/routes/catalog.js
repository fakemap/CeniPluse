const express = require('express');
const crypto = require('crypto');
const store = require('../db/store');

const router = express.Router();

// GET /api/catalog - List, filter, sort, search movies & series
router.get('/', (req, res) => {
  const { q, type, genre, quality, sort = 'newest' } = req.query;
  let items = [...store.getMovies()];

  if (type && type !== 'all') {
    items = items.filter((m) => m.type === type);
  }

  if (genre && genre !== 'All') {
    const gLower = genre.toLowerCase();
    items = items.filter((m) => (m.genres || []).some((g) => g.toLowerCase() === gLower));
  }

  if (quality && quality !== 'All') {
    const qLower = quality.toLowerCase();
    items = items.filter((m) =>
      (m.sources || []).some((s) => (s.quality || '').toLowerCase() === qLower)
    );
  }

  if (q && q.trim()) {
    const term = q.trim().toLowerCase();
    items = items.filter(
      (m) =>
        (m.title || '').toLowerCase().includes(term) ||
        (m.overview || '').toLowerCase().includes(term) ||
        (m.director || '').toLowerCase().includes(term) ||
        (m.genres || []).some((g) => g.toLowerCase().includes(term)) ||
        (m.cast || []).some((c) => (c.name || '').toLowerCase().includes(term)) ||
        String(m.year || '').includes(term)
    );
  }

  switch (sort) {
    case 'rating':
      items.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      break;
    case 'views':
      items.sort((a, b) => (b.views || 0) - (a.views || 0));
      break;
    case 'downloads':
      items.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
      break;
    case 'year':
      items.sort((a, b) => (b.year || 0) - (a.year || 0));
      break;
    case 'title':
      items.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      break;
    default:
      items.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }

  // Extract available genres across entire catalog
  const allGenres = Array.from(
    new Set(store.getMovies().flatMap((m) => m.genres || []))
  ).sort();

  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  res.json({
    total: items.length,
    genres: allGenres,
    items,
  });
});

// GET /api/catalog/:id - Single movie/series detail + comments + related
router.get('/:id', (req, res) => {
  const movie = store.getMovieById(req.params.id);
  if (!movie) {
    return res.status(404).json({ error: 'Title not found' });
  }

  const comments = store.getComments(movie.id);
  const related = store
    .getMovies()
    .filter(
      (m) =>
        m.id !== movie.id &&
        (m.genres || []).some((g) => (movie.genres || []).includes(g))
    )
    .slice(0, 6);

  res.json({
    ...movie,
    comments,
    related,
  });
});

// POST /api/catalog/:id/view - Increment view count
router.post('/:id/view', (req, res) => {
  const views = store.incrementMetric(req.params.id, 'views');
  if (views === null) return res.status(404).json({ error: 'Title not found' });
  res.json({ views });
});

// POST /api/catalog/:id/download-hit - Increment download count
router.post('/:id/download-hit', (req, res) => {
  const downloads = store.incrementMetric(req.params.id, 'downloads');
  if (downloads === null) return res.status(404).json({ error: 'Title not found' });
  res.json({ downloads });
});

// POST /api/catalog/:id/comments - Add NetNaija-style community review/comment
router.post('/:id/comments', (req, res) => {
  const movie = store.getMovieById(req.params.id);
  if (!movie) return res.status(404).json({ error: 'Title not found' });

  const author = (req.body.author || 'Guest').trim().slice(0, 40) || 'Guest';
  const text = (req.body.text || '').trim().slice(0, 1000);
  const rating = Math.min(5, Math.max(1, Number(req.body.rating) || 5));

  if (!text) {
    return res.status(400).json({ error: 'Comment text is required' });
  }

  const comment = {
    id: 'cmt_' + crypto.randomBytes(5).toString('hex'),
    author,
    rating,
    text,
    createdAt: new Date().toISOString(),
  };

  store.addComment(movie.id, comment);
  res.status(201).json(comment);
});

module.exports = router;
