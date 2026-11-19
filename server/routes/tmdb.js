const express = require('express');
const crypto = require('crypto');
const store = require('../db/store');
const { mapTmdbGenreIds, resolveRegionAndCountry } = require('../utils/tmdbGenreMap');

const router = express.Router();
const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p';

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const tmdbCache = new Map();
const cacheStats = {
  hits: 0,
  misses: 0,
  lastLatencyMs: 0,
};

function getTmdbKey() {
  return (store.getSettings().tmdbApiKey || process.env.TMDB_API_KEY || '').trim();
}

async function tmdbFetch(endpoint, params = {}) {
  const key = getTmdbKey();
  if (!key) {
    const err = new Error('TMDB API key is not configured. Add your free key in Settings.');
    err.status = 400;
    throw err;
  }

  const cacheKey = `${endpoint}?${JSON.stringify(params)}`;
  const cached = tmdbCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    cacheStats.hits++;
    return cached.data;
  }

  cacheStats.misses++;
  const started = Date.now();
  const isBearer = key.length > 50 || key.startsWith('eyJ');
  const url = new URL(`${TMDB_BASE}${endpoint}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  });
  if (!isBearer) {
    url.searchParams.set('api_key', key);
  }

  const headers = { Accept: 'application/json' };
  if (isBearer) headers.Authorization = `Bearer ${key}`;

  const response = await fetch(url.toString(), { headers });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const err = new Error(`TMDB API error (${response.status}): ${body.slice(0, 140)}`);
    err.status = response.status;
    throw err;
  }

  const data = await response.json();
  cacheStats.lastLatencyMs = Date.now() - started;

  // Cap cache size to 400 entries to stay lightweight
  if (tmdbCache.size > 400) {
    const firstKey = tmdbCache.keys().next().value;
    tmdbCache.delete(firstKey);
  }
  tmdbCache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  return data;
}

function normalizeTmdbItem(item, forcedType, overrides = {}) {
  const mediaType = forcedType || item.media_type || (item.first_air_date ? 'tv' : 'movie');
  const release = item.release_date || item.first_air_date || '';
  const lang = (item.original_language || 'en').toUpperCase();
  const originCountry = String(
    overrides.originCountry || (item.origin_country && item.origin_country[0]) || ''
  ).toUpperCase();
  const rawGenres =
    Array.isArray(item.genres) && item.genres.length > 0
      ? item.genres.map((g) => g.name || g).filter(Boolean)
      : mapTmdbGenreIds(item.genre_ids, mediaType);
  const genres =
    String(overrides.discoverGenre || '') === '16' && !rawGenres.includes('Animation')
      ? ['Animation', ...rawGenres].slice(0, 4)
      : rawGenres;
  const { country, regionTag } = resolveRegionAndCountry(originCountry, lang, genres);

  return {
    tmdbId: item.id,
    type: mediaType === 'tv' ? 'series' : 'movie',
    mediaType,
    title: item.title || item.name || 'Untitled',
    overview: item.overview || 'No synopsis available.',
    year: release ? Number(release.slice(0, 4)) : null,
    rating: item.vote_average ? Number(item.vote_average.toFixed(1)) : 0,
    votes: item.vote_count || 0,
    poster: item.poster_path ? `${IMG_BASE}/w500${item.poster_path}` : '',
    backdrop: item.backdrop_path ? `${IMG_BASE}/w1280${item.backdrop_path}` : '',
    language: lang,
    originCountry,
    country,
    regionTag,
    genres,
  };
}

// GET /api/tmdb/status
router.get('/status', (req, res) => {
  res.json({
    configured: Boolean(getTmdbKey()),
    cache: {
      entries: tmdbCache.size,
      hits: cacheStats.hits,
      misses: cacheStats.misses,
      hitRate:
        cacheStats.hits + cacheStats.misses > 0
          ? Math.round((cacheStats.hits / (cacheStats.hits + cacheStats.misses)) * 100)
          : 0,
      lastNetworkLatencyMs: cacheStats.lastLatencyMs,
    },
  });
});

// GET /api/tmdb/trending?type=all|movie|tv
router.get('/trending', async (req, res) => {
  try {
    const type = ['all', 'movie', 'tv'].includes(req.query.type) ? req.query.type : 'all';
    const data = await tmdbFetch(`/trending/${type}/week`);
    const items = (data.results || [])
      .filter((r) => r.media_type !== 'person')
      .map((r) => normalizeTmdbItem(r, type === 'all' ? null : type));
    res.json({ items });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/tmdb/discover?type=movie|tv&country=NG&genre=16
router.get('/discover', async (req, res) => {
  try {
    const mediaType = req.query.type === 'tv' ? 'tv' : 'movie';
    const params = { sort_by: 'popularity.desc', page: Number(req.query.page) || 1 };
    if (req.query.country) params.with_origin_country = String(req.query.country).toUpperCase();
    if (req.query.genre) params.with_genres = String(req.query.genre);
    const data = await tmdbFetch(`/discover/${mediaType}`, params);
    const items = (data.results || []).map((r) => ({
      ...normalizeTmdbItem(r, mediaType, {
        originCountry: req.query.country ? String(req.query.country).toUpperCase() : '',
        discoverGenre: req.query.genre ? String(req.query.genre) : '',
      }),
      discoverGenre: req.query.genre ? String(req.query.genre) : '',
    }));
    res.json({ items });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/tmdb/feed/:category - popular_movies, top_rated, upcoming, popular_tv
router.get('/feed/:category', async (req, res) => {
  const map = {
    popular_movies: { path: '/movie/popular', type: 'movie' },
    top_rated: { path: '/movie/top_rated', type: 'movie' },
    upcoming: { path: '/movie/upcoming', type: 'movie' },
    popular_tv: { path: '/tv/popular', type: 'tv' },
  };
  const cfg = map[req.params.category];
  if (!cfg) return res.status(400).json({ error: 'Invalid TMDB feed category' });
  try {
    const page = Number(req.query.page) || 1;
    const data = await tmdbFetch(cfg.path, { page });
    const items = (data.results || []).map((r) => normalizeTmdbItem(r, cfg.type));
    res.json({ items, page: data.page || 1, totalPages: data.total_pages || 1 });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/tmdb/search?q=...
router.get('/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ items: [] });
    const data = await tmdbFetch('/search/multi', { query: q, include_adult: false });
    const items = (data.results || [])
      .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
      .map((r) => normalizeTmdbItem(r));
    res.json({ items });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

function rankYoutubeVideos(results = []) {
  const typeScore = (t) => {
    if (t === 'Trailer') return 5;
    if (t === 'Teaser') return 4;
    if (t === 'Clip') return 3;
    if (t === 'Opening Credits') return 2;
    return 1;
  };
  const score = (v) =>
    typeScore(v.type) + (v.official ? 2 : 0) + (v.iso_639_1 === 'en' ? 1 : 0);

  return (results || [])
    .filter((v) => v.site === 'YouTube' && v.key)
    .sort((a, b) => score(b) - score(a));
}

// GET /api/tmdb/trailer/:type/:id — Lightweight cached YouTube trailer/snippet lookup
router.get('/trailer/:type/:id', async (req, res) => {
  try {
    const mediaType = req.params.type === 'tv' || req.params.type === 'series' ? 'tv' : 'movie';
    const data = await tmdbFetch(`/${mediaType}/${req.params.id}/videos`, {
      include_video_language: 'en,ja,ko,hi,es,fr,de,pt,zh,null',
    });
    const best = rankYoutubeVideos(data.results)[0] || null;
    res.json({
      trailerYoutubeId: best ? best.key : '',
      name: best ? best.name : '',
      type: best ? best.type : '',
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, trailerYoutubeId: '' });
  }
});

// GET /api/tmdb/details/:type/:id — Full TMDB metadata, official trailers, seasons & in-platform recommendations!
router.get('/details/:type/:id', async (req, res) => {
  try {
    const mediaType = req.params.type === 'tv' || req.params.type === 'series' ? 'tv' : 'movie';
    const data = await tmdbFetch(`/${mediaType}/${req.params.id}`, {
      append_to_response: 'credits,videos,external_ids,recommendations',
    });

    const ytVideos = rankYoutubeVideos(data.videos?.results);

    const trailer = ytVideos[0] || null;
    const directorObj = (data.credits?.crew || []).find((c) => c.job === 'Director');
    const creator = (data.created_by || [])[0];
    const imdbId = data.imdb_id || data.external_ids?.imdb_id || '';

    const seasons =
      mediaType === 'tv'
        ? (data.seasons || [])
            .filter((s) => s.season_number > 0 && s.episode_count > 0)
            .map((s) => ({
              seasonNumber: s.season_number,
              name: s.name || `Season ${s.season_number}`,
              episodeCount: s.episode_count || 0,
              airDate: s.air_date || '',
              overview: s.overview || '',
              poster: s.poster_path ? `${IMG_BASE}/w300${s.poster_path}` : '',
            }))
        : [];

    const recommendations = (data.recommendations?.results || [])
      .filter((r) => r.poster_path)
      .slice(0, 12)
      .map((r) => normalizeTmdbItem(r, mediaType));

    const bindingKey = `tmdb:${mediaType}:${req.params.id}`;
    const boundSources = store.getBoundSources(bindingKey);

    res.json({
      ...normalizeTmdbItem(data, mediaType),
      imdbId,
      imdbRating: null,
      imdbVotes: null,
      votes: data.vote_count || 0,
      releaseDate: data.release_date || data.first_air_date || '',
      tagline: data.tagline || '',
      runtime: data.runtime || (data.episode_run_time && data.episode_run_time[0]) || 0,
      genres: (data.genres || []).map((g) => g.name),
      director: directorObj?.name || creator?.name || 'Unknown',
      trailerYoutubeId: trailer ? trailer.key : '',
      videos: ytVideos.slice(0, 5).map((v) => ({
        key: v.key,
        name: v.name,
        type: v.type,
      })),
      recommendations,
      seasons,
      numberOfSeasons: data.number_of_seasons || seasons.length,
      numberOfEpisodes: data.number_of_episodes || 0,
      boundSources,
      cast: (data.credits?.cast || []).slice(0, 12).map((c) => ({
        name: c.name,
        role: c.character || '',
        photo: c.profile_path ? `${IMG_BASE}/w300${c.profile_path}` : '',
      })),
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/tmdb/tv/:id/season/:seasonNumber - Real TMDB episode list for a TV season
router.get('/tv/:id/season/:seasonNumber', async (req, res) => {
  try {
    const tvId = req.params.id;
    const seasonNumber = Number(req.params.seasonNumber) || 1;
    const data = await tmdbFetch(`/tv/${tvId}/season/${seasonNumber}`);

    const episodes = (data.episodes || []).map((ep) => {
      const epKey = `tmdb:tv:${tvId}:s${seasonNumber}:e${ep.episode_number}`;
      return {
        id: `tmdb_tv_${tvId}_s${seasonNumber}_e${ep.episode_number}`,
        bindingKey: epKey,
        seasonNumber,
        episodeNumber: ep.episode_number,
        title: ep.name || `Episode ${ep.episode_number}`,
        overview: ep.overview || 'No episode synopsis available yet.',
        still: ep.still_path ? `${IMG_BASE}/w500${ep.still_path}` : '',
        runtime: ep.runtime ? `${ep.runtime}m` : '',
        airDate: ep.air_date || '',
        rating: ep.vote_average ? Number(ep.vote_average.toFixed(1)) : 0,
        sources: store.getBoundSources(epKey),
      };
    });

    res.json({
      tvId: Number(tvId),
      seasonNumber,
      name: data.name || `Season ${seasonNumber}`,
      overview: data.overview || '',
      episodes,
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/tmdb/bind-source - Bind a local file or direct MP4/HLS URL to a TMDB movie or episode
router.post('/bind-source', (req, res) => {
  const {
    tmdbId,
    mediaType = 'movie',
    season,
    episode,
    label,
    quality = '1080p',
    size = 'Custom',
    url,
    downloadUrl,
  } = req.body;

  if (!tmdbId || !url || !String(url).trim()) {
    return res.status(400).json({ error: 'tmdbId and stream url are required' });
  }

  const normalizedType = mediaType === 'tv' || mediaType === 'series' ? 'tv' : 'movie';
  const bindingKey =
    normalizedType === 'tv' && season && episode
      ? `tmdb:tv:${tmdbId}:s${Number(season)}:e${Number(episode)}`
      : `tmdb:${normalizedType}:${tmdbId}`;

  const cleanUrl = String(url).trim();
  const isHls = /\.m3u8(\?|$)/i.test(cleanUrl);
  const source = {
    id: 'bind_' + crypto.randomBytes(4).toString('hex'),
    label: (label || (cleanUrl.startsWith('/api/media/') ? 'Local Media Drive' : 'Custom Stream')).trim(),
    quality,
    type: isHls ? 'hls' : 'mp4',
    codec: isHls ? 'HLS Adaptive' : 'Direct Video',
    size,
    url: cleanUrl,
    downloadUrl: (downloadUrl || (isHls ? '' : cleanUrl)).trim(),
  };

  const sources = store.addBoundSource(bindingKey, source);
  res.status(201).json({ bindingKey, source, sources });
});

// POST /api/tmdb/import
router.post('/import', async (req, res) => {
  try {
    const { tmdbId, mediaType = 'movie', streamUrl = '', quality = '1080p', size = 'Unknown' } = req.body;
    if (!tmdbId) return res.status(400).json({ error: 'tmdbId is required' });

    const type = mediaType === 'tv' || mediaType === 'series' ? 'tv' : 'movie';
    const data = await tmdbFetch(`/${type}/${tmdbId}`, {
      append_to_response: 'credits,videos',
    });

    const trailer = (data.videos?.results || []).find(
      (v) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser')
    );
    const directorObj = (data.credits?.crew || []).find((c) => c.job === 'Director');
    const creator = (data.created_by || [])[0];
    const base = normalizeTmdbItem(data, type);

    const sources = [];
    if (streamUrl.trim()) {
      const isHls = /\.m3u8(\?|$)/i.test(streamUrl.trim());
      sources.push({
        id: 'src_' + crypto.randomBytes(4).toString('hex'),
        label: isHls ? 'Server 1 — HLS Stream' : 'Server 1 — Direct Stream',
        quality,
        type: isHls ? 'hls' : 'mp4',
        codec: 'H.264 / AAC',
        size,
        url: streamUrl.trim(),
        downloadUrl: isHls ? '' : streamUrl.trim(),
        status: 'online',
      });
    }

    const newMovie = {
      id: `${base.type === 'series' ? 'ser' : 'mov'}_tmdb_${tmdbId}_${crypto.randomBytes(2).toString('hex')}`,
      tmdbId: Number(tmdbId),
      type: base.type,
      title: base.title,
      tagline: data.tagline || '',
      overview: base.overview,
      year: base.year || new Date().getFullYear(),
      runtime: data.runtime || (data.episode_run_time && data.episode_run_time[0]) || 90,
      rating: base.rating,
      votes: base.votes,
      maturity: data.adult ? 'R' : 'PG-13',
      language: base.language,
      genres: (data.genres || []).map((g) => g.name),
      featured: false,
      trending: true,
      poster: base.poster,
      backdrop: base.backdrop || base.poster,
      trailerYoutubeId: trailer ? trailer.key : '',
      director: directorObj?.name || creator?.name || 'Unknown',
      cast: (data.credits?.cast || []).slice(0, 8).map((c) => ({
        name: c.name,
        role: c.character || '',
      })),
      sources,
      subtitles: [],
      downloads: 0,
      views: 0,
      createdAt: new Date().toISOString(),
    };

    store.addMovie(newMovie);
    res.status(201).json(newMovie);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
