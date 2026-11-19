import { api, showToast, escapeHtml } from './api.js';
import { CinemaPlayer } from './player.js';
import {
  renderHomeView,
  renderCatalogView,
  renderDownloadHubView,
  renderDiscoverView,
  renderLocalDriveView,
  renderAdminView,
  renderSettingsView,
  renderDetailModal,
  renderTmdbDetailModal,
} from './views.js';

const state = {
  view: 'home',
  movies: [],
  genres: [],
  watchlist: [],
  continueWatching: [],
  settings: {},
  heroIndex: 0,
  searchQuery: '',
  filters: {
    genre: 'All',
    quality: 'All',
    sort: 'newest',
  },
  // TMDB
  tmdbConfigured: false,
  tmdbHomeItems: [],
  tmdbItems: [],
  tmdbActiveTab: 'all',
  tmdbQuery: '',
  tmdbLoading: false,
  tmdbError: '',
  activeTmdbDetail: null,
  showTmdbTrailer: true,
  // Local Drive
  localScan: null,
  // Admin
  adminOverview: null,
  editingMovie: null,
  // Active Detail Modal
  activeDetail: null,
  showTrailer: false,
};

const appMain = document.getElementById('appMain');
const detailModal = document.getElementById('detailModal');
const detailModalBody = document.getElementById('detailModalBody');
const globalSearch = document.getElementById('globalSearch');
const searchClear = document.getElementById('searchClear');
const watchlistCount = document.getElementById('watchlistCount');

const player = new CinemaPlayer(async () => {
  await refreshUserState();
  if (state.view === 'home') render();
});

let heroTimer = null;

async function refreshCatalog() {
  const data = await api.getCatalog({ sort: state.filters.sort });
  state.movies = data.items || [];
  state.genres = data.genres || [];
}

async function refreshUserState() {
  const u = await api.getUserState();
  state.watchlist = u.watchlist || [];
  state.continueWatching = u.continueWatching || [];
  state.settings = u.settings || {};
  state.tmdbConfigured = Boolean(u.settings?.hasTmdbKey);
  watchlistCount.textContent = String(state.watchlist.length);

  // Update brand name if customized
  if (state.settings.siteName) {
    const name = state.settings.siteName;
    const mid = Math.ceil(name.length / 2);
    document.getElementById('brandName').innerHTML = `${escapeHtml(name.slice(0, mid))}<span>${escapeHtml(name.slice(mid))}</span>`;
    document.title = `${name} — Stream, Discover & Download`;
  }
}

function getFilteredMovies(forcedType = 'all') {
  let list = [...state.movies];
  if (forcedType !== 'all') list = list.filter((m) => m.type === forcedType);

  if (state.filters.genre !== 'All') {
    list = list.filter((m) => (m.genres || []).includes(state.filters.genre));
  }
  if (state.filters.quality !== 'All') {
    const q = state.filters.quality.toLowerCase();
    list = list.filter((m) => (m.sources || []).some((s) => (s.quality || '').toLowerCase() === q));
  }
  if (state.searchQuery.trim()) {
    const term = state.searchQuery.trim().toLowerCase();
    list = list.filter(
      (m) =>
        (m.title || '').toLowerCase().includes(term) ||
        (m.overview || '').toLowerCase().includes(term) ||
        (m.director || '').toLowerCase().includes(term) ||
        (m.genres || []).some((g) => g.toLowerCase().includes(term)) ||
        (m.cast || []).some((c) => (c.name || '').toLowerCase().includes(term)) ||
        String(m.year || '').includes(term)
    );
  }

  switch (state.filters.sort) {
    case 'rating':
      list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      break;
    case 'downloads':
      list.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
      break;
    case 'views':
      list.sort((a, b) => (b.views || 0) - (a.views || 0));
      break;
    case 'year':
      list.sort((a, b) => (b.year || 0) - (a.year || 0));
      break;
    case 'title':
      list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      break;
    default:
      list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }
  return list;
}

