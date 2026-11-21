const fs = require('fs');
const path = require('path');
const { DB_PATH, DEFAULT_MEDIA_DIR, ENV_TMDB_API_KEY } = require('../config');
const { createSeedData } = require('./seed');
const supabaseClient = require('./supabaseClient');

const SYNC_TTL_MS = 3 * 60 * 1000; // 3 minutes TTL to avoid hammering Supabase on every request

const STATE_KEY_TO_FIELD = {
  settings: 'settings',
  watchlist: 'watchlist',
  continue_watching: 'continueWatching',
  source_bindings: 'sourceBindings',
  harvest_cursors: 'harvestCursors',
  auto_harvest: 'autoHarvest',
  monetization_config: 'monetizationConfig',
};

function titleToDbRow(t) {
  const { stats: _stats, _mediaType: _mt, ...cleanPayload } = t;
  return {
    id: String(t.id),
    tmdb_id: t.tmdbId !== undefined && t.tmdbId !== null ? Number(t.tmdbId) : null,
    type: t.type || 'movie',
    status: t.status || 'draft',
    title: t.title || 'Untitled',
    year: t.year !== undefined && t.year !== null ? Number(t.year) : null,
    rating: Number(t.rating ?? 7.0),
    country: t.country || 'United States',
    region_tag: t.regionTag || 'Hollywood',
    genres: Array.isArray(t.genres) ? t.genres : [],
    poster: t.poster || '',
    backdrop: t.backdrop || '',
    trailer_youtube_id: t.trailerYoutubeId || '',
    featured: Boolean(t.featured),
    trending: t.trending !== false,
    request_count: Number(t.requestCount) || 0,
    last_requested_at: t.lastRequestedAt || null,
    payload: cleanPayload,
    created_at: t.createdAt || new Date().toISOString(),
    updated_at: t.updatedAt || new Date().toISOString(),
  };
}

function dbRowToTitle(row) {
  const payload = row && typeof row.payload === 'object' && row.payload ? row.payload : {};
  return {
    ...payload,
    id: row.id,
    tmdbId: row.tmdb_id,
    type: row.type || payload.type || 'movie',
    status: row.status || payload.status || 'draft',
    title: row.title || payload.title || 'Untitled',
    year: row.year ?? payload.year ?? null,
    rating: Number(row.rating ?? payload.rating ?? 7.0),
    country: row.country || payload.country || 'United States',
    regionTag: row.region_tag || payload.regionTag || 'Hollywood',
    genres: Array.isArray(row.genres)
      ? row.genres
      : Array.isArray(payload.genres)
      ? payload.genres
      : [],
    poster: row.poster ?? payload.poster ?? '',
    backdrop: row.backdrop ?? payload.backdrop ?? '',
    trailerYoutubeId: row.trailer_youtube_id ?? payload.trailerYoutubeId ?? '',
    featured: Boolean(row.featured),
    trending: row.trending !== false,
    requestCount: Number(row.request_count) || 0,
    lastRequestedAt: row.last_requested_at || null,
    createdAt: row.created_at || payload.createdAt,
    updatedAt: row.updated_at || payload.updatedAt,
  };
}

