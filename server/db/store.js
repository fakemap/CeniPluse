const fs = require('fs');
const path = require('path');
const { DB_PATH, DEFAULT_MEDIA_DIR, ENV_TMDB_API_KEY } = require('../config');
const { createSeedData } = require('./seed');

class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = null;
    this.init();
  }

  init() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
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
    const tempPath = `${this.filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2), 'utf-8');
    fs.renameSync(tempPath, this.filePath);
  }

  getAll() {
    return this.data;
  }

  getSettings() {
    return this.data.settings;
  }

  updateSettings(patch) {
    this.data.settings = { ...this.data.settings, ...patch };
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
    this.save();
    return record;
  }

  removeProgress(movieId) {
    this.data.continueWatching = (this.data.continueWatching || []).filter(
      (item) => item.movieId !== movieId
    );
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
    this.save();
    return this.data.sourceBindings[bindingKey];
  }

  removeBoundSource(bindingKey, sourceId) {
    if (!this.data.sourceBindings || !this.data.sourceBindings[bindingKey]) return [];
    this.data.sourceBindings[bindingKey] = this.data.sourceBindings[bindingKey].filter(
      (s) => s.id !== sourceId
    );
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
      this.save();
      return list[idx];
    }
    const created = {
      ...titleObj,
      createdAt: titleObj.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    list.unshift(created);
    this.save();
    return created;
  }

  deleteCmsTitle(id) {
    const list = this.getCmsTitles();
    const before = list.length;
    this.data.cmsTitles = list.filter((t) => t.id !== id);
    if (this.data.cmsTitles.length !== before) {
      this.save();
      return true;
    }
    return false;
  }
}

const store = new JsonStore(DB_PATH);
module.exports = store;