function syncNavActive() {
  document.querySelectorAll('[data-view]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === state.view);
  });
}

async function navigate(view) {
  state.view = view;
  syncNavActive();
  window.scrollTo({ top: 0, behavior: 'instant' });

  if (view === 'discover' && state.tmdbConfigured && !state.tmdbItems.length) {
    await loadTmdbTrending('all');
    return;
  }
  if (view === 'local') {
    await loadLocalScan();
    return;
  }
  if (view === 'admin' || view === 'settings') {
    await loadAdminOverview();
    return;
  }
  render();
}

async function loadTmdbTrending(type = 'all') {
  state.tmdbActiveTab = type;
  state.tmdbLoading = true;
  state.tmdbError = '';
  render();
  try {
    const res = await api.getTmdbTrending(type);
    state.tmdbItems = res.items || [];
  } catch (err) {
    state.tmdbError = err.message;
  } finally {
    state.tmdbLoading = false;
    render();
  }
}

async function loadTmdbFeed(category) {
  state.tmdbActiveTab = category;
  state.tmdbLoading = true;
  state.tmdbError = '';
  render();
  try {
    const res = await api.getTmdbFeed(category);
    state.tmdbItems = res.items || [];
  } catch (err) {
    state.tmdbError = err.message;
  } finally {
    state.tmdbLoading = false;
    render();
  }
}

async function openTmdbDetail(tmdbId, mediaType = 'movie') {
  try {
    detailModalBody.innerHTML = `<div class="empty-state" style="border:none"><div class="spinner-ring" style="margin:0 auto 12px"></div><p>Loading live TMDB metadata &amp; trailer...</p></div>`;
    detailModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    const detail = await api.getTmdbDetails(mediaType, tmdbId);
    state.activeTmdbDetail = detail;
    state.showTmdbTrailer = Boolean(detail.trailerYoutubeId);
    renderActiveTmdbModal();
  } catch (err) {
    closeDetail();
    showToast(err.message, 'error');
  }
}

