import { escapeHtml, formatTime } from './api.js';

function getBestQuality(movie) {
  const sources = movie.sources || [];
  if (!sources.length) return movie.trailerYoutubeId ? 'TRAILER' : 'NO SRC';
  const order = ['4K', '2160p', '1080p', '720p', '480p', '360p'];
  for (const q of order) {
    if (sources.some((s) => (s.quality || '').toUpperCase() === q)) return q;
  }
  return sources[0].quality || 'HD';
}

export function renderPosterImg(src, title, cls = '') {
  if (!src) {
    return `<div class="poster-fallback ${cls}">${escapeHtml(title)}</div>`;
  }
  return `<img src="${escapeHtml(src)}" alt="${escapeHtml(title)}" class="${cls}" loading="lazy" onerror="this.outerHTML='<div class=\\'poster-fallback ${cls}\\'>${escapeHtml(title).replace(/'/g, '')}</div>'" />`;
}

export function renderMovieCard(movie, watchlistSet) {
  const inList = watchlistSet.has(movie.id);
  const quality = getBestQuality(movie);
  const firstDl = (movie.sources || []).find((s) => s.downloadUrl);

  return `
    <article class="movie-card" data-open-detail="${escapeHtml(movie.id)}">
      <div class="poster-wrap">
        ${renderPosterImg(movie.poster, movie.title)}
        <div class="card-badges">
          <span class="q-badge">${escapeHtml(quality)}</span>
          <span class="r-badge">&#9733; ${Number(movie.rating || 0).toFixed(1)}</span>
        </div>
        <div class="card-overlay">
          <button class="circle-action" data-quick-play="${escapeHtml(movie.id)}" title="Play Now">
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><polygon points="6 4 20 12 6 20 6 4"/></svg>
          </button>
          <button class="circle-action secondary" data-toggle-watchlist="${escapeHtml(movie.id)}" title="${inList ? 'Remove from My List' : 'Add to My List'}">
            ${inList ? '&#10003;' : '+'}
          </button>
          ${
            firstDl
              ? `<a class="circle-action secondary" href="${escapeHtml(firstDl.downloadUrl)}" target="_blank" download data-dl-hit="${escapeHtml(movie.id)}" title="Download (${escapeHtml(firstDl.quality)})">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="16" height="16"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                </a>`
              : ''
          }
        </div>
      </div>
      <div class="card-info">
        <div class="card-title" title="${escapeHtml(movie.title)}">${escapeHtml(movie.title)}</div>
        <div class="card-sub">
          <span>${movie.year || '—'} &bull; ${movie.type === 'series' ? 'Series' : 'Movie'}</span>
          <span>${escapeHtml((movie.genres || [])[0] || '')}</span>
        </div>
      </div>
    </article>
  `;
}

export function renderTmdbCard(item) {
  return `
    <article class="movie-card" data-open-tmdb="${item.tmdbId}" data-tmdb-type="${escapeHtml(item.mediaType || (item.type === 'series' ? 'tv' : 'movie'))}">
      <div class="poster-wrap">
        ${renderPosterImg(item.poster, item.title)}
        <div class="card-badges">
          <span class="q-badge" style="color:#67e8f9">${item.type === 'series' ? 'TV • TMDB' : 'TMDB'}</span>
          <span class="r-badge">&#9733; ${Number(item.rating || 0).toFixed(1)}</span>
        </div>
        <div class="card-overlay" style="flex-direction:column;gap:8px;padding:14px">
          <span class="btn btn-primary btn-sm">Trailer &amp; Details</span>
        </div>
      </div>
      <div class="card-info">
        <div class="card-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
        <div class="card-sub">
          <span>${item.year || '—'} &bull; ${item.type === 'series' ? 'Series' : 'Movie'}</span>
          <span>${escapeHtml(item.language || 'EN')}</span>
        </div>
      </div>
    </article>
  `;
}