class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = null;
    this.cloudLoaded = false;
    this.lastSyncedAt = 0;
    this.syncPromise = null;
    this.pendingTitleUpserts = new Map();
    this.pendingTitleDeletes = new Set();
    this.pendingReviews = [];
    this.dirtyStateKeys = new Set();
    this.init();
  }

  isCloudEnabled() {
    return supabaseClient.isEnabled();
  }

  markStateDirty(key) {
    if (STATE_KEY_TO_FIELD[key]) {
      this.dirtyStateKeys.add(key);
    }
  }

  hasPendingCloudWrites() {
    return (
      this.pendingTitleUpserts.size > 0 ||
      this.pendingTitleDeletes.size > 0 ||
      this.pendingReviews.length > 0 ||
      this.dirtyStateKeys.size > 0
    );
  }

  async ensureSynced(force = false) {
    if (!this.isCloudEnabled()) return;
    if (!force && this.cloudLoaded && Date.now() - this.lastSyncedAt < SYNC_TTL_MS) return;
    if (this.syncPromise) return this.syncPromise;

    this.syncPromise = (async () => {
      try {
        const [titleRows, reviewRows, stateRows] = await Promise.all([
          supabaseClient.fetchAllRows('cms_titles', 'updated_at.desc'),
          supabaseClient.fetchAllRows('user_reviews', 'created_at.desc'),
          supabaseClient.fetchAllRows('app_state'),
        ]);

        if (Array.isArray(titleRows)) {
          this.data.cmsTitles = titleRows.map(dbRowToTitle);
        }

        if (Array.isArray(reviewRows)) {
          const grouped = {};
          for (const r of reviewRows) {
            if (!grouped[r.movie_id]) grouped[r.movie_id] = [];
            grouped[r.movie_id].push({
              id: r.id,
              author: r.author,
              rating: Number(r.rating),
              text: r.text,
              createdAt: r.created_at,
            });
          }
          this.data.comments = grouped;
        }

        if (Array.isArray(stateRows)) {
          for (const row of stateRows) {
            const field = STATE_KEY_TO_FIELD[row.key];
            if (field && row.value !== undefined && row.value !== null) {
              this.data[field] = row.value;
            }
          }
        }

        const envTmdbKey = (process.env.TMDB_API_KEY || ENV_TMDB_API_KEY || '').trim();
        if (!this.data.settings) this.data.settings = {};
        if (!this.data.settings.tmdbApiKey && envTmdbKey) {
          this.data.settings.tmdbApiKey = envTmdbKey;
        }
        if (!this.data.settings.mediaDir) {
          this.data.settings.mediaDir = DEFAULT_MEDIA_DIR;
        }

        this.cloudLoaded = true;
        this.lastSyncedAt = Date.now();
        if (!process.env.VERCEL) {
          this.save();
        }
      } finally {
        this.syncPromise = null;
      }
    })();

    return this.syncPromise;
  }

  async flush() {
    if (!this.isCloudEnabled() || !this.hasPendingCloudWrites()) return;

    const upserts = Array.from(this.pendingTitleUpserts.values());
    const deletes = Array.from(this.pendingTitleDeletes.values());
    const reviews = [...this.pendingReviews];
    const dirtyKeys = Array.from(this.dirtyStateKeys.values());

    this.pendingTitleUpserts.clear();
    this.pendingTitleDeletes.clear();
    this.pendingReviews = [];
    this.dirtyStateKeys.clear();

    const nowIso = new Date().toISOString();
    const stateRows = dirtyKeys.map((key) => {
      const field = STATE_KEY_TO_FIELD[key];
      const fallback = key === 'watchlist' || key === 'continue_watching' ? [] : {};
      return {
        key,
        value: this.data[field] ?? fallback,
        updated_at: nowIso,
      };
    });

    try {
      await Promise.all([
        upserts.length > 0
          ? supabaseClient.upsertRows('cms_titles', upserts.map(titleToDbRow), 'id')
          : Promise.resolve(),
        deletes.length > 0
          ? supabaseClient.deleteByIds('cms_titles', deletes)
          : Promise.resolve(),
        reviews.length > 0
          ? supabaseClient.upsertRows('user_reviews', reviews, 'id')
          : Promise.resolve(),
        stateRows.length > 0
          ? supabaseClient.upsertRows('app_state', stateRows, 'key')
          : Promise.resolve(),
      ]);
      this.cloudLoaded = true;
      this.lastSyncedAt = Date.now();
    } catch (err) {
      console.warn('[Store] Failed to flush writes to Supabase:', err.message);
    }
  }

  init() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch (err) {
      console.warn('[Store] Unable to ensure data directory:', err.message);
    }

    if (!fs.existsSync(this.filePath)) {
      this.data = createSeedData(DEFAULT_MEDIA_DIR, ENV_TMDB_API_KEY);
      this.save();
    } else {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        this.data = JSON.parse(raw);
        // Backfill env TMDB key if not configured in DB
        if (!this.data.settings) this.data.settings = {};
        if (!this.data.settings.tmdbApiKey && ENV_TMDB_API_KEY) {
          this.data.settings.tmdbApiKey = ENV_TMDB_API_KEY;
          this.save();
        }
        if (!this.data.settings.mediaDir) {
          this.data.settings.mediaDir = DEFAULT_MEDIA_DIR;
          this.save();
        }
      } catch (err) {
        console.error('Failed to parse db.json, recreating from seed:', err.message);
        this.data = createSeedData(DEFAULT_MEDIA_DIR, ENV_TMDB_API_KEY);
        this.save();
      }
    }
  }

  save() {
    try {
      const tempPath = `${this.filePath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tempPath, this.filePath);
    } catch (err) {
      console.warn('[Store] Non-fatal persistence skip:', err.message);
    }
  }

  getAll() {
    return this.data;
  }

  getSettings() {
    return this.data.settings;
  }

  updateSettings(patch) {
    this.data.settings = { ...this.data.settings, ...patch };
    this.markStateDirty('settings');
    this.save();
    return this.data.settings;
  }

  getMovies() {
    return this.data.movies || [];
  }

  getMovieById(id) {
    return this.getMovies().find((m) => m.id === id) || null;
  }

  addMovie(movie) {
    this.data.movies.unshift(movie);
    this.save();
    return movie;
  }

  updateMovie(id, updates) {
    const idx = this.data.movies.findIndex((m) => m.id === id);
    if (idx === -1) return null;
    this.data.movies[idx] = { ...this.data.movies[idx], ...updates, id };
    this.save();
    return this.data.movies[idx];
  }

  deleteMovie(id) {
    const before = this.data.movies.length;
    this.data.movies = this.data.movies.filter((m) => m.id !== id);
    if (this.data.movies.length !== before) {
      this.data.watchlist = (this.data.watchlist || []).filter((w) => w !== id);
      this.data.continueWatching = (this.data.continueWatching || []).filter((c) => c.movieId !== id);
      delete this.data.comments[id];
      this.save();
      return true;
    }
    return false;
  }

  incrementMetric(id, field) {
    const movie = this.getMovieById(id);
    if (!movie) return null;
    movie[field] = (movie[field] || 0) + 1;
    this.save();
    return movie[field];
  }

  // Watchlist
  getWatchlist() {
    return this.data.watchlist || [];
  }

  toggleWatchlist(movieId) {
    const set = new Set(this.data.watchlist || []);
    let added = false;
    if (set.has(movieId)) {
      set.delete(movieId);
    } else {
      set.add(movieId);
      added = true;
    }
    this.data.watchlist = Array.from(set);
    this.markStateDirty('watchlist');
    this.save();
    return { added, watchlist: this.data.watchlist };
  }

  // Continue Watching
  getContinueWatching() {
    return (this.data.continueWatching || []).sort(
      (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
    );
  }

  saveProgress({ movieId, episodeId, title, poster, currentTime, duration, sourceId }) {
    if (!this.data.continueWatching) this.data.continueWatching = [];
    const existingIdx = this.data.continueWatching.findIndex((item) => item.movieId === movieId);
    const percent = duration > 0 ? Math.min(100, Math.round((currentTime / duration) * 100)) : 0;

    // If essentially finished (> 95%), remove from continue watching
    if (percent >= 95 && duration > 30) {
      if (existingIdx !== -1) {
        this.data.continueWatching.splice(existingIdx, 1);
        this.markStateDirty('continue_watching');
        this.save();
      }
      return { removed: true };
    }

    const record = {
      movieId,
      episodeId: episodeId || null,
      title,
      poster,
      currentTime: Math.floor(currentTime),
      duration: Math.floor(duration || 0),
      percent,
      sourceId: sourceId || null,
      updatedAt: new Date().toISOString(),
    };

    if (existingIdx !== -1) {
      this.data.continueWatching[existingIdx] = record;
    } else {
      this.data.continueWatching.unshift(record);
    }

    // Keep last 20 items
    this.data.continueWatching = this.data.continueWatching.slice(0, 20);
    this.markStateDirty('continue_watching');
    this.save();
    return record;
  }

  removeProgress(movieId) {
    this.data.continueWatching = (this.data.continueWatching || []).filter(
      (item) => item.movieId !== movieId
    );
    this.markStateDirty('continue_watching');
    this.save();
  }

  // Comments
  getComments(movieId) {
    return (this.data.comments && this.data.comments[movieId]) || [];
  }

  addComment(movieId, comment) {
    if (!this.data.comments) this.data.comments = {};
    if (!this.data.comments[movieId]) this.data.comments[movieId] = [];
    this.data.comments[movieId].unshift(comment);
    this.pendingReviews.push({
      id: comment.id,
      movie_id: movieId,
      author: comment.author,
      rating: Number(comment.rating) || 8,
      text: comment.text,
      created_at: comment.createdAt || new Date().toISOString(),
    });
    this.save();
    return comment;
  }

  // Per-title / per-episode user source bindings (e.g. "tmdb:movie:123" or "tmdb:tv:456:s1:e1")
  getBoundSources(bindingKey) {
    if (!this.data.sourceBindings) return [];
    return this.data.sourceBindings[bindingKey] || [];
  }

  addBoundSource(bindingKey, source) {
    if (!this.data.sourceBindings) this.data.sourceBindings = {};
    if (!this.data.sourceBindings[bindingKey]) this.data.sourceBindings[bindingKey] = [];
    this.data.sourceBindings[bindingKey].unshift(source);
    this.markStateDirty('source_bindings');
    this.save();
    return this.data.sourceBindings[bindingKey];
  }

  removeBoundSource(bindingKey, sourceId) {
    if (!this.data.sourceBindings || !this.data.sourceBindings[bindingKey]) return [];
    this.data.sourceBindings[bindingKey] = this.data.sourceBindings[bindingKey].filter(
      (s) => s.id !== sourceId
    );
    this.markStateDirty('source_bindings');
    this.save();
    return this.data.sourceBindings[bindingKey];
  }

  // ==================== CMS PUBLISHING PIPELINE ====================
  getCmsTitles() {
    if (!Array.isArray(this.data.cmsTitles)) {
      this.data.cmsTitles = [];
      this.save();
    }
    return this.data.cmsTitles;
  }

  getCmsTitleById(id) {
    return this.getCmsTitles().find((t) => t.id === id) || null;
  }

  getCmsTitleByTmdb(type, tmdbId) {
    const normType = type === 'tv' || type === 'series' ? 'series' : 'movie';
    return (
      this.getCmsTitles().find(
        (t) => t.tmdbId && Number(t.tmdbId) === Number(tmdbId) && t.type === normType
      ) || null
    );
  }

  upsertCmsTitle(titleObj) {
    const list = this.getCmsTitles();
    const idx = list.findIndex((t) => t.id === titleObj.id);
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...titleObj, updatedAt: new Date().toISOString() };
      this.pendingTitleDeletes.delete(list[idx].id);
      this.pendingTitleUpserts.set(list[idx].id, list[idx]);
      this.save();
      return list[idx];
    }
    const created = {
      ...titleObj,
      createdAt: titleObj.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    list.unshift(created);
    this.pendingTitleDeletes.delete(created.id);
    this.pendingTitleUpserts.set(created.id, created);
    this.save();
    return created;
  }

  bulkUpsertCmsTitles(records = []) {
    if (!Array.isArray(records) || records.length === 0) return [];
    const list = this.getCmsTitles();
    const byId = new Map(list.map((t, idx) => [t.id, idx]));
    const nowIso = new Date().toISOString();
    const saved = [];

    for (const item of records) {
      if (!item || !item.id) continue;
      const idx = byId.get(item.id);
      if (idx !== undefined) {
        list[idx] = { ...list[idx], ...item, updatedAt: nowIso };
        this.pendingTitleDeletes.delete(list[idx].id);
        this.pendingTitleUpserts.set(list[idx].id, list[idx]);
        saved.push(list[idx]);
      } else {
        const created = {
          ...item,
          createdAt: item.createdAt || nowIso,
          updatedAt: item.updatedAt || nowIso,
        };
        list.push(created);
        byId.set(created.id, list.length - 1);
        this.pendingTitleDeletes.delete(created.id);
        this.pendingTitleUpserts.set(created.id, created);
        saved.push(created);
      }
    }

    this.save();
    return saved;
  }

  deleteCmsTitle(id) {
    const list = this.getCmsTitles();
    const before = list.length;
    this.data.cmsTitles = list.filter((t) => t.id !== id);
    if (this.data.cmsTitles.length !== before) {
      this.pendingTitleUpserts.delete(id);
      this.pendingTitleDeletes.add(id);
      this.save();
      return true;
    }
    return false;
  }
}

const store = new JsonStore(DB_PATH);
module.exports = store;