function renderActiveTmdbModal() {
  if (!state.activeTmdbDetail) return;
  detailModalBody.innerHTML = renderTmdbDetailModal(state.activeTmdbDetail, state.showTmdbTrailer);

  document.getElementById('closeModalBtn')?.addEventListener('click', closeDetail);
  document.getElementById('toggleTmdbTrailerBtn')?.addEventListener('click', () => {
    state.showTmdbTrailer = !state.showTmdbTrailer;
    renderActiveTmdbModal();
  });

  const importForm = document.getElementById('tmdbImportForm');
  if (importForm) {
    importForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(importForm);
      try {
        const created = await api.importTmdb({
          tmdbId: Number(importForm.dataset.tmdbId),
          mediaType: importForm.dataset.tmdbType,
          streamUrl: fd.get('streamUrl') || '',
          quality: fd.get('quality') || '1080p',
          size: fd.get('size') || 'Stream',
        });
        await refreshCatalog();
        showToast(`Imported "${created.title}" into your CineBox library!`);
        await openDetail(created.id);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }
}

async function runTmdbSearch(q) {
  state.tmdbQuery = q;
  if (!q.trim()) return loadTmdbTrending('all');
  state.tmdbLoading = true;
  state.tmdbError = '';
  render();
  try {
    const res = await api.searchTmdb(q);
    state.tmdbItems = res.items || [];
  } catch (err) {
    state.tmdbError = err.message;
  } finally {
    state.tmdbLoading = false;
    render();
  }
}

async function loadLocalScan() {
  try {
    state.localScan = await api.scanLocalMedia();
  } catch (err) {
    showToast(err.message, 'error');
  }
  render();
}

async function loadAdminOverview() {
  try {
    state.adminOverview = await api.getAdminOverview();
  } catch (err) {
    showToast(err.message, 'error');
  }
  render();
}

async function openDetail(movieId, showTrailer = false) {
  try {
    const detail = await api.getMovie(movieId);
    state.activeDetail = detail;
    state.showTrailer = showTrailer;
    detailModalBody.innerHTML = renderDetailModal(detail, new Set(state.watchlist), showTrailer);
    detailModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    bindModalInnerEvents();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function closeDetail() {
  detailModal.classList.add('hidden');
  detailModalBody.innerHTML = '';
  state.activeDetail = null;
  state.showTrailer = false;
  if (!player.isOpen) document.body.style.overflow = '';
}

function bindModalInnerEvents() {
  const closeBtn = document.getElementById('closeModalBtn');
  if (closeBtn) closeBtn.addEventListener('click', closeDetail);

  const trailerBtn = document.getElementById('toggleTrailerBtn');
  if (trailerBtn && state.activeDetail) {
    trailerBtn.addEventListener('click', () => {
      state.showTrailer = !state.showTrailer;
      detailModalBody.innerHTML = renderDetailModal(
        state.activeDetail,
        new Set(state.watchlist),
        state.showTrailer
      );
      bindModalInnerEvents();
    });
  }

  // Play specific episode
  detailModalBody.querySelectorAll('[data-play-ep]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const epId = btn.dataset.playEp;
      const seasonNum = Number(btn.dataset.season);
      const season = (state.activeDetail?.seasons || []).find((s) => s.seasonNumber === seasonNum);
      const episodes = season?.episodes || [];
      const ep = episodes.find((e) => e.id === epId);
      if (ep) {
        closeDetail();
        player.open({ movie: state.activeDetail, episode: ep, episodesList: episodes });
      }
    });
  });

  // Comment submit
  const commentForm = document.getElementById('commentForm');
  if (commentForm) {
    commentForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const movieId = commentForm.dataset.movieId;
      const fd = new FormData(commentForm);
      try {
        await api.addComment(movieId, {
          author: fd.get('author'),
          rating: Number(fd.get('rating')),
          text: fd.get('text'),
        });
        showToast('Comment posted!');
        await openDetail(movieId, state.showTrailer);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }
}

function render() {
  // If user typed in global search bar, show unified search results view
  if (state.searchQuery.trim() && ['home', 'movies', 'series', 'downloads', 'watchlist'].includes(state.view)) {
    const results = getFilteredMovies('all');
    appMain.innerHTML = renderCatalogView(
      state,
      `Search Results: "${state.searchQuery}"`,
      'Instant search across titles, genres, directors & cast',
      results
    );
    bindViewDynamicControls();
    return;
  }

  switch (state.view) {
    case 'home':
      appMain.innerHTML = renderHomeView(state);
      break;
    case 'movies':
      appMain.innerHTML = renderCatalogView(
        state,
        'Movies Library',
        'Stream in HD/HLS or download multi-quality mirrors',
        getFilteredMovies('movie')
      );
      break;
    case 'series':
      appMain.innerHTML = renderCatalogView(
        state,
        'TV Series & Anthologies',
        'Multi-episode series with auto-next playback and season downloads',
        getFilteredMovies('series')
      );
      break;
    case 'downloads':
      appMain.innerHTML = renderDownloadHubView(state, getFilteredMovies('all'));
      break;
    case 'discover':
      appMain.innerHTML = renderDiscoverView(state);
      break;
    case 'local':
      appMain.innerHTML = renderLocalDriveView(state);
      break;
    case 'watchlist': {
      const set = new Set(state.watchlist);
      const saved = getFilteredMovies('all').filter((m) => set.has(m.id));
      appMain.innerHTML = renderCatalogView(
        state,
        'My Watchlist',
        'Your saved movies & series ready to watch anytime',
        saved
      );
      break;
    }
    case 'admin':
      appMain.innerHTML = renderAdminView(state);
      break;
    case 'settings':
      appMain.innerHTML = renderSettingsView(state);
      break;
  }

  bindViewDynamicControls();
}

function bindViewDynamicControls() {
  // Quality & Sort selects
  const qualityFilter = document.getElementById('qualityFilter');
  if (qualityFilter) {
    qualityFilter.addEventListener('change', (e) => {
      state.filters.quality = e.target.value;
      render();
    });
  }
  const sortFilter = document.getElementById('sortFilter');
  if (sortFilter) {
    sortFilter.addEventListener('change', (e) => {
      state.filters.sort = e.target.value;
      render();
    });
  }

  // TMDB Search controls
  const tmdbBtn = document.getElementById('tmdbSearchBtn');
  const tmdbInput = document.getElementById('tmdbSearchInput');
  if (tmdbBtn && tmdbInput) {
    tmdbBtn.addEventListener('click', () => runTmdbSearch(tmdbInput.value));
    tmdbInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') runTmdbSearch(tmdbInput.value);
    });
  }

  // Local Drive Controls
  const rescanBtn = document.getElementById('rescanLocalBtn');
  if (rescanBtn) rescanBtn.addEventListener('click', loadLocalScan);

  const triggerLocalUpload = document.getElementById('triggerLocalUploadBtn');
  const localUploadInput = document.getElementById('localVideoUploadInput');
  if (triggerLocalUpload && localUploadInput) {
    triggerLocalUpload.addEventListener('click', () => localUploadInput.click());
    localUploadInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const progWrap = document.getElementById('localUploadProgress');
      const bar = document.getElementById('localUploadBar');
      const lbl = document.getElementById('localUploadLabel');
      progWrap.classList.remove('hidden');
      try {
        await api.uploadFile('/api/admin/upload/video', file, (pct) => {
          bar.style.width = `${pct}%`;
          lbl.textContent = `Uploading ${file.name} — ${pct}%`;
        });
        showToast(`Uploaded "${file.name}" to your Local Media Drive!`);
        await loadLocalScan();
      } catch (err) {
        showToast(err.message, 'error');
        progWrap.classList.add('hidden');
      }
    });
  }

  // Admin Form & Source Builder
  const adminForm = document.getElementById('adminMovieForm');
  if (adminForm) {
    const srcContainer = document.getElementById('sourceRowsContainer');
    const addSrcBtn = document.getElementById('addSourceRowBtn');
    const bindRemoveBtns = () => {
      srcContainer.querySelectorAll('.remove-src-row').forEach((b) => {
        b.onclick = () => {
          if (srcContainer.children.length > 1) b.closest('.source-builder-row').remove();
        };
      });
    };
    bindRemoveBtns();

    addSrcBtn?.addEventListener('click', () => {
      const row = document.createElement('div');
      row.className = 'source-builder-row';
      row.style.cssText = 'display:grid;grid-template-columns:1.2fr 0.6fr 0.6fr 0.6fr 2fr auto;gap:8px;margin-bottom:8px';
      row.innerHTML = `
        <input class="text-input src-label" placeholder="Server label" value="Server ${srcContainer.children.length + 1}" />
        <select class="select-input src-quality">
          <option value="4K">4K</option><option value="1080p" selected>1080p</option><option value="720p">720p</option><option value="480p">480p</option><option value="360p">360p</option>
        </select>
        <select class="select-input src-type">
          <option value="mp4">MP4 / Direct</option><option value="hls">HLS (.m3u8)</option>
        </select>
        <input class="text-input src-size" placeholder="Size (e.g. 520 MB)" />
        <input class="text-input src-url" placeholder="Stream / Download URL" />
        <button type="button" class="btn btn-danger btn-sm remove-src-row">&times;</button>
      `;
      srcContainer.appendChild(row);
      bindRemoveBtns();
    });

    // Poster upload button
    const posterBtn = document.getElementById('posterUploadBtn');
    const posterFile = document.getElementById('posterUploadFile');
    if (posterBtn && posterFile) {
      posterBtn.addEventListener('click', () => posterFile.click());
      posterFile.addEventListener('change', async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        try {
          const uploaded = await api.uploadFile('/api/admin/upload/poster', f);
          document.getElementById('posterUrlInput').value = uploaded.url;
          showToast('Poster uploaded!');
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }

    const cancelEdit = () => {
      state.editingMovie = null;
      render();
    };
    document.getElementById('cancelEditBtn')?.addEventListener('click', cancelEdit);
    document.getElementById('cancelEditBtn2')?.addEventListener('click', cancelEdit);

    adminForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(adminForm);
      const sources = Array.from(srcContainer.querySelectorAll('.source-builder-row'))
        .map((row) => ({
          label: row.querySelector('.src-label').value.trim(),
          quality: row.querySelector('.src-quality').value,
          type: row.querySelector('.src-type').value,
          size: row.querySelector('.src-size').value.trim() || 'Stream',
          url: row.querySelector('.src-url').value.trim(),
        }))
        .filter((s) => s.url);

      const payload = {
        title: fd.get('title'),
        type: fd.get('type'),
        year: Number(fd.get('year')),
        rating: Number(fd.get('rating')),
        runtime: Number(fd.get('runtime')),
        genres: fd.get('genres'),
        director: fd.get('director'),
        trailerYoutubeId: fd.get('trailerYoutubeId'),
        poster: fd.get('poster'),
        backdrop: fd.get('backdrop'),
        overview: fd.get('overview'),
        featured: fd.get('featured') === 'on',
        trending: fd.get('trending') === 'on',
        sources,
      };

      try {
        if (state.editingMovie) {
          await api.updateMovie(state.editingMovie.id, payload);
          showToast(`Updated "${payload.title}"!`);
          state.editingMovie = null;
        } else {
          await api.createMovie(payload);
          showToast(`Published "${payload.title}" to catalog!`);
        }
        await refreshCatalog();
        await loadAdminOverview();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // Settings form
  const settingsForm = document.getElementById('settingsForm');
  if (settingsForm) {
    settingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(settingsForm);
      try {
        await api.updateSettings({
          siteName: fd.get('siteName'),
          defaultQuality: fd.get('defaultQuality'),
          tmdbApiKey: fd.get('tmdbApiKey'),
          mediaDir: fd.get('mediaDir'),
        });
        await refreshUserState();
        await loadAdminOverview();
        showToast('Settings saved successfully!');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }
}

// Global delegated click handling
document.addEventListener('click', async (e) => {
  // Nav view buttons
  const navBtn = e.target.closest('[data-view]');
  if (navBtn) {
    state.searchQuery = '';
    globalSearch.value = '';
    searchClear.classList.add('hidden');
    await navigate(navBtn.dataset.view);
    return;
  }

  const navGo = e.target.closest('[data-nav-go]');
  if (navGo) {
    await navigate(navGo.dataset.navGo);
    return;
  }

  // Hero dots
  const dot = e.target.closest('[data-hero-dot]');
  if (dot) {
    state.heroIndex = Number(dot.dataset.heroDot);
    render();
    return;
  }

  // Download metric hit
  const dlHit = e.target.closest('[data-dl-hit]');
  if (dlHit) {
    api.recordDownloadHit(dlHit.dataset.dlHit).catch(() => {});
    showToast('Download started!');
    return;
  }

  // Toggle watchlist
  const wlBtn = e.target.closest('[data-toggle-watchlist]');
  if (wlBtn) {
    e.stopPropagation();
    const id = wlBtn.dataset.toggleWatchlist;
    try {
      const res = await api.toggleWatchlist(id);
      state.watchlist = res.watchlist;
      watchlistCount.textContent = String(state.watchlist.length);
      showToast(res.added ? 'Added to My List' : 'Removed from My List');
      render();
      if (state.activeDetail && state.activeDetail.id === id) {
        detailModalBody.innerHTML = renderDetailModal(
          state.activeDetail,
          new Set(state.watchlist),
          state.showTrailer
        );
        bindModalInnerEvents();
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
    return;
  }

  // Quick play (best source)
  const quickPlay = e.target.closest('[data-quick-play]');
  if (quickPlay) {
    e.stopPropagation();
    const id = quickPlay.dataset.quickPlay;
    const movie = state.movies.find((m) => m.id === id) || state.activeDetail;
    if (movie) {
      closeDetail();
      if (movie.type === 'series' && movie.seasons?.[0]?.episodes?.length) {
        player.open({
          movie,
          episode: movie.seasons[0].episodes[0],
          episodesList: movie.seasons[0].episodes,
        });
      } else {
        player.open({ movie, sourceIndex: 0 });
      }
    }
    return;
  }

  // Play specific source mirror
  const playSrc = e.target.closest('[data-play-source]');
  if (playSrc) {
    e.stopPropagation();
    const id = playSrc.dataset.playSource;
    const idx = Number(playSrc.dataset.srcIdx || 0);
    const movie = state.movies.find((m) => m.id === id) || state.activeDetail;
    if (movie) {
      closeDetail();
      player.open({ movie, sourceIndex: idx });
    }
    return;
  }

  // Resume from Continue Watching
  const clearCw = e.target.closest('[data-clear-cw]');
  if (clearCw) {
    e.stopPropagation();
    await api.removeProgress(clearCw.dataset.clearCw);
    await refreshUserState();
    render();
    return;
  }

  const resumeCard = e.target.closest('[data-resume-play]');
  if (resumeCard) {
    const id = resumeCard.dataset.resumePlay;
    const time = Number(resumeCard.dataset.resumeTime || 0);
    const movie = state.movies.find((m) => m.id === id);
    if (movie) {
      player.open({ movie, sourceIndex: 0, resumeTime: time });
    }
    return;
  }

  // Open detail modal
  const openDetailEl = e.target.closest('[data-open-detail]');
  if (openDetailEl) {
    await openDetail(openDetailEl.dataset.openDetail);
    return;
  }

  // Filter genre chips
  const genreChip = e.target.closest('[data-filter-genre]');
  if (genreChip) {
    state.filters.genre = genreChip.dataset.filterGenre;
    render();
    return;
  }

  if (e.target.closest('[data-reset-filters]')) {
    state.filters = { genre: 'All', quality: 'All', sort: 'newest' };
    state.searchQuery = '';
    globalSearch.value = '';
    searchClear.classList.add('hidden');
    render();
    return;
  }

  // TMDB trending & feed tabs
  const tmdbTrend = e.target.closest('[data-tmdb-trend]');
  if (tmdbTrend) {
    await loadTmdbTrending(tmdbTrend.dataset.tmdbTrend);
    return;
  }

  const tmdbFeed = e.target.closest('[data-tmdb-feed]');
  if (tmdbFeed) {
    await loadTmdbFeed(tmdbFeed.dataset.tmdbFeed);
    return;
  }

  // Open rich TMDB preview modal (with Trailer + Cast + Import form)
  const openTmdbEl = e.target.closest('[data-open-tmdb]');
  if (openTmdbEl) {
    await openTmdbDetail(openTmdbEl.dataset.openTmdb, openTmdbEl.dataset.tmdbType || 'movie');
    return;
  }

  // TMDB 1-click import
  const tmdbImport = e.target.closest('[data-tmdb-import]');
  if (tmdbImport) {
    const tmdbId = tmdbImport.dataset.tmdbImport;
    const mediaType = tmdbImport.dataset.tmdbType;
    const title = tmdbImport.dataset.tmdbTitle;
    const streamUrl = window.prompt(
      `Importing "${title}" from TMDB!\n\nOptional: Paste a direct MP4 or HLS (.m3u8) stream URL now (or leave blank to attach later in Admin Studio):`,
      ''
    );
    if (streamUrl === null) return; // Cancelled
    try {
      const created = await api.importTmdb({ tmdbId, mediaType, streamUrl });
      await refreshCatalog();
      showToast(`Imported "${created.title}" into your library!`);
      await openDetail(created.id);
    } catch (err) {
      showToast(err.message, 'error');
    }
    return;
  }

  // Local Drive: Play local file immediately
  const playLocal = e.target.closest('[data-play-local]');
  if (playLocal) {
    const file = (state.localScan?.files || []).find((f) => f.id === playLocal.dataset.playLocal);
    if (file) {
      player.open({
        movie: {
          id: file.id,
          title: file.title,
          subtitles: file.subtitles || [],
          sources: [
            {
              id: file.id,
              label: `Local Drive (${file.extension})`,
              quality: file.quality,
              type: 'mp4',
              size: file.sizeFormatted,
              url: file.streamUrl,
              downloadUrl: file.downloadUrl,
            },
          ],
        },
      });
    }
    return;
  }

  // Local Drive: Import to Catalog
  const importLocal = e.target.closest('[data-import-local]');
  if (importLocal) {
    try {
      const created = await api.importLocalMedia(importLocal.dataset.importLocal);
      await refreshCatalog();
      showToast(`Added "${created.title}" to your main catalog!`);
    } catch (err) {
      showToast(err.message, 'error');
    }
    return;
  }

  // Admin: Edit or Delete
  const adminEdit = e.target.closest('[data-admin-edit]');
  if (adminEdit) {
    const m = state.movies.find((x) => x.id === adminEdit.dataset.adminEdit);
    if (m) {
      state.editingMovie = m;
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    return;
  }

  const adminDelete = e.target.closest('[data-admin-delete]');
  if (adminDelete) {
    const id = adminDelete.dataset.adminDelete;
    const m = state.movies.find((x) => x.id === id);
    if (confirm(`Delete "${m?.title || 'this title'}" from your catalog?`)) {
      try {
        await api.deleteMovie(id);
        await refreshCatalog();
        await loadAdminOverview();
        showToast('Title deleted.');
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
    return;
  }
});

// Modal backdrop click & Escape
detailModal.addEventListener('click', (e) => {
  if (e.target === detailModal) closeDetail();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !detailModal.classList.contains('hidden')) closeDetail();
});

// Brand home button
document.getElementById('brandBtn').addEventListener('click', () => navigate('home'));

// Live Global Search
globalSearch.addEventListener('input', (e) => {
  state.searchQuery = e.target.value;
  searchClear.classList.toggle('hidden', !state.searchQuery);
  render();
});

searchClear.addEventListener('click', () => {
  state.searchQuery = '';
  globalSearch.value = '';
  searchClear.classList.add('hidden');
  render();
});

// Bootstrap application
async function init() {
  try {
    await Promise.all([refreshCatalog(), refreshUserState()]);
    render();

    // If TMDB is configured, fetch live worldwide trending row for Home in background
    if (state.tmdbConfigured) {
      api
        .getTmdbTrending('all')
        .then((res) => {
          state.tmdbHomeItems = res.items || [];
          if (!state.tmdbItems.length) state.tmdbItems = state.tmdbHomeItems;
          if (state.view === 'home') render();
        })
        .catch(() => {});
    }

    // Auto-advance hero banner every 8s when on Home
    heroTimer = setInterval(() => {
      if (state.view === 'home' && !player.isOpen && detailModal.classList.contains('hidden') && !state.searchQuery) {
        state.heroIndex++;
        render();
      }
    }, 8000);
  } catch (err) {
    appMain.innerHTML = `<div class="container" style="padding-top:40px"><div class="empty-state"><h3>Failed to connect to CineBox server</h3><p>${escapeHtml(err.message)}</p></div></div>`;
  }
}

init();