export function renderHomeView(state) {
  const { movies, watchlist, continueWatching, heroIndex, tmdbHomeItems = [] } = state;
  const watchlistSet = new Set(watchlist);
  const featured = movies.filter((m) => m.featured);
  const heroPool = featured.length ? featured : movies.slice(0, 3);
  const hero = heroPool[heroIndex % Math.max(1, heroPool.length)];

  const trending = movies.filter((m) => m.trending);
  const series = movies.filter((m) => m.type === 'series');
  const topRated = [...movies].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 10);
  const mostDownloaded = [...movies].sort((a, b) => (b.downloads || 0) - (a.downloads || 0)).slice(0, 10);

  const heroHtml = hero
    ? `
    <section class="hero">
      <div class="hero-bg" style="background-image:url('${escapeHtml(hero.backdrop || hero.poster)}')"></div>
      <div class="hero-vignette"></div>
      <div class="hero-content">
        <div class="hero-eyebrow">&#9733; Featured Premiere</div>
        <h1 class="hero-title">${escapeHtml(hero.title)}</h1>
        <div class="hero-meta">
          <span class="meta-star">&#9733; ${Number(hero.rating || 0).toFixed(1)}</span>
          <span>${hero.year || ''}</span>
          ${hero.runtime ? `<span>${hero.runtime} min</span>` : ''}
          <span class="meta-tag hd">${escapeHtml(getBestQuality(hero))}</span>
          <span class="meta-tag">${escapeHtml(hero.maturity || 'PG-13')}</span>
          <span>${escapeHtml((hero.genres || []).join(' • '))}</span>
        </div>
        <p class="hero-overview">${escapeHtml(hero.overview)}</p>
        <div class="hero-actions">
          <button class="btn btn-primary" data-quick-play="${escapeHtml(hero.id)}">
            <svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17"><polygon points="6 4 20 12 6 20 6 4"/></svg>
            Watch Now
          </button>
          <button class="btn btn-glass" data-open-detail="${escapeHtml(hero.id)}">
            Details &amp; Mirrors (${(hero.sources || []).length})
          </button>
          <button class="btn btn-glass" data-toggle-watchlist="${escapeHtml(hero.id)}">
            ${watchlistSet.has(hero.id) ? '&#10003; In My List' : '+ My List'}
          </button>
        </div>
      </div>
      ${
        heroPool.length > 1
          ? `<div class="hero-dots">
              ${heroPool
                .map(
                  (_, i) =>
                    `<button class="hero-dot ${i === heroIndex % heroPool.length ? 'active' : ''}" data-hero-dot="${i}" aria-label="Slide ${i + 1}"></button>`
                )
                .join('')}
            </div>`
          : ''
      }
    </section>`
    : '';

  const continueHtml = continueWatching.length
    ? `
    <section class="section">
      <div class="section-header">
        <h2 class="section-title">Continue Watching</h2>
      </div>
      <div class="carousel-track" style="grid-auto-columns: minmax(260px, 290px);">
        ${continueWatching
          .map(
            (cw) => `
          <div class="cw-card" data-resume-play="${escapeHtml(cw.movieId)}" data-resume-time="${cw.currentTime}">
            <div class="cw-thumb">
              ${renderPosterImg(cw.poster, cw.title)}
              <div class="cw-progress-track">
                <div class="cw-progress-fill" style="width:${cw.percent}%"></div>
              </div>
            </div>
            <div class="cw-body">
              <div style="min-width:0">
                <div class="card-title">${escapeHtml(cw.title)}</div>
                <div style="font-size:0.75rem;color:var(--text-secondary)">Resume at ${formatTime(cw.currentTime)} / ${formatTime(cw.duration)} (${cw.percent}%)</div>
              </div>
              <button class="icon-btn" style="padding:4px 8px;font-size:0.75rem" data-clear-cw="${escapeHtml(cw.movieId)}" title="Remove">&times;</button>
            </div>
          </div>`
          )
          .join('')}
      </div>
    </section>`
    : '';

  return `
    ${heroHtml}
    <div class="container">
      ${continueHtml}

      <section class="section">
        <div class="section-header">
          <h2 class="section-title">Trending Now (Playable Library)</h2>
          <button class="btn btn-glass btn-sm" data-nav-go="movies">Browse All &rarr;</button>
        </div>
        <div class="carousel-track">
          ${(trending.length ? trending : movies).map((m) => renderMovieCard(m, watchlistSet)).join('')}
        </div>
      </section>

      ${
        tmdbHomeItems.length
          ? `<section class="section">
              <div class="section-header">
                <h2 class="section-title">Trending Worldwide (Live TMDB)</h2>
                <button class="btn btn-glass btn-sm" data-nav-go="discover">Explore Millions on TMDB &rarr;</button>
              </div>
              <div class="carousel-track">
                ${tmdbHomeItems.map((item) => renderTmdbCard(item)).join('')}
              </div>
            </section>`
          : ''
      }

      <section class="section">
        <div class="section-header">
          <h2 class="section-title">Most Downloaded (Fast Mirrors)</h2>
          <button class="btn btn-glass btn-sm" data-nav-go="downloads">Open Download Hub &rarr;</button>
        </div>
        <div class="carousel-track">
          ${mostDownloaded.map((m) => renderMovieCard(m, watchlistSet)).join('')}
        </div>
      </section>

      ${
        series.length
          ? `<section class="section">
              <div class="section-header">
                <h2 class="section-title">Series &amp; Anthologies</h2>
                <button class="btn btn-glass btn-sm" data-nav-go="series">All Series &rarr;</button>
              </div>
              <div class="carousel-track">
                ${series.map((m) => renderMovieCard(m, watchlistSet)).join('')}
              </div>
            </section>`
          : ''
      }

      <section class="section">
        <div class="section-header">
          <h2 class="section-title">Top Rated Cinema</h2>
        </div>
        <div class="carousel-track">
          ${topRated.map((m) => renderMovieCard(m, watchlistSet)).join('')}
        </div>
      </section>
    </div>
  `;
}

export function renderCatalogView(state, heading, subtitle, items) {
  const watchlistSet = new Set(state.watchlist);
  const { genres, filters } = state;

  return `
    <div class="container">
      <div class="page-header">
        <div>
          <h1 class="page-title">${escapeHtml(heading)}</h1>
          <p class="page-sub">${escapeHtml(subtitle)} (${items.length} titles)</p>
        </div>
      </div>

      <div class="filter-bar">
        <div class="chips">
          ${['All', ...genres]
            .map(
              (g) =>
                `<button class="chip ${filters.genre === g ? 'active' : ''}" data-filter-genre="${escapeHtml(g)}">${escapeHtml(g)}</button>`
            )
            .join('')}
        </div>
        <div class="filter-controls">
          <select class="select-input" id="qualityFilter">
            ${['All', '4K', '1080p', '720p', '480p']
              .map(
                (q) =>
                  `<option value="${q}" ${filters.quality === q ? 'selected' : ''}>Quality: ${q}</option>`
              )
              .join('')}
          </select>
          <select class="select-input" id="sortFilter">
            <option value="newest" ${filters.sort === 'newest' ? 'selected' : ''}>Sort: Recently Added</option>
            <option value="rating" ${filters.sort === 'rating' ? 'selected' : ''}>Sort: Highest Rated</option>
            <option value="downloads" ${filters.sort === 'downloads' ? 'selected' : ''}>Sort: Most Downloaded</option>
            <option value="views" ${filters.sort === 'views' ? 'selected' : ''}>Sort: Most Viewed</option>
            <option value="year" ${filters.sort === 'year' ? 'selected' : ''}>Sort: Release Year</option>
            <option value="title" ${filters.sort === 'title' ? 'selected' : ''}>Sort: A - Z</option>
          </select>
        </div>
      </div>

      ${
        items.length
          ? `<div class="catalog-grid">${items.map((m) => renderMovieCard(m, watchlistSet)).join('')}</div>`
          : `<div class="empty-state">
              <h3>No matching titles found</h3>
              <p>Try clearing your filters or add a new movie from Admin Studio, Local Drive, or TMDB Discover.</p>
              <button class="btn btn-primary" data-reset-filters>Reset Filters</button>
            </div>`
      }
    </div>
  `;
}

export function renderDownloadHubView(state, items) {
  return `
    <div class="container">
      <div class="page-header">
        <div>
          <h1 class="page-title">Download Hub</h1>
          <p class="page-sub">NetNaija-style direct download portal with multi-quality mirrors, file sizes &amp; instant streaming</p>
        </div>
        <div class="filter-controls">
          <select class="select-input" id="sortFilter">
            <option value="downloads" ${state.filters.sort === 'downloads' ? 'selected' : ''}>Most Downloaded</option>
            <option value="newest" ${state.filters.sort === 'newest' ? 'selected' : ''}>Latest Releases</option>
            <option value="rating" ${state.filters.sort === 'rating' ? 'selected' : ''}>Top Rated</option>
          </select>
        </div>
      </div>

      <div class="dl-list">
        ${items
          .map((m) => {
            const sources = m.sources || [];
            return `
            <div class="dl-row">
              ${
                m.poster
                  ? `<img class="dl-poster" src="${escapeHtml(m.poster)}" alt="${escapeHtml(m.title)}" data-open-detail="${escapeHtml(m.id)}" style="cursor:pointer" />`
                  : `<div class="dl-poster poster-fallback" data-open-detail="${escapeHtml(m.id)}" style="cursor:pointer;font-size:0.7rem">${escapeHtml(m.title)}</div>`
              }
              <div class="dl-meta">
                <h3 data-open-detail="${escapeHtml(m.id)}">${escapeHtml(m.title)} (${m.year || '—'})</h3>
                <div class="dl-stats">
                  <span style="color:var(--gold);font-weight:700">&#9733; ${Number(m.rating || 0).toFixed(1)}</span>
                  <span>${escapeHtml((m.genres || []).join(', '))}</span>
                  <span>${(m.views || 0).toLocaleString()} views</span>
                  <span>${(m.downloads || 0).toLocaleString()} downloads</span>
                </div>
                <p style="font-size:0.84rem;color:var(--text-secondary);line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${escapeHtml(m.overview)}</p>
              </div>
              <div class="dl-mirrors">
                ${
                  sources.length
                    ? sources
                        .map(
                          (s, idx) => `
                        <button class="mirror-pill stream" data-play-source="${escapeHtml(m.id)}" data-src-idx="${idx}" title="Stream ${escapeHtml(s.label)}">
                          &#9654; ${escapeHtml(s.quality)} ${s.type === 'hls' ? 'HLS' : 'Stream'}
                        </button>
                        ${
                          s.downloadUrl
                            ? `<a class="mirror-pill" href="${escapeHtml(s.downloadUrl)}" target="_blank" download data-dl-hit="${escapeHtml(m.id)}" title="Download ${escapeHtml(s.label)}">
                                &#8595; ${escapeHtml(s.quality)} (${escapeHtml(s.size || 'MP4')})
                              </a>`
                            : ''
                        }`
                        )
                        .join('')
                    : `<button class="btn btn-glass btn-sm" data-open-detail="${escapeHtml(m.id)}">View Details</button>`
                }
              </div>
            </div>`;
          })
          .join('')}
      </div>
    </div>
  `;
}

export function renderDiscoverView(state) {
  const { tmdbConfigured, tmdbItems, tmdbQuery, tmdbLoading, tmdbError, tmdbActiveTab = 'all' } = state;

  if (!tmdbConfigured) {
    return `
      <div class="container">
        <div class="page-header">
          <div>
            <h1 class="page-title">TMDB Live Discovery</h1>
            <p class="page-sub">Search millions of movies &amp; TV shows, watch official trailers, and import metadata in 1 click</p>
          </div>
        </div>
        <div class="empty-state">
          <h3>Connect Your Free TMDB API Key</h3>
          <p>
            TMDB (The Movie Database) provides free live trending charts, high-resolution posters, cast lists, synopses, and official YouTube trailers.
            Grab a free key at <strong>themoviedb.org/settings/api</strong> and paste it in Settings.
          </p>
          <button class="btn btn-primary" data-nav-go="settings">Open Settings to Add TMDB Key</button>
        </div>
      </div>
    `;
  }

  return `
    <div class="container">
      <div class="page-header">
        <div>
          <h1 class="page-title">TMDB Live Discovery</h1>
          <p class="page-sub">Live global catalog — click any poster to watch its official HD trailer or import it into your CineBox library</p>
        </div>
      </div>

      <div class="filter-bar">
        <div style="display:flex;gap:10px;flex:1;min-width:260px">
          <input type="text" id="tmdbSearchInput" class="text-input" placeholder="Search any movie or TV series worldwide (e.g., Dune, Inception, Breaking Bad)..." value="${escapeHtml(tmdbQuery)}" />
          <button class="btn btn-primary" id="tmdbSearchBtn">Search TMDB</button>
        </div>
        <div class="chips">
          <button class="chip ${tmdbActiveTab === 'all' ? 'active' : ''}" data-tmdb-trend="all">Trending All</button>
          <button class="chip ${tmdbActiveTab === 'movie' ? 'active' : ''}" data-tmdb-trend="movie">Trending Movies</button>
          <button class="chip ${tmdbActiveTab === 'tv' ? 'active' : ''}" data-tmdb-trend="tv">Trending TV</button>
          <button class="chip ${tmdbActiveTab === 'popular_movies' ? 'active' : ''}" data-tmdb-feed="popular_movies">Popular Movies</button>
          <button class="chip ${tmdbActiveTab === 'top_rated' ? 'active' : ''}" data-tmdb-feed="top_rated">Top Rated</button>
          <button class="chip ${tmdbActiveTab === 'upcoming' ? 'active' : ''}" data-tmdb-feed="upcoming">Upcoming</button>
          <button class="chip ${tmdbActiveTab === 'popular_tv' ? 'active' : ''}" data-tmdb-feed="popular_tv">Popular TV</button>
        </div>
      </div>

      ${tmdbError ? `<div class="card-panel" style="border-color:var(--accent);color:#fca5a5">${escapeHtml(tmdbError)}</div>` : ''}

      ${
        tmdbLoading
          ? `<div class="empty-state"><div class="spinner-ring" style="margin:0 auto 12px"></div><p>Fetching live metadata from TMDB...</p></div>`
          : `<div class="catalog-grid">
              ${tmdbItems.map((item) => renderTmdbCard(item)).join('')}
            </div>`
      }
    </div>
  `;
}

export function renderTmdbDetailModal(item, showTrailer = true) {
  return `
    <div class="modal-hero" style="background-image:url('${escapeHtml(item.backdrop || item.poster)}')">
      <button class="modal-close" id="closeModalBtn" aria-label="Close">&times;</button>
      <div class="modal-hero-inner">
        ${
          item.poster
            ? `<img class="modal-poster" src="${escapeHtml(item.poster)}" alt="${escapeHtml(item.title)}" />`
            : `<div class="modal-poster poster-fallback">${escapeHtml(item.title)}</div>`
        }
        <div style="flex:1;min-width:0">
          <div class="hero-meta" style="margin-bottom:8px">
            <span class="meta-star">&#9733; ${Number(item.rating || 0).toFixed(1)}</span>
            <span>${item.year || '—'}</span>
            ${item.runtime ? `<span>${item.runtime} min</span>` : ''}
            <span class="meta-tag" style="color:#67e8f9">LIVE TMDB</span>
            <span class="meta-tag">${item.type === 'series' ? 'TV SERIES' : 'MOVIE'}</span>
          </div>
          <h2 style="font-family:var(--font-display);font-size:1.95rem;font-weight:900;margin-bottom:6px">${escapeHtml(item.title)}</h2>
          ${item.tagline ? `<p style="color:var(--text-secondary);font-style:italic;font-size:0.9rem;margin-bottom:14px">"${escapeHtml(item.tagline)}"</p>` : ''}
          <div class="hero-actions">
            ${
              item.trailerYoutubeId
                ? `<button class="btn btn-primary" id="toggleTmdbTrailerBtn">${showTrailer ? 'Hide Trailer' : '&#9654; Watch Official Trailer'}</button>`
                : ''
            }
            <a class="btn btn-glass" href="#importTmdbBox">Import to My Library &darr;</a>
          </div>
        </div>
      </div>
    </div>

    <div class="modal-body">
      ${
        showTrailer && item.trailerYoutubeId
          ? `<div class="trailer-box">
              <iframe src="https://www.youtube.com/embed/${encodeURIComponent(item.trailerYoutubeId)}" allowfullscreen allow="autoplay; encrypted-media"></iframe>
            </div>`
          : ''
      }

      <p style="color:#d6deec;line-height:1.65;margin-bottom:18px;font-size:0.95rem">${escapeHtml(item.overview)}</p>

      <div style="display:flex;flex-wrap:wrap;gap:14px;font-size:0.84rem;color:var(--text-secondary);margin-bottom:22px">
        <span><strong style="color:var(--text-primary)">Director / Creator:</strong> ${escapeHtml(item.director || 'Unknown')}</span>
        <span><strong style="color:var(--text-primary)">Genres:</strong> ${escapeHtml((item.genres || []).join(', ') || '—')}</span>
        <span><strong style="color:var(--text-primary)">TMDB Votes:</strong> ${(item.votes || 0).toLocaleString()}</span>
      </div>

      ${
        item.cast && item.cast.length
          ? `<div class="detail-panel">
              <h4>Top Billed Cast</h4>
              <div class="cast-grid">
                ${item.cast
                  .map(
                    (c) => `<div class="cast-chip"><strong>${escapeHtml(c.name)}</strong>${c.role ? `<span>as ${escapeHtml(c.role)}</span>` : ''}</div>`
                  )
                  .join('')}
              </div>
            </div>`
          : ''
      }

      <!-- Sleek Import into CineBox Library Form -->
      <div class="detail-panel" id="importTmdbBox" style="border-color:rgba(229,9,20,0.45)">
        <h4>Import "${escapeHtml(item.title)}" to Your CineBox Library</h4>
        <p style="font-size:0.84rem;color:var(--text-secondary);margin-bottom:12px">
          Saves full HD poster, backdrop, cast, synopsis &amp; trailer into your database. Optionally attach a stream/download URL right now (MP4, HLS <code>.m3u8</code>, or local drive stream URL):
        </p>
        <form id="tmdbImportForm" data-tmdb-id="${item.tmdbId}" data-tmdb-type="${escapeHtml(item.mediaType || 'movie')}">
          <div style="display:grid;grid-template-columns:2fr 0.7fr 0.7fr auto;gap:10px">
            <input class="text-input" name="streamUrl" placeholder="Optional: Direct MP4 / HLS .m3u8 / Local URL..." />
            <select class="select-input" name="quality">
              <option value="4K">4K</option>
              <option value="1080p" selected>1080p</option>
              <option value="720p">720p</option>
              <option value="480p">480p</option>
            </select>
            <input class="text-input" name="size" placeholder="Size (e.g. 1.2 GB)" />
            <button type="submit" class="btn btn-primary btn-sm">+ Import Title</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

export function renderLocalDriveView(state) {
  const scan = state.localScan || { exists: true, root: '', files: [], count: 0, totalSizeFormatted: '0 B' };

  return `
    <div class="container">
      <div class="page-header">
        <div>
          <h1 class="page-title">Local Media Drive</h1>
          <p class="page-sub">Jellyfin-style self-hosted HTTP 206 streaming engine — drop .mp4, .mkv, .webm &amp; .srt files in your folder</p>
        </div>
        <div style="display:flex;gap:10px">
          <button class="btn btn-glass" id="rescanLocalBtn">&#8635; Rescan Folder</button>
          <button class="btn btn-primary" data-nav-go="settings">Change Folder Path</button>
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">Watched Folder</div>
          <div style="font-size:0.88rem;font-family:monospace;margin-top:8px;word-break:break-all;color:#67e8f9">${escapeHtml(scan.root || 'Not set')}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Video Files Detected</div>
          <div class="stat-value">${scan.count || 0}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Library Size</div>
          <div class="stat-value">${escapeHtml(scan.totalSizeFormatted || '0 B')}</div>
        </div>
      </div>

      <!-- Direct Video Upload Dropzone -->
      <div class="card-panel">
        <h3 style="margin-bottom:10px">Upload Video Directly to Media Drive</h3>
        <div class="dropzone">
          <p style="color:var(--text-secondary);margin-bottom:12px">Select any <strong>.mp4, .mkv, .webm, or .mov</strong> file to store directly in your media folder and stream immediately.</p>
          <input type="file" id="localVideoUploadInput" accept="video/*,.mkv" class="hidden" />
          <button class="btn btn-primary" id="triggerLocalUploadBtn">Choose Video File</button>
          <div id="localUploadProgress" class="hidden" style="margin-top:14px">
            <div style="height:8px;background:var(--bg-elevated);border-radius:99px;overflow:hidden;max-width:420px;margin:0 auto 6px">
              <div id="localUploadBar" style="height:100%;width:0%;background:var(--emerald);transition:width 0.15s"></div>
            </div>
            <span id="localUploadLabel" style="font-size:0.82rem;color:var(--text-secondary)">Uploading...</span>
          </div>
        </div>
      </div>

      ${
        scan.files && scan.files.length
          ? `<div class="dl-list">
              ${scan.files
                .map(
                  (f) => `
                <div class="dl-row" style="grid-template-columns:1fr auto">
                  <div>
                    <h3 style="margin-bottom:5px">${escapeHtml(f.title)} ${f.season ? `<span class="meta-tag">S${String(f.season).padStart(2, '0')}E${String(f.episode).padStart(2, '0')}</span>` : ''}</h3>
                    <div class="dl-stats">
                      <span class="meta-tag hd">${escapeHtml(f.quality)}</span>
                      <span class="meta-tag">${escapeHtml(f.extension)}</span>
                      <span>${escapeHtml(f.sizeFormatted)}</span>
                      <span>Year: ${f.year}</span>
                      <span>Folder: ${escapeHtml(f.folder)}</span>
                      <span>Subtitles paired: ${f.subtitles?.length || 0}</span>
                    </div>
                    <div style="font-size:0.76rem;color:var(--text-muted);font-family:monospace">${escapeHtml(f.relativePath)}</div>
                  </div>
                  <div class="dl-mirrors">
                    <button class="mirror-pill stream" data-play-local="${escapeHtml(f.id)}">&#9654; Stream Now</button>
                    <a class="mirror-pill" href="${escapeHtml(f.downloadUrl)}" download>&#8595; Download</a>
                    <button class="btn btn-glass btn-sm" data-import-local="${escapeHtml(f.relativePath)}">+ Add to Catalog</button>
                  </div>
                </div>`
                )
                .join('')}
            </div>`
          : `<div class="empty-state">
              <h3>Your Local Media Folder is Empty</h3>
              <p>Drop any movie files (<code>.mp4</code>, <code>.mkv</code>, <code>.webm</code>) and matching <code>.srt</code> subtitles into <code>${escapeHtml(scan.root)}</code>, or use the Upload button above — then click Rescan Folder!</p>
            </div>`
      }
    </div>
  `;
}

export function renderAdminView(state) {
  const overview = state.adminOverview || { stats: {}, lanUrls: [] };
  const s = overview.stats || {};
  const editing = state.editingMovie;

  const existingSources = editing?.sources || [
    { label: 'Server 1 — Fast MP4', quality: '1080p', type: 'mp4', size: '', url: '', downloadUrl: '' },
  ];

  return `
    <div class="container">
      <div class="page-header">
        <div>
          <h1 class="page-title">Admin Studio</h1>
          <p class="page-sub">Manage your catalog, attach multi-quality HLS/MP4/Local mirrors, and upload media</p>
        </div>
        ${editing ? `<button class="btn btn-glass" id="cancelEditBtn">Cancel Editing</button>` : ''}
      </div>

      <div class="stats-grid">
        <div class="stat-card"><div class="stat-label">Total Titles</div><div class="stat-value">${s.totalTitles || 0}</div></div>
        <div class="stat-card"><div class="stat-label">Stream Mirrors</div><div class="stat-value">${s.totalSources || 0}</div></div>
        <div class="stat-card"><div class="stat-label">Total Views</div><div class="stat-value">${(s.totalViews || 0).toLocaleString()}</div></div>
        <div class="stat-card"><div class="stat-label">Total Downloads</div><div class="stat-value">${(s.totalDownloads || 0).toLocaleString()}</div></div>
      </div>

      <!-- Create / Edit Form -->
      <div class="card-panel">
        <h3 style="margin-bottom:16px">${editing ? `Edit: ${escapeHtml(editing.title)}` : 'Add New Movie or Series'}</h3>
        <form id="adminMovieForm">
          <div class="form-grid">
            <div class="form-group">
              <label>Title *</label>
              <input class="text-input" name="title" required value="${escapeHtml(editing?.title || '')}" placeholder="e.g., Interstellar" />
            </div>
            <div class="form-group">
              <label>Type</label>
              <select class="select-input" name="type">
                <option value="movie" ${editing?.type !== 'series' ? 'selected' : ''}>Movie</option>
                <option value="series" ${editing?.type === 'series' ? 'selected' : ''}>TV Series</option>
              </select>
            </div>
            <div class="form-group">
              <label>Release Year</label>
              <input class="text-input" type="number" name="year" value="${editing?.year || new Date().getFullYear()}" />
            </div>
            <div class="form-group">
              <label>Rating (0 - 10)</label>
              <input class="text-input" type="number" step="0.1" min="0" max="10" name="rating" value="${editing?.rating || 8.0}" />
            </div>
            <div class="form-group">
              <label>Runtime (minutes)</label>
              <input class="text-input" type="number" name="runtime" value="${editing?.runtime || 120}" />
            </div>
            <div class="form-group">
              <label>Genres (comma-separated)</label>
              <input class="text-input" name="genres" value="${escapeHtml((editing?.genres || []).join(', '))}" placeholder="Action, Sci-Fi, Thriller" />
            </div>
            <div class="form-group">
              <label>Director</label>
              <input class="text-input" name="director" value="${escapeHtml(editing?.director || '')}" placeholder="Director name" />
            </div>
            <div class="form-group">
              <label>YouTube Trailer Video ID (optional)</label>
              <input class="text-input" name="trailerYoutubeId" value="${escapeHtml(editing?.trailerYoutubeId || '')}" placeholder="e.g., zSWdZVtXT7E" />
            </div>
            <div class="form-group">
              <label>Poster Image URL (or upload below)</label>
              <div style="display:flex;gap:8px">
                <input class="text-input" name="poster" id="posterUrlInput" value="${escapeHtml(editing?.poster || '')}" placeholder="https://... or /uploads/..." />
                <input type="file" id="posterUploadFile" accept="image/*" class="hidden" />
                <button type="button" class="btn btn-glass btn-sm" id="posterUploadBtn">Upload</button>
              </div>
            </div>
            <div class="form-group">
              <label>Backdrop Widescreen URL</label>
              <input class="text-input" name="backdrop" value="${escapeHtml(editing?.backdrop || '')}" placeholder="https://..." />
            </div>
            <div class="form-group full">
              <label>Synopsis / Overview</label>
              <textarea class="textarea-input" name="overview" placeholder="Write movie description...">${escapeHtml(editing?.overview || '')}</textarea>
            </div>
            <div class="form-group full" style="flex-direction:row;gap:22px;align-items:center">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" name="featured" ${editing?.featured ? 'checked' : ''} /> Featured in Hero Banner
              </label>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" name="trending" ${editing?.trending ? 'checked' : ''} /> Show in Trending Row
              </label>
            </div>
          </div>

          <!-- Dynamic Multi-Mirror Source Builder -->
          <div style="margin-top:20px;padding-top:18px;border-top:1px solid var(--border)">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
              <h4>Stream &amp; Download Mirrors (MP4 / HLS .m3u8 / Local Drive)</h4>
              <button type="button" class="btn btn-glass btn-sm" id="addSourceRowBtn">+ Add Mirror</button>
            </div>
            <div id="sourceRowsContainer">
              ${existingSources
                .map(
                  (src) => `
                <div class="source-builder-row" style="display:grid;grid-template-columns:1.2fr 0.6fr 0.6fr 0.6fr 2fr auto;gap:8px;margin-bottom:8px">
                  <input class="text-input src-label" placeholder="Server label" value="${escapeHtml(src.label || '')}" />
                  <select class="select-input src-quality">
                    ${['4K', '1080p', '720p', '480p', '360p']
                      .map((q) => `<option value="${q}" ${src.quality === q ? 'selected' : ''}>${q}</option>`)
                      .join('')}
                  </select>
                  <select class="select-input src-type">
                    <option value="mp4" ${src.type !== 'hls' ? 'selected' : ''}>MP4 / Direct</option>
                    <option value="hls" ${src.type === 'hls' ? 'selected' : ''}>HLS (.m3u8)</option>
                  </select>
                  <input class="text-input src-size" placeholder="Size (e.g. 850 MB)" value="${escapeHtml(src.size || '')}" />
                  <input class="text-input src-url" placeholder="Stream / Download URL (or /api/media/stream?file=...)" value="${escapeHtml(src.url || '')}" />
                  <button type="button" class="btn btn-danger btn-sm remove-src-row">&times;</button>
                </div>`
                )
                .join('')}
            </div>
          </div>

          <div style="margin-top:18px;display:flex;gap:12px">
            <button type="submit" class="btn btn-primary">${editing ? 'Save Changes' : 'Publish to Catalog'}</button>
            ${editing ? `<button type="button" class="btn btn-glass" id="cancelEditBtn2">Cancel</button>` : ''}
          </div>
        </form>
      </div>

      <!-- Catalog Management Table -->
      <div class="card-panel">
        <h3 style="margin-bottom:14px">Manage Existing Library (${state.movies.length})</h3>
        <div style="overflow-x:auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Year</th>
                <th>Mirrors</th>
                <th>Views / DLs</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${state.movies
                .map(
                  (m) => `
                <tr>
                  <td><strong>${escapeHtml(m.title)}</strong></td>
                  <td>${m.type === 'series' ? 'Series' : 'Movie'}</td>
                  <td>${m.year || '—'}</td>
                  <td>${(m.sources || []).length} source(s)</td>
                  <td>${(m.views || 0).toLocaleString()} / ${(m.downloads || 0).toLocaleString()}</td>
                  <td style="display:flex;gap:8px">
                    <button class="btn btn-glass btn-sm" data-admin-edit="${escapeHtml(m.id)}">Edit</button>
                    <button class="btn btn-danger btn-sm" data-admin-delete="${escapeHtml(m.id)}">Delete</button>
                  </td>
                </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

export function renderSettingsView(state) {
  const overview = state.adminOverview || { settings: {}, lanUrls: [], mediaDirExists: true };
  const cfg = overview.settings || {};
  const lanUrls = overview.lanUrls || [];

  return `
    <div class="container">
      <div class="page-header">
        <div>
          <h1 class="page-title">Platform Settings &amp; LAN Streaming</h1>
          <p class="page-sub">Configure TMDB live discovery, local media folder path, and stream to phones/TVs over Wi-Fi</p>
        </div>
      </div>

      <div class="card-panel">
        <h3 style="margin-bottom:10px">Stream on Your Phone, Tablet or Smart TV (Same Wi-Fi)</h3>
        <p style="color:var(--text-secondary);font-size:0.88rem;margin-bottom:14px">
          Open any of these URLs on devices connected to the same Wi-Fi network to stream movies &amp; download directly from this PC:
        </p>
        <div style="display:flex;flex-wrap:wrap;gap:10px">
          ${lanUrls.map((u) => `<span class="lan-pill">${escapeHtml(u)}</span>`).join('')}
        </div>
      </div>

      <div class="card-panel">
        <h3 style="margin-bottom:16px">Server &amp; Integration Configuration</h3>
        <form id="settingsForm">
          <div class="form-grid">
            <div class="form-group">
              <label>Platform Name</label>
              <input class="text-input" name="siteName" value="${escapeHtml(cfg.siteName || 'CineBox')}" />
            </div>
            <div class="form-group">
              <label>Default Preferred Quality</label>
              <select class="select-input" name="defaultQuality">
                ${['4K', '1080p', '720p', '480p']
                  .map((q) => `<option value="${q}" ${cfg.defaultQuality === q ? 'selected' : ''}>${q}</option>`)
                  .join('')}
              </select>
            </div>
            <div class="form-group full">
              <label>TMDB API Key (v3 Key or v4 Bearer Token — free from themoviedb.org/settings/api)</label>
              <input class="text-input" name="tmdbApiKey" value="${escapeHtml(cfg.tmdbApiKey || '')}" placeholder="Paste your TMDB API key here to unlock live discovery..." />
            </div>
            <div class="form-group full">
              <label>Local Media Directory Path (e.g., D:\\Movies or C:\\Users\\LENOVO\\Videos)</label>
              <input class="text-input" name="mediaDir" value="${escapeHtml(cfg.mediaDir || '')}" />
              <small style="color:${overview.mediaDirExists ? 'var(--emerald)' : '#f87171'}">
                ${overview.mediaDirExists ? '✓ Folder found and readable' : '✕ Folder path does not exist yet'}
              </small>
            </div>
          </div>
          <div style="margin-top:18px">
            <button type="submit" class="btn btn-primary">Save Settings</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

export function renderDetailModal(movie, watchlistSet, showTrailer = false) {
  const inList = watchlistSet.has(movie.id);
  const sources = movie.sources || [];
  const seasons = movie.seasons || [];
  const comments = movie.comments || [];

  return `
    <div class="modal-hero" style="background-image:url('${escapeHtml(movie.backdrop || movie.poster)}')">
      <button class="modal-close" id="closeModalBtn" aria-label="Close">&times;</button>
      <div class="modal-hero-inner">
        ${
          movie.poster
            ? `<img class="modal-poster" src="${escapeHtml(movie.poster)}" alt="${escapeHtml(movie.title)}" />`
            : `<div class="modal-poster poster-fallback">${escapeHtml(movie.title)}</div>`
        }
        <div style="flex:1;min-width:0">
          <div class="hero-meta" style="margin-bottom:8px">
            <span class="meta-star">&#9733; ${Number(movie.rating || 0).toFixed(1)}</span>
            <span>${movie.year || '—'}</span>
            ${movie.runtime ? `<span>${movie.runtime} min</span>` : ''}
            <span class="meta-tag hd">${escapeHtml(getBestQuality(movie))}</span>
            <span class="meta-tag">${escapeHtml(movie.maturity || 'PG-13')}</span>
          </div>
          <h2 style="font-family:var(--font-display);font-size:1.95rem;font-weight:900;margin-bottom:6px">${escapeHtml(movie.title)}</h2>
          ${movie.tagline ? `<p style="color:var(--text-secondary);font-style:italic;font-size:0.9rem;margin-bottom:14px">"${escapeHtml(movie.tagline)}"</p>` : ''}
          <div class="hero-actions">
            <button class="btn btn-primary" data-quick-play="${escapeHtml(movie.id)}">
              &#9654; Play Movie
            </button>
            ${
              movie.trailerYoutubeId
                ? `<button class="btn btn-glass" id="toggleTrailerBtn">${showTrailer ? 'Hide Trailer' : 'Watch Trailer'}</button>`
                : ''
            }
            <button class="btn btn-glass" data-toggle-watchlist="${escapeHtml(movie.id)}">
              ${inList ? '&#10003; In My List' : '+ My List'}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="modal-body">
      ${
        showTrailer && movie.trailerYoutubeId
          ? `<div class="trailer-box">
              <iframe src="https://www.youtube.com/embed/${encodeURIComponent(movie.trailerYoutubeId)}?autoplay=1" allowfullscreen allow="autoplay; encrypted-media"></iframe>
            </div>`
          : ''
      }

      <p style="color:#d6deec;line-height:1.65;margin-bottom:18px;font-size:0.95rem">${escapeHtml(movie.overview)}</p>

      <div style="display:flex;flex-wrap:wrap;gap:14px;font-size:0.84rem;color:var(--text-secondary);margin-bottom:22px">
        <span><strong style="color:var(--text-primary)">Director:</strong> ${escapeHtml(movie.director || 'Unknown')}</span>
        <span><strong style="color:var(--text-primary)">Genres:</strong> ${escapeHtml((movie.genres || []).join(', '))}</span>
        <span><strong style="color:var(--text-primary)">Views:</strong> ${(movie.views || 0).toLocaleString()}</span>
        <span><strong style="color:var(--text-primary)">Downloads:</strong> ${(movie.downloads || 0).toLocaleString()}</span>
      </div>

      <!-- Multi-Server Stream & Download Mirrors -->
      <div class="detail-panel">
        <h4>
          <span>Stream Servers &amp; Direct Download Mirrors (${sources.length})</span>
          <span style="font-size:0.76rem;color:var(--emerald)">Multi-mirror auto-fallback enabled</span>
        </h4>
        ${
          sources.length
            ? sources
                .map(
                  (s, idx) => `
                <div class="source-item">
                  <div>
                    <div style="font-weight:700;font-size:0.9rem">
                      <span class="status-dot"></span>${escapeHtml(s.label)}
                    </div>
                    <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:3px">
                      Quality: <strong>${escapeHtml(s.quality || 'HD')}</strong> &bull; Format: ${escapeHtml((s.type || 'mp4').toUpperCase())} &bull; Codec: ${escapeHtml(s.codec || 'H.264')} &bull; Size: ${escapeHtml(s.size || 'Stream')}
                    </div>
                  </div>
                  <div style="display:flex;gap:8px">
                    <button class="btn btn-primary btn-sm" data-play-source="${escapeHtml(movie.id)}" data-src-idx="${idx}">&#9654; Stream</button>
                    ${
                      s.downloadUrl
                        ? `<a class="btn btn-emerald btn-sm" href="${escapeHtml(s.downloadUrl)}" target="_blank" download data-dl-hit="${escapeHtml(movie.id)}">&#8595; Download</a>`
                        : ''
                    }
                  </div>
                </div>`
                )
                .join('')
            : `<p style="color:var(--text-secondary);font-size:0.86rem">No stream mirrors attached yet. Edit this title in Admin Studio to attach MP4, HLS (.m3u8), or local file links.</p>`
        }
      </div>

      <!-- Seasons & Episodes (for TV Series) -->
      ${
        seasons.length
          ? `<div class="detail-panel">
              <h4>Seasons &amp; Episodes</h4>
              ${seasons
                .map(
                  (sea) => `
                <div style="margin-bottom:14px">
                  <div style="font-weight:800;font-size:0.88rem;color:var(--gold);margin-bottom:8px">Season ${sea.seasonNumber}</div>
                  ${(sea.episodes || [])
                    .map(
                      (ep) => `
                    <div class="source-item">
                      <div>
                        <div style="font-weight:700;font-size:0.88rem">${escapeHtml(ep.title)} <span class="meta-tag">${escapeHtml(ep.quality || 'HD')}</span></div>
                        <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:3px">${escapeHtml(ep.overview || '')} (${escapeHtml(ep.duration || '')} • ${escapeHtml(ep.size || '')})</div>
                      </div>
                      <div style="display:flex;gap:8px">
                        <button class="btn btn-primary btn-sm" data-play-ep="${escapeHtml(ep.id)}" data-season="${sea.seasonNumber}">&#9654; Watch</button>
                        ${ep.downloadUrl ? `<a class="btn btn-emerald btn-sm" href="${escapeHtml(ep.downloadUrl)}" target="_blank" download data-dl-hit="${escapeHtml(movie.id)}">&#8595; DL</a>` : ''}
                      </div>
                    </div>`
                    )
                    .join('')}
                </div>`
                )
                .join('')}
            </div>`
          : ''
      }

      <!-- Cast -->
      ${
        movie.cast && movie.cast.length
          ? `<div class="detail-panel">
              <h4>Cast &amp; Crew</h4>
              <div class="cast-grid">
                ${movie.cast
                  .map(
                    (c) => `<div class="cast-chip"><strong>${escapeHtml(c.name)}</strong>${c.role ? `<span>as ${escapeHtml(c.role)}</span>` : ''}</div>`
                  )
                  .join('')}
              </div>
            </div>`
          : ''
      }

      <!-- Community Comments (NetNaija Style) -->
      <div class="detail-panel">
        <h4>Community Reviews &amp; Comments (${comments.length})</h4>
        <form id="commentForm" data-movie-id="${escapeHtml(movie.id)}" style="margin-bottom:16px">
          <div style="display:grid;grid-template-columns:1fr 140px;gap:10px;margin-bottom:10px">
            <input class="text-input" name="author" placeholder="Your name (e.g., Alex)" required />
            <select class="select-input" name="rating">
              <option value="5">&#9733;&#9733;&#9733;&#9733;&#9733; (5/5)</option>
              <option value="4">&#9733;&#9733;&#9733;&#9733; (4/5)</option>
              <option value="3">&#9733;&#9733;&#9733; (3/5)</option>
              <option value="2">&#9733;&#9733; (2/5)</option>
              <option value="1">&#9733; (1/5)</option>
            </select>
          </div>
          <div style="display:flex;gap:10px">
            <input class="text-input" name="text" placeholder="Share your review or report stream quality..." required />
            <button type="submit" class="btn btn-primary btn-sm">Post</button>
          </div>
        </form>
        <div id="commentsList">
          ${
            comments.length
              ? comments
                  .map(
                    (c) => `
                  <div class="comment-item">
                    <div class="comment-head">
                      <strong>${escapeHtml(c.author)}</strong>
                      <span style="color:var(--gold)">${'&#9733;'.repeat(c.rating || 5)}</span>
                    </div>
                    <p style="font-size:0.86rem;color:#cbd5e1;line-height:1.45">${escapeHtml(c.text)}</p>
                  </div>`
                  )
                  .join('')
              : `<p style="color:var(--text-muted);font-size:0.84rem">No comments yet. Be the first to review this title!</p>`
          }
        </div>
      </div>

      <!-- Related Titles -->
      ${
        movie.related && movie.related.length
          ? `<div>
              <h4 style="margin-bottom:12px">More Like This</h4>
              <div class="carousel-track" style="grid-auto-columns:minmax(150px,168px)">
                ${movie.related.map((r) => renderMovieCard(r, watchlistSet)).join('')}
              </div>
            </div>`
          : ''
      }
    </div>
  `;
}
