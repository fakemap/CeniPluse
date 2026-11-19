const express = require('express');
const crypto = require('crypto');
const store = require('../db/store');
const { IS_VERCEL } = require('../config');
const {
  isSafeExternalUrl,
  requireAdminAuth,
  sanitizeString,
} = require('../middleware/security');

const router = express.Router();

// Protect all /api/cms/admin/* endpoints with RBAC admin verification
router.use('/admin', requireAdminAuth);
const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p';

function getTmdbKey() {
  return (store.getSettings().tmdbApiKey || '').trim();
}

async function tmdbFetch(endpoint, params = {}) {
  const key = getTmdbKey();
  if (!key) throw new Error('TMDB API key is not configured.');
  const isBearer = key.length > 50 || key.startsWith('eyJ');
  const url = new URL(`${TMDB_BASE}${endpoint}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  });
  if (!isBearer) url.searchParams.set('api_key', key);

  const headers = { Accept: 'application/json' };
  if (isBearer) headers.Authorization = `Bearer ${key}`;
  const res = await fetch(url.toString(), { headers });
  if (!res.ok) throw new Error(`TMDB error (${res.status})`);
  return res.json();
}

/**
 * Computes link readiness stats for any CMS movie or series.
 */
function computeTitleStats(title) {
  if (title.type === 'series') {
    const seasons = title.seasons || [];
    let totalEpisodes = 0;
    let linkedEpisodes = 0;
    let linkedSeasons = 0;
    let totalSources = 0;

    seasons.forEach((s) => {
      const eps = s.episodes || [];
      totalEpisodes += eps.length;
      const epsWithLinks = eps.filter((e) => (e.sources || []).length > 0);
      linkedEpisodes += epsWithLinks.length;
      if (epsWithLinks.length > 0) linkedSeasons++;
      eps.forEach((e) => {
        totalSources += (e.sources || []).length;
      });
    });

    return {
      totalSeasons: seasons.length,
      linkedSeasons,
      totalEpisodes,
      linkedEpisodes,
      totalSources,
      hasPlayableLinks: linkedEpisodes > 0,
      isPartial: linkedSeasons > 0 && linkedSeasons < seasons.length,
    };
  }

  const count = (title.sources || []).length;
  return {
    totalSeasons: 0,
    linkedSeasons: 0,
    totalEpisodes: 0,
    linkedEpisodes: 0,
    totalSources: count,
    hasPlayableLinks: count > 0,
    isPartial: false,
  };
}

/**
 * Projects a CMS title for the PUBLIC website:
 * - Published playable titles return full playable mirrors (and only linked seasons/episodes for TV series).
 * - Drafted/harvested titles without links yet also appear with `isDraft: true, hasStreamLinks: false` so users can browse & request them.
 */
function projectForPublic(title) {
  const stats = computeTitleStats(title);
  const requestCount = Number(title.requestCount) || 0;
  const lastRequestedAt = title.lastRequestedAt || null;

  if (title.status === 'published' && stats.hasPlayableLinks) {
    if (title.type === 'series') {
      const publicSeasons = (title.seasons || [])
        .map((s) => {
          const linkedEps = (s.episodes || []).filter((e) => (e.sources || []).length > 0);
          if (!linkedEps.length) return null;
          return {
            ...s,
            episodeCount: linkedEps.length,
            episodes: linkedEps,
          };
        })
        .filter(Boolean);

      if (publicSeasons.length > 0) {
        const firstEpSources = publicSeasons[0]?.episodes?.[0]?.sources || [];
        return {
          ...title,
          isDraft: false,
          hasStreamLinks: true,
          requestCount,
          lastRequestedAt,
          seasonsCount: publicSeasons.length,
          seasons: publicSeasons,
          sources: firstEpSources,
          runtime: `${publicSeasons.length} Season${publicSeasons.length > 1 ? 's' : ''} • ${stats.linkedEpisodes} Eps`,
        };
      }
    } else {
      return {
        ...title,
        isDraft: false,
        hasStreamLinks: true,
        requestCount,
        lastRequestedAt,
      };
    }
  }

  // Harvested Draft / Unlinked Title — lightweight projection without nested empty episodes
  const seasonCount = (title.seasons || []).length;
  return {
    ...title,
    isDraft: true,
    hasStreamLinks: false,
    requestCount,
    lastRequestedAt,
    sources: [],
    seasons: undefined,
    seasonsCount: seasonCount,
    runtime:
      title.type === 'series'
        ? seasonCount > 0
          ? `${seasonCount} Season${seasonCount > 1 ? 's' : ''}`
          : 'TV Series'
        : title.runtime || 'Movie',
  };
}

/**
 * Seeds initial verified playable open-source movies & anthology into cmsTitles once
 * so the live site immediately has published playable content on first launch.
 */
function ensureInitialCmsSeed() {
  const existing = store.getCmsTitles();
  if (existing.length > 0) return;

  const initialPublished = [
    {
      id: 'cms_tears_of_steel',
      tmdbId: 121986,
      type: 'movie',
      status: 'published',
      featured: true,
      trending: true,
      title: 'Tears of Steel',
      year: 2012,
      rating: 8.4,
      country: 'Netherlands',
      regionTag: 'International',
      language: 'Original Audio',
      subtitlesAvailable: ['Original Audio', 'English Dub', 'French Sub', 'Spanish Sub'],
      genres: ['Sci-Fi', 'Action', 'Drama'],
      quality: '4K',
      badge: '4K',
      runtime: '12m',
      poster: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/70/Tears_of_Steel_poster.jpg/600px-Tears_of_Steel_poster.jpg',
      backdrop: 'https://mango.blender.org/wp-content/uploads/2012/09/01_thom_celia_bridge.jpg',
      previewVideoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
      trailerYoutubeId: 'R6MlUcmOul8',
      overview: 'In a ruined futuristic Amsterdam, soldiers and scientists make a desperate stand against an army of autonomous machines.',
      director: 'Ian Hubert',
      cast: ['Derek de Lint', 'Sergio Hasselbaink', 'Vanja Rukavina'],
      views: 248900,
      downloads: 64120,
      sources: [
        {
          id: 'cms_tos_hls',
          label: 'Server 1 — Adaptive HLS',
          quality: '1080p',
          type: 'hls',
          size: 'Adaptive',
          url: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
          downloadUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
          healthStatus: 'ok',
        },
        {
          id: 'cms_tos_mp4',
          label: 'Server 2 — Direct HD MP4',
          quality: '1080p',
          type: 'mp4',
          size: '178 MB',
          url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
          downloadUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
          healthStatus: 'ok',
        },
      ],
    },
    {
      id: 'cms_sintel',
      tmdbId: 45745,
      type: 'animation',
      status: 'published',
      featured: true,
      trending: true,
      title: 'Sintel',
      year: 2010,
      rating: 8.8,
      country: 'Netherlands',
      regionTag: 'Anime',
      language: 'Original Audio',
      subtitlesAvailable: ['Original Audio', 'English Dub', 'Spanish Sub'],
      genres: ['Animation', 'Fantasy', 'Adventure'],
      quality: '4K',
      badge: '4K',
      runtime: '15m',
      poster: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Sintel_poster.jpg/600px-Sintel_poster.jpg',
      backdrop: 'https://durian.blender.org/wp-content/uploads/2010/06/sintel_trailer_1080p_0001.jpg',
      previewVideoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
      trailerYoutubeId: 'eRsGyueVLvQ',
      overview: 'A lonely warrior embarks on a perilous quest across frozen peaks and deserts to rescue a lost baby dragon.',
      director: 'Colin Levy',
      cast: ['Halina Reijn', 'Thom Hoffman'],
      views: 318900,
      downloads: 104500,
      sources: [
        {
          id: 'cms_sin_hls',
          label: 'Server 1 — Adaptive HLS',
          quality: '1080p',
          type: 'hls',
          size: 'Adaptive',
          url: 'https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8',
          downloadUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
          healthStatus: 'ok',
        },
        {
          id: 'cms_sin_mp4',
          label: 'Server 2 — Direct MP4',
          quality: '720p',
          type: 'mp4',
          size: '183 MB',
          url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
          downloadUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
          healthStatus: 'ok',
        },
      ],
    },
    {
      id: 'cms_big_buck_bunny',
      tmdbId: 10378,
      type: 'animation',
      status: 'published',
      featured: true,
      trending: true,
      title: 'Big Buck Bunny',
      year: 2008,
      rating: 8.1,
      country: 'Netherlands',
      regionTag: 'Anime',
      language: 'Original Audio',
      subtitlesAvailable: ['Original Audio', 'French Sub'],
      genres: ['Animation', 'Comedy', 'Family'],
      quality: '4K',
      badge: 'HD',
      runtime: '10m',
      poster: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Big_buck_bunny_poster_big.jpg/600px-Big_buck_bunny_poster_big.jpg',
      backdrop: 'https://peach.blender.org/wp-content/uploads/title_anouncement.jpg',
      previewVideoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      trailerYoutubeId: 'YE7VzlLtp-4',
      overview: 'A gentle woodland giant orchestrates hilarious forest payback when three mischievous rodents cross the line.',
      director: 'Sacha Goedegebure',
      cast: ['Jan Morgenstern', 'Blender Open Movie Team'],
      views: 265000,
      downloads: 92400,
      sources: [
        {
          id: 'cms_bbb_hls',
          label: 'Server 1 — Mux Adaptive HLS',
          quality: '1080p',
          type: 'hls',
          size: 'Adaptive',
          url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
          downloadUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
          healthStatus: 'ok',
        },
      ],
    },
    {
      id: 'cms_open_anthology',
      tmdbId: null,
      type: 'series',
      status: 'published',
      featured: false,
      trending: true,
      title: 'Open Cinema Anthology',
      year: 2024,
      rating: 8.6,
      country: 'United States',
      regionTag: 'Hollywood',
      language: 'Original Audio',
      subtitlesAvailable: ['Original Audio'],
      genres: ['Documentary', 'Action', 'Adventure'],
      quality: '1080p',
      badge: 'HD',
      poster: 'https://images.unsplash.com/photo-1574267432553-4b4628081c31?w=600&q=80',
      backdrop: 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=1400&q=80',
      previewVideoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4',
      overview: 'Multi-season demo series showing partial publishing: Season 1 has 3 linked episodes live on the site while Season 2 waits in Admin Draft until you attach links.',
      director: 'Open Cinema Collective',
      cast: ['Featurette Ensemble', 'Garage Film Crew'],
      views: 145000,
      downloads: 42300,
      seasons: [
        {
          seasonNumber: 1,
          name: 'Season 1',
          episodeCount: 3,
          episodes: [
            {
              id: 'anth_s1e1',
              seasonNumber: 1,
              episodeNumber: 1,
              title: 'Out on Street and Dirt',
              overview: 'High-speed gravel drifts and rally precision on mountain roads.',
              still: 'https://images.unsplash.com/photo-1511919884226-fd3cad34687c?w=600&q=80',
              runtime: '10m',
              airDate: '2024-01-15',
              rating: 8.3,
              sources: [
                {
                  id: 'anth_src_1',
                  label: 'Server 1 — HD MP4',
                  quality: '720p',
                  type: 'mp4',
                  size: '48 MB',
                  url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4',
                  downloadUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4',
                  healthStatus: 'ok',
                },
              ],
            },
            {
              id: 'anth_s1e2',
              seasonNumber: 1,
              episodeNumber: 2,
              title: 'Volkswagen GTI Track Review',
              overview: 'Track-day engineering breakdown testing cornering grip and turbo response.',
              still: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=600&q=80',
              runtime: '10m',
              airDate: '2024-01-22',
              rating: 8.1,
              sources: [
                {
                  id: 'anth_src_2',
                  label: 'Server 1 — HD MP4',
                  quality: '720p',
                  type: 'mp4',
                  size: '35 MB',
                  url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/VolkswagenGTIReview.mp4',
                  downloadUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/VolkswagenGTIReview.mp4',
                  healthStatus: 'ok',
                },
              ],
            },
            {
              id: 'anth_s1e3',
              seasonNumber: 1,
              episodeNumber: 3,
              title: 'What Car Can You Get For A Grand?',
              overview: 'A budget motorsport challenge putting $1,000 used cars through hilarious tests.',
              still: 'https://images.unsplash.com/photo-1514316454349-750a7fd3da3a?w=600&q=80',
              runtime: '9m',
              airDate: '2024-02-05',
              rating: 8.4,
              sources: [
                {
                  id: 'anth_src_3',
                  label: 'Server 1 — HD MP4',
                  quality: '720p',
                  type: 'mp4',
                  size: '44 MB',
                  url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WhatCarCanYouGetForAGrand.mp4',
                  downloadUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WhatCarCanYouGetForAGrand.mp4',
                  healthStatus: 'ok',
                },
              ],
            },
          ],
        },
        {
          seasonNumber: 2,
          name: 'Season 2',
          episodeCount: 2,
          episodes: [
            {
              id: 'anth_s2e1',
              seasonNumber: 2,
              episodeNumber: 1,
              title: 'Bullrun Desert Special',
              overview: 'Waiting in Admin Draft — attach a link in Admin Portal to unlock Season 2 live!',
              still: 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=600&q=80',
              runtime: '12m',
              airDate: '2025-03-10',
              rating: 8.0,
              sources: [],
            },
            {
              id: 'anth_s2e2',
              seasonNumber: 2,
              episodeNumber: 2,
              title: 'Night Circuit Finale',
              overview: 'Waiting in Admin Draft — attach a link in Admin Portal to unlock Season 2 live!',
              still: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=600&q=80',
              runtime: '14m',
              airDate: '2025-03-17',
              rating: 8.2,
              sources: [],
            },
          ],
        },
      ],
      sources: [],
    },
  ];

  initialPublished.reverse().forEach((item) => store.upsertCmsTitle(item));
}

ensureInitialCmsSeed();

// ==================== PUBLIC ENDPOINTS ====================
// GET /api/cms/public - Returns published playable titles first, followed by newly harvested Drafts so users can browse & request them
router.get('/public', (req, res) => {
  ensureInitialCmsSeed();
  const projected = store
    .getCmsTitles()
    .map(projectForPublic)
    .filter(Boolean);

  projected.sort((a, b) => {
    if (Boolean(a.isDraft) !== Boolean(b.isDraft)) {
      return a.isDraft ? 1 : -1;
    }
    const ta = new Date(a.createdAt || a.updatedAt || 0).getTime();
    const tb = new Date(b.createdAt || b.updatedAt || 0).getTime();
    return tb - ta;
  });

  const publishedCount = projected.filter((m) => !m.isDraft).length;
  const draftCount = projected.filter((m) => m.isDraft).length;
  res.json({ total: projected.length, publishedCount, draftCount, items: projected });
});

// POST /api/cms/request/:id - Public endpoint for users to request a movie/series that lacks a stream link yet
router.post('/request/:id', (req, res) => {
  const rawId = decodeURIComponent(req.params.id);
  const body = req.body || {};
  let title = store.getCmsTitleById(rawId);

  if (!title && body.tmdbId) {
    title = store.getCmsTitleByTmdb(body.type === 'series' ? 'tv' : 'movie', body.tmdbId);
  }

  if (!title) {
    if (!body.title || !String(body.title).trim()) {
      return res.status(404).json({ error: 'Title not found' });
    }
    const normType =
      body.type === 'series' ? 'series' : body.type === 'animation' ? 'animation' : 'movie';
    title = store.upsertCmsTitle({
      id: rawId.startsWith('cms_') ? rawId : `cms_req_${crypto.randomBytes(4).toString('hex')}`,
      tmdbId: body.tmdbId ? Number(body.tmdbId) : null,
      type: normType,
      status: 'draft',
      featured: false,
      trending: true,
      title: String(body.title).trim().slice(0, 180),
      year: Number(body.year) || new Date().getFullYear(),
      rating: Number(body.rating) || 7.5,
      country: sanitizeString(body.country || 'United States', 80),
      regionTag: sanitizeString(body.regionTag || 'Hollywood', 40),
      language: 'Original Audio',
      subtitlesAvailable: ['Original Audio'],
      genres: Array.isArray(body.genres) ? body.genres.slice(0, 5) : ['Drama'],
      quality: '1080p',
      badge: 'Request',
      runtime: normType === 'series' ? 'TV Series' : 'Movie',
      poster: sanitizeString(body.poster || '', 400),
      backdrop: sanitizeString(body.backdrop || body.poster || '', 400),
      previewVideoUrl: '',
      overview: sanitizeString(body.overview || 'Requested by viewer.', 600),
      director: 'Unknown',
      cast: [],
      views: 0,
      downloads: 0,
      sources: [],
      requestCount: 0,
      lastRequestedAt: null,
    });
  }

  title.requestCount = (Number(title.requestCount) || 0) + 1;
  title.lastRequestedAt = new Date().toISOString();
  const saved = store.upsertCmsTitle(title);

  res.json({
    ok: true,
    id: saved.id,
    title: saved.title,
    requestCount: saved.requestCount,
    lastRequestedAt: saved.lastRequestedAt,
  });
});

// ==================== ADMIN ENDPOINTS ====================
// GET /api/cms/admin/titles - Full Admin Inventory (Draft Queue + Published + Partial Series stats + Filters)
router.get('/admin/titles', (req, res) => {
  ensureInitialCmsSeed();
  const statusFilter = String(req.query.status || 'all').toLowerCase();
  const typeFilter = String(req.query.type || 'all').toLowerCase();
  const regionFilter = String(req.query.region || 'all').toLowerCase();
  const genreFilter = String(req.query.genre || 'all').toLowerCase();
  const q = String(req.query.q || '').trim().toLowerCase();

  const allWithStats = store.getCmsTitles().map((t) => ({
    ...t,
    stats: computeTitleStats(t),
  }));

  const summary = {
    total: allWithStats.length,
    published: allWithStats.filter((t) => t.status === 'published' && t.stats.hasPlayableLinks).length,
    draftQueue: allWithStats.filter((t) => t.status !== 'published' || !t.stats.hasPlayableLinks).length,
    partialSeries: allWithStats.filter((t) => t.type === 'series' && t.stats.isPartial).length,
    totalLinks: allWithStats.reduce((sum, t) => sum + t.stats.totalSources, 0),
    requestedTitles: allWithStats.filter((t) => (Number(t.requestCount) || 0) > 0 && !t.stats.hasPlayableLinks).length,
    totalRequests: allWithStats.reduce((sum, t) => sum + (Number(t.requestCount) || 0), 0),
  };

  const availableGenres = Array.from(
    new Set(allWithStats.flatMap((t) => t.genres || []))
  ).sort();
  const availableRegions = Array.from(
    new Set(allWithStats.map((t) => t.regionTag).filter(Boolean))
  ).sort();

  let filtered = allWithStats;
  if (statusFilter === 'draft') {
    filtered = filtered.filter((t) => t.status !== 'published' || !t.stats.hasPlayableLinks);
  } else if (statusFilter === 'published') {
    filtered = filtered.filter((t) => t.status === 'published' && t.stats.hasPlayableLinks);
  } else if (statusFilter === 'partial') {
    filtered = filtered.filter((t) => t.type === 'series' && t.stats.isPartial);
  }

  if (typeFilter && typeFilter !== 'all') {
    filtered = filtered.filter((t) => t.type === typeFilter);
  }
  if (regionFilter && regionFilter !== 'all') {
    filtered = filtered.filter((t) => (t.regionTag || '').toLowerCase() === regionFilter);
  }
  if (genreFilter && genreFilter !== 'all') {
    filtered = filtered.filter((t) =>
      (t.genres || []).some((g) => g.toLowerCase() === genreFilter)
    );
  }

  if (q) {
    filtered = filtered.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.director || '').toLowerCase().includes(q) ||
        (t.country || '').toLowerCase().includes(q) ||
        (t.genres || []).some((g) => g.toLowerCase().includes(q)) ||
        String(t.year || '').includes(q)
    );
  }

  res.json({ summary, availableGenres, availableRegions, items: filtered });
});

// Helper: pull a single TMDB movie or TV series (including ALL seasons & episodes!) into Draft Queue
async function importTmdbIntoDraft(tmdbId, mediaType = 'movie') {
  const normalizedMedia = mediaType === 'tv' || mediaType === 'series' ? 'tv' : 'movie';
  const existing = store.getCmsTitleByTmdb(normalizedMedia, tmdbId);
  if (existing) return { alreadyExists: true, title: existing };

  const data = await tmdbFetch(`/${normalizedMedia}/${tmdbId}`, {
    append_to_response: 'credits,videos,external_ids',
  });

  const trailer = (data.videos?.results || []).find(
    (v) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser')
  );
  const directorObj = (data.credits?.crew || []).find((c) => c.job === 'Director');
  const creator = (data.created_by || [])[0];
  const imdbId = data.imdb_id || data.external_ids?.imdb_id || '';

  const genres = (data.genres || []).map((g) => g.name);
  const isAnim = genres.includes('Animation');
  const release = data.release_date || data.first_air_date || '';
  const originCountry = (data.origin_country && data.origin_country[0]) || 'US';

  // For TV series, fetch ALL seasons & episode lists from TMDB so admin can fill links per season/episode!
  let seasons = [];
  if (normalizedMedia === 'tv') {
    const rawSeasons = (data.seasons || []).filter(
      (s) => s.season_number > 0 && s.episode_count > 0
    );
    // Fetch up to 10 seasons cleanly in parallel batches
    const fetchedSeasons = await Promise.all(
      rawSeasons.slice(0, 10).map(async (s) => {
        try {
          const sData = await tmdbFetch(`/tv/${tmdbId}/season/${s.season_number}`);
          const episodes = (sData.episodes || []).map((ep) => ({
            id: `cms_ep_${tmdbId}_s${s.season_number}_e${ep.episode_number}`,
            seasonNumber: s.season_number,
            episodeNumber: ep.episode_number,
            title: ep.name || `Episode ${ep.episode_number}`,
            overview: ep.overview || '',
            still: ep.still_path ? `${IMG_BASE}/w500${ep.still_path}` : '',
            runtime: ep.runtime ? `${ep.runtime}m` : '',
            airDate: ep.air_date || '',
            rating: ep.vote_average ? Number(ep.vote_average.toFixed(1)) : 0,
            sources: [],
          }));
          return {
            seasonNumber: s.season_number,
            name: s.name || `Season ${s.season_number}`,
            episodeCount: episodes.length,
            airDate: s.air_date || '',
            episodes,
          };
        } catch {
          return {
            seasonNumber: s.season_number,
            name: s.name || `Season ${s.season_number}`,
            episodeCount: s.episode_count || 0,
            airDate: s.air_date || '',
            episodes: [],
          };
        }
      })
    );
    seasons = fetchedSeasons;
  }

  const countryMap = { US: 'United States', GB: 'United Kingdom', NG: 'Nigeria', KR: 'South Korea', JP: 'Japan', IN: 'India', FR: 'France', CA: 'Canada' };
  const country = countryMap[originCountry] || 'United States';
  const origLang = String(data.original_language || '').toLowerCase();
  const isJapanese = originCountry === 'JP' || origLang === 'ja';
  const isCartoon = normalizedMedia === 'tv' && (isAnim || genres.includes('Kids')) && !isJapanese;
  const isWesternAnimation = normalizedMedia === 'movie' && isAnim && !isJapanese;

  let regionTag = 'Hollywood';
  if (isAnim && isJapanese) regionTag = 'Anime';
  else if (isCartoon) regionTag = 'Cartoon';
  else if (isWesternAnimation) regionTag = 'Animation';
  else if (country === 'Nigeria') regionTag = 'Nollywood';
  else if (country === 'India') regionTag = 'Bollywood';
  else if (country === 'South Korea') regionTag = 'K-Drama';

  const draft = {
    id: `cms_${normalizedMedia}_${tmdbId}`,
    tmdbId: Number(tmdbId),
    type: normalizedMedia === 'tv' ? 'series' : isAnim ? 'animation' : 'movie',
    status: 'draft', // Stays HIDDEN in Draft Queue until admin adds links and clicks Publish!
    featured: false,
    trending: true,
    title: data.title || data.name || 'Untitled',
    year: release ? Number(release.slice(0, 4)) : new Date().getFullYear(),
    rating: data.vote_average ? Number(data.vote_average.toFixed(1)) : 7.5,
    imdbId,
    imdbRating: null,
    imdbVotes: null,
    country,
    regionTag,
    language: 'Original Audio',
    subtitlesAvailable: ['Original Audio'],
    genres: genres.length ? genres : ['Drama'],
    quality: '1080p',
    badge: 'HD',
    runtime: data.runtime ? `${data.runtime}m` : seasons.length ? `${seasons.length} Seasons` : '',
    poster: data.poster_path ? `${IMG_BASE}/w500${data.poster_path}` : '',
    backdrop: data.backdrop_path ? `${IMG_BASE}/w1280${data.backdrop_path}` : '',
    previewVideoUrl: '',
    trailerYoutubeId: trailer ? trailer.key : '',
    overview: data.overview || '',
    director: directorObj?.name || creator?.name || 'Unknown',
    cast: (data.credits?.cast || []).slice(0, 8).map((c) => c.name),
    views: 0,
    downloads: 0,
    seasons: normalizedMedia === 'tv' ? seasons : undefined,
    sources: [],
  };

  const saved = store.upsertCmsTitle(draft);
  return { alreadyExists: false, title: saved };
}

// POST /api/cms/admin/source-from-tmdb - Pull 1 movie/series from TMDB into Admin Draft Queue
router.post('/admin/source-from-tmdb', async (req, res) => {
  try {
    const { tmdbId, mediaType = 'movie' } = req.body;
    if (!tmdbId) return res.status(400).json({ error: 'tmdbId is required' });
    const result = await importTmdbIntoDraft(tmdbId, mediaType);
    res.status(result.alreadyExists ? 200 : 201).json({
      ...result,
      stats: computeTitleStats(result.title),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== MULTI-CATEGORY TMDB HARVESTER ====================
const HARVEST_CATEGORIES = {
  trending_movies: { label: 'Trending Movies', mediaType: 'movie', endpoint: '/trending/movie/week', params: {} },
  trending_tv: { label: 'Trending TV Series', mediaType: 'tv', endpoint: '/trending/tv/week', params: {} },
  now_playing: { label: 'Now Playing (Theaters)', mediaType: 'movie', endpoint: '/movie/now_playing', params: {} },
  upcoming: { label: 'Upcoming Movies', mediaType: 'movie', endpoint: '/movie/upcoming', params: {} },
  hollywood: { label: 'Hollywood Blockbusters', mediaType: 'movie', endpoint: '/discover/movie', params: { with_origin_country: 'US', sort_by: 'popularity.desc' } },
  nollywood: { label: 'Nollywood (Nigeria)', mediaType: 'movie', endpoint: '/discover/movie', params: { with_origin_country: 'NG', sort_by: 'popularity.desc' } },
  bollywood: { label: 'Bollywood (India)', mediaType: 'movie', endpoint: '/discover/movie', params: { with_origin_country: 'IN', sort_by: 'popularity.desc' } },
  kdrama: { label: 'K-Drama (South Korea)', mediaType: 'tv', endpoint: '/discover/tv', params: { with_origin_country: 'KR', sort_by: 'popularity.desc' } },
  anime: { label: 'Anime (Japanese)', mediaType: 'tv', endpoint: '/discover/tv', params: { with_genres: '16', with_origin_country: 'JP', sort_by: 'popularity.desc' } },
  animation: { label: 'Animation (Western / Pixar / Disney)', mediaType: 'movie', endpoint: '/discover/movie', params: { with_genres: '16', with_origin_country: 'US', sort_by: 'popularity.desc' } },
  cartoons: { label: 'Cartoons (Kids & TV Cartoons)', mediaType: 'tv', endpoint: '/discover/tv', params: { with_genres: '16', with_origin_country: 'US', sort_by: 'popularity.desc' } },
  action_scifi: { label: 'Action & Sci-Fi', mediaType: 'movie', endpoint: '/discover/movie', params: { with_genres: '28|878', sort_by: 'popularity.desc' } },
  horror_thriller: { label: 'Horror & Thriller', mediaType: 'movie', endpoint: '/discover/movie', params: { with_genres: '27|53', sort_by: 'popularity.desc' } },
  comedy_romance: { label: 'Comedy & Romance', mediaType: 'movie', endpoint: '/discover/movie', params: { with_genres: '35|10749', sort_by: 'popularity.desc' } },
  documentary: { label: 'Documentaries', mediaType: 'movie', endpoint: '/discover/movie', params: { with_genres: '99', sort_by: 'popularity.desc' } },
  top_rated_movies: { label: 'Top Rated Movies', mediaType: 'movie', endpoint: '/movie/top_rated', params: {} },
  top_rated_tv: { label: 'Top Rated TV Series', mediaType: 'tv', endpoint: '/tv/top_rated', params: {} },
};

const ALL_ROTATION_KEYS = [
  'trending_movies',
  'trending_tv',
  'now_playing',
  'upcoming',
  'hollywood',
  'nollywood',
  'bollywood',
  'kdrama',
  'anime',
  'animation',
  'cartoons',
  'action_scifi',
  'horror_thriller',
  'comedy_romance',
  'top_rated_movies',
  'documentary',
];

function getHarvestCursors() {
  const all = store.getAll();
  if (!all.harvestCursors) {
    all.harvestCursors = {};
    store.save();
  }
  return all.harvestCursors;
}

function getAutoHarvestConfig() {
  const all = store.getAll();
  if (!all.autoHarvest) {
    all.autoHarvest = {
      enabled: true,
      intervalMinutes: 5,
      batchPerCycle: 6,
      rotationIndex: 0,
      lastRunAt: null,
      nextRunAt: null,
      totalAutoAdded: 0,
    };
    store.save();
  }
  return all.autoHarvest;
}

async function runWithConcurrency(items, concurrency, worker) {
  const out = [];
  let idx = 0;
  async function next() {
    while (idx < items.length) {
      const current = items[idx++];
      try {
        out.push(await worker(current));
      } catch {
        // Skip failed item gracefully
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => next()));
  return out;
}

async function executeHarvest(categoryId = 'all', perCategory = 6) {
  const cursors = getHarvestCursors();
  const targetIds =
    categoryId === 'all'
      ? ALL_ROTATION_KEYS
      : HARVEST_CATEGORIES[categoryId]
      ? [categoryId]
      : null;

  if (!targetIds) {
    throw new Error(`Unknown category "${categoryId}"`);
  }

  const candidates = [];
  const seenKeys = new Set();

  await runWithConcurrency(targetIds, 5, async (catId) => {
    const cfg = HARVEST_CATEGORIES[catId];
    const page = cursors[catId] || 1;
    const listing = await tmdbFetch(cfg.endpoint, { ...cfg.params, page });
    cursors[catId] = page + 1;

    const sliceCount = categoryId === 'all' ? Math.min(3, perCategory) : perCategory;
    const rows = (listing.results || []).filter((r) => r.poster_path).slice(0, sliceCount);
    for (const r of rows) {
      const dedupeKey = `${cfg.mediaType}_${r.id}`;
      if (seenKeys.has(dedupeKey)) continue;
      if (store.getCmsTitleByTmdb(cfg.mediaType, r.id)) continue;
      seenKeys.add(dedupeKey);
      candidates.push({ tmdbId: r.id, mediaType: cfg.mediaType, categoryLabel: cfg.label });
    }
  });

  store.save();

  let added = 0;
  let skipped = 0;
  const addedTitles = [];

  await runWithConcurrency(candidates, 5, async (cand) => {
    const out = await importTmdbIntoDraft(cand.tmdbId, cand.mediaType);
    if (out.alreadyExists) {
      skipped++;
    } else {
      added++;
      addedTitles.push({
        id: out.title.id,
        title: out.title.title,
        type: out.title.type,
        regionTag: out.title.regionTag,
      });
    }
  });

  return {
    category: categoryId,
    categoriesScanned: targetIds.length,
    added,
    skipped,
    sample: addedTitles.slice(0, 12),
  };
}

// ==================== AUTOMATIC RECURRING BACKGROUND SCHEDULER ====================
let autoHarvestTimer = null;
let autoHarvestRunning = false;

async function runAutoHarvestTick() {
  const cfg = getAutoHarvestConfig();
  if (!cfg.enabled || autoHarvestRunning || !getTmdbKey()) return;

  autoHarvestRunning = true;
  try {
    // Rotate through 2 categories per automatic background tick so Draft Queue steadily grows across ALL genres & regions
    const idx1 = (cfg.rotationIndex || 0) % ALL_ROTATION_KEYS.length;
    const idx2 = (idx1 + 1) % ALL_ROTATION_KEYS.length;
    const cat1 = ALL_ROTATION_KEYS[idx1];
    const cat2 = ALL_ROTATION_KEYS[idx2];

    const r1 = await executeHarvest(cat1, Math.max(2, Math.floor((cfg.batchPerCycle || 6) / 2)));
    const r2 = await executeHarvest(cat2, Math.max(2, Math.ceil((cfg.batchPerCycle || 6) / 2)));

    cfg.rotationIndex = (idx2 + 1) % ALL_ROTATION_KEYS.length;
    cfg.lastRunAt = new Date().toISOString();
    cfg.nextRunAt = new Date(Date.now() + cfg.intervalMinutes * 60 * 1000).toISOString();
    cfg.totalAutoAdded = (cfg.totalAutoAdded || 0) + r1.added + r2.added;
    store.save();
    console.log(
      `[Auto-Harvest] Added ${r1.added + r2.added} fresh TMDB titles (${HARVEST_CATEGORIES[cat1].label} + ${HARVEST_CATEGORIES[cat2].label})`
    );
  } catch (err) {
    console.error('[Auto-Harvest] Cycle error:', err.message);
  } finally {
    autoHarvestRunning = false;
  }
}

function scheduleAutoHarvest() {
  if (autoHarvestTimer) {
    clearInterval(autoHarvestTimer);
    autoHarvestTimer = null;
  }
  if (IS_VERCEL) return;
  const cfg = getAutoHarvestConfig();
  if (!cfg.enabled) {
    cfg.nextRunAt = null;
    store.save();
    return;
  }
  const ms = Math.max(5, Number(cfg.intervalMinutes) || 5) * 60 * 1000;
  cfg.nextRunAt = new Date(Date.now() + ms).toISOString();
  store.save();
  autoHarvestTimer = setInterval(runAutoHarvestTick, ms);
  if (autoHarvestTimer.unref) autoHarvestTimer.unref();
}

// Start recurring scheduler automatically on server boot
scheduleAutoHarvest();

// GET /api/cms/admin/requests - Dedicated User Requests Queue (Most Requested + Latest Requests)
router.get('/admin/requests', (req, res) => {
  ensureInitialCmsSeed();
  const requested = store
    .getCmsTitles()
    .filter((t) => (Number(t.requestCount) || 0) > 0)
    .map((t) => ({
      ...t,
      requestCount: Number(t.requestCount) || 0,
      stats: computeTitleStats(t),
    }));

  const mostRequested = [...requested].sort(
    (a, b) =>
      b.requestCount - a.requestCount ||
      new Date(b.lastRequestedAt || 0).getTime() - new Date(a.lastRequestedAt || 0).getTime()
  );

  const recentRequests = [...requested].sort(
    (a, b) =>
      new Date(b.lastRequestedAt || 0).getTime() - new Date(a.lastRequestedAt || 0).getTime() ||
      b.requestCount - a.requestCount
  );

  const summary = {
    totalRequestClicks: requested.reduce((sum, t) => sum + t.requestCount, 0),
    uniqueRequestedTitles: requested.length,
    unfulfilledRequestedTitles: requested.filter(
      (t) => !t.stats.hasPlayableLinks || t.status !== 'published'
    ).length,
    fulfilledRequestedTitles: requested.filter(
      (t) => t.stats.hasPlayableLinks && t.status === 'published'
    ).length,
  };

  res.json({ summary, mostRequested, recentRequests });
});

// DELETE /api/cms/admin/requests/:id - Reset request counter on a title
router.delete('/admin/requests/:id', (req, res) => {
  const title = store.getCmsTitleById(req.params.id);
  if (!title) return res.status(404).json({ error: 'Title not found' });
  title.requestCount = 0;
  title.lastRequestedAt = null;
  store.upsertCmsTitle(title);
  res.json({ ok: true });
});

// GET /api/cms/admin/auto-harvest - Read recurring scheduler status
router.get('/admin/auto-harvest', (req, res) => {
  const cfg = getAutoHarvestConfig();
  res.json({
    ...cfg,
    runningNow: autoHarvestRunning,
    nextCategoryPreview: HARVEST_CATEGORIES[ALL_ROTATION_KEYS[(cfg.rotationIndex || 0) % ALL_ROTATION_KEYS.length]]?.label,
  });
});

// PUT /api/cms/admin/auto-harvest - Toggle ON/OFF or adjust interval
router.put('/admin/auto-harvest', (req, res) => {
  const cfg = getAutoHarvestConfig();
  if (typeof req.body.enabled === 'boolean') cfg.enabled = req.body.enabled;
  if (req.body.intervalMinutes !== undefined) {
    cfg.intervalMinutes = Math.min(1440, Math.max(5, Number(req.body.intervalMinutes) || 5));
  }
  if (req.body.batchPerCycle !== undefined) {
    cfg.batchPerCycle = Math.min(20, Math.max(2, Number(req.body.batchPerCycle) || 6));
  }
  store.save();
  scheduleAutoHarvest();
  res.json({
    ...cfg,
    runningNow: autoHarvestRunning,
    nextCategoryPreview: HARVEST_CATEGORIES[ALL_ROTATION_KEYS[(cfg.rotationIndex || 0) % ALL_ROTATION_KEYS.length]]?.label,
  });
});

// GET /api/cms/admin/harvest-categories - Lists all available TMDB categories & current page cursor
router.get('/admin/harvest-categories', (req, res) => {
  const cursors = getHarvestCursors();
  const categories = Object.entries(HARVEST_CATEGORIES).map(([id, cfg]) => ({
    id,
    label: cfg.label,
    mediaType: cfg.mediaType,
    nextPage: cursors[id] || 1,
  }));
  res.json({ categories });
});

// POST /api/cms/admin/harvest - Pull a specific category OR 'all' categories into Draft Queue!
router.post('/admin/harvest', async (req, res) => {
  try {
    const categoryId = String(req.body?.category || 'all');
    const perCategory = Math.min(20, Math.max(2, Number(req.body?.limit) || 6));
    const result = await executeHarvest(categoryId, perCategory);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cms/admin/sync-trending - Bulk pull trending movies/series from TMDB straight into Draft Queue
router.post('/admin/sync-trending', async (req, res) => {
  try {
    const mediaType = req.body?.mediaType === 'tv' ? 'tv' : 'movie';
    const limit = Math.min(12, Math.max(1, Number(req.body?.limit) || 6));
    const trend = await tmdbFetch(`/trending/${mediaType}/week`);
    const results = (trend.results || []).slice(0, limit);

    let added = 0;
    let skipped = 0;
    for (const r of results) {
      const out = await importTmdbIntoDraft(r.id, mediaType);
      if (out.alreadyExists) skipped++;
      else added++;
    }
    res.json({ added, skipped, mediaType });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cms/admin/titles - Manually create a custom movie or series
router.post('/admin/titles', (req, res) => {
  const b = req.body;
  if (!b.title || !String(b.title).trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }
  const type = b.type === 'series' ? 'series' : b.type === 'animation' ? 'animation' : 'movie';
  const id = `cms_custom_${crypto.randomBytes(4).toString('hex')}`;

  const seasons =
    type === 'series'
      ? Array.from({ length: Math.max(1, Number(b.seasonsCount) || 1) }, (_, si) => ({
          seasonNumber: si + 1,
          name: `Season ${si + 1}`,
          episodeCount: Math.max(1, Number(b.episodesPerSeason) || 4),
          episodes: Array.from({ length: Math.max(1, Number(b.episodesPerSeason) || 4) }, (__, ei) => ({
            id: `${id}_s${si + 1}e${ei + 1}`,
            seasonNumber: si + 1,
            episodeNumber: ei + 1,
            title: `Episode ${ei + 1}`,
            overview: '',
            still: b.backdrop || b.poster || '',
            runtime: b.runtime || '45m',
            airDate: String(b.year || new Date().getFullYear()),
            rating: Number(b.rating) || 8.0,
            sources: [],
          })),
        }))
      : undefined;

  const created = store.upsertCmsTitle({
    id,
    tmdbId: null,
    type,
    status: 'draft',
    featured: false,
    trending: true,
    title: String(b.title).trim(),
    year: Number(b.year) || new Date().getFullYear(),
    rating: Number(b.rating) || 8.0,
    country: b.country || 'United States',
    regionTag: b.country === 'Nigeria' ? 'Nollywood' : b.country === 'India' ? 'Bollywood' : 'Hollywood',
    language: 'Original Audio',
    subtitlesAvailable: ['Original Audio'],
    genres: String(b.genres || 'Drama')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
    quality: b.quality || '1080p',
    badge: b.quality || 'HD',
    runtime: b.runtime || (type === 'series' ? 'TV Series' : '1h 55m'),
    poster: (b.poster || '').trim() || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600&q=80',
    backdrop: (b.backdrop || b.poster || '').trim() || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1400&q=80',
    previewVideoUrl: '',
    trailerYoutubeId: (b.trailerYoutubeId || '').trim(),
    overview: (b.overview || '').trim() || 'Added via CinePulse Admin Studio.',
    director: (b.director || 'CinePulse Studio').trim(),
    cast: String(b.cast || '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
    views: 0,
    downloads: 0,
    seasons,
    sources: [],
  });

  res.status(201).json({ ...created, stats: computeTitleStats(created) });
});

// POST /api/cms/admin/titles/:id/sources - Add a stream + download mirror to a Movie
router.post('/admin/titles/:id/sources', (req, res) => {
  const title = store.getCmsTitleById(req.params.id);
  if (!title) return res.status(404).json({ error: 'Title not found' });

  const { label, quality = '1080p', size = 'HD', url, downloadUrl } = req.body;
  if (!url || !String(url).trim()) return res.status(400).json({ error: 'Stream URL is required' });

  const cleanUrl = String(url).trim();
  const isHls = /\.m3u8(\?|$)/i.test(cleanUrl);
  const src = {
    id: 'src_' + crypto.randomBytes(4).toString('hex'),
    label: (label || `Server ${(title.sources?.length || 0) + 1} (${quality})`).trim(),
    quality,
    type: isHls ? 'hls' : 'mp4',
    size: size || (isHls ? 'Adaptive' : 'MP4'),
    url: cleanUrl,
    downloadUrl: (downloadUrl || (isHls ? '' : cleanUrl)).trim(),
    healthStatus: 'untested',
  };

  title.sources = [...(title.sources || []), src];
  const saved = store.upsertCmsTitle(title);
  res.status(201).json({ ...saved, stats: computeTitleStats(saved) });
});

// DELETE /api/cms/admin/titles/:id/sources/:sourceId - Remove movie mirror
router.delete('/admin/titles/:id/sources/:sourceId', (req, res) => {
  const title = store.getCmsTitleById(req.params.id);
  if (!title) return res.status(404).json({ error: 'Title not found' });
  title.sources = (title.sources || []).filter((s) => s.id !== req.params.sourceId);
  const stats = computeTitleStats(title);
  if (!stats.hasPlayableLinks) title.status = 'draft';
  const saved = store.upsertCmsTitle(title);
  res.json({ ...saved, stats: computeTitleStats(saved) });
});

// POST /api/cms/admin/titles/:id/seasons/:seasonNum/episodes/:epNum/sources - Add link to a specific Series Episode
router.post('/admin/titles/:id/seasons/:seasonNum/episodes/:epNum/sources', (req, res) => {
  const title = store.getCmsTitleById(req.params.id);
  if (!title || title.type !== 'series') return res.status(404).json({ error: 'Series not found' });

  const sNum = Number(req.params.seasonNum);
  const eNum = Number(req.params.epNum);
  const { label, quality = '1080p', size = 'HD', url, downloadUrl } = req.body;
  if (!url || !String(url).trim()) return res.status(400).json({ error: 'Stream URL is required' });

  const season = (title.seasons || []).find((s) => s.seasonNumber === sNum);
  if (!season) return res.status(404).json({ error: `Season ${sNum} not found` });
  const ep = (season.episodes || []).find((e) => e.episodeNumber === eNum);
  if (!ep) return res.status(404).json({ error: `Episode ${eNum} not found` });

  const cleanUrl = String(url).trim();
  const isHls = /\.m3u8(\?|$)/i.test(cleanUrl);
  ep.sources = [
    ...(ep.sources || []),
    {
      id: 'epsrc_' + crypto.randomBytes(4).toString('hex'),
      label: (label || `S${String(sNum).padStart(2, '0')}E${String(eNum).padStart(2, '0')} (${quality})`).trim(),
      quality,
      type: isHls ? 'hls' : 'mp4',
      size: size || (isHls ? 'Adaptive' : 'MP4'),
      url: cleanUrl,
      downloadUrl: (downloadUrl || (isHls ? '' : cleanUrl)).trim(),
      healthStatus: 'untested',
    },
  ];

  const saved = store.upsertCmsTitle(title);
  res.status(201).json({ ...saved, stats: computeTitleStats(saved) });
});

// DELETE /api/cms/admin/titles/:id/seasons/:seasonNum/episodes/:epNum/sources/:sourceId
router.delete('/admin/titles/:id/seasons/:seasonNum/episodes/:epNum/sources/:sourceId', (req, res) => {
  const title = store.getCmsTitleById(req.params.id);
  if (!title || title.type !== 'series') return res.status(404).json({ error: 'Series not found' });
  const season = (title.seasons || []).find((s) => s.seasonNumber === Number(req.params.seasonNum));
  const ep = (season?.episodes || []).find((e) => e.episodeNumber === Number(req.params.epNum));
  if (!ep) return res.status(404).json({ error: 'Episode not found' });

  ep.sources = (ep.sources || []).filter((s) => s.id !== req.params.sourceId);
  const stats = computeTitleStats(title);
  if (!stats.hasPlayableLinks) title.status = 'draft';
  const saved = store.upsertCmsTitle(title);
  res.json({ ...saved, stats: computeTitleStats(saved) });
});

// POST /api/cms/admin/titles/:id/seasons/:seasonNum/bulk-links - Paste 1 URL per line to link E01, E02, E03... in 1 click!
router.post('/admin/titles/:id/seasons/:seasonNum/bulk-links', (req, res) => {
  const title = store.getCmsTitleById(req.params.id);
  if (!title || title.type !== 'series') return res.status(404).json({ error: 'Series not found' });
  const sNum = Number(req.params.seasonNum);
  const season = (title.seasons || []).find((s) => s.seasonNumber === sNum);
  if (!season) return res.status(404).json({ error: `Season ${sNum} not found` });

  const lines = String(req.body.urlsText || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const quality = req.body.quality || '1080p';

  let linkedCount = 0;
  lines.forEach((line, idx) => {
    const ep = season.episodes?.[idx];
    if (!ep) return;
    const isHls = /\.m3u8(\?|$)/i.test(line);
    ep.sources = [
      ...(ep.sources || []),
      {
        id: 'epsrc_' + crypto.randomBytes(4).toString('hex'),
        label: `S${String(sNum).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')} (${quality})`,
        quality,
        type: isHls ? 'hls' : 'mp4',
        size: isHls ? 'Adaptive' : 'MP4',
        url: line,
        downloadUrl: isHls ? '' : line,
        healthStatus: 'untested',
      },
    ];
    linkedCount++;
  });

  const saved = store.upsertCmsTitle(title);
  res.json({ linkedCount, title: { ...saved, stats: computeTitleStats(saved) } });
});

// POST /api/cms/admin/titles/:id/publish - Publish title to live website (requires at least 1 real link!)
router.post('/admin/titles/:id/publish', (req, res) => {
  const title = store.getCmsTitleById(req.params.id);
  if (!title) return res.status(404).json({ error: 'Title not found' });
  const stats = computeTitleStats(title);
  if (!stats.hasPlayableLinks) {
    return res.status(400).json({
      error:
        title.type === 'series'
          ? 'Attach at least 1 episode stream/download link before publishing this series.'
          : 'Attach at least 1 stream/download link before publishing this movie.',
    });
  }
  title.status = 'published';
  const saved = store.upsertCmsTitle(title);
  res.json({ ...saved, stats: computeTitleStats(saved) });
});

// POST /api/cms/admin/titles/:id/unpublish - Move back to Admin Draft Queue (hides from main website)
router.post('/admin/titles/:id/unpublish', (req, res) => {
  const title = store.getCmsTitleById(req.params.id);
  if (!title) return res.status(404).json({ error: 'Title not found' });
  title.status = 'draft';
  const saved = store.upsertCmsTitle(title);
  res.json({ ...saved, stats: computeTitleStats(saved) });
});

// POST /api/cms/admin/titles/:id/toggle-featured - Pin/unpin on Hero Carousel
router.post('/admin/titles/:id/toggle-featured', (req, res) => {
  const title = store.getCmsTitleById(req.params.id);
  if (!title) return res.status(404).json({ error: 'Title not found' });
  title.featured = !title.featured;
  const saved = store.upsertCmsTitle(title);
  res.json({ ...saved, stats: computeTitleStats(saved) });
});

// POST /api/cms/admin/titles/:id/check-links - Automated Dead-Link Health Checker (flags 403/404 broken links!)
router.post('/admin/titles/:id/check-links', async (req, res) => {
  const title = store.getCmsTitleById(req.params.id);
  if (!title) return res.status(404).json({ error: 'Title not found' });

  async function probe(src) {
    if (!src.url) return { ...src, healthStatus: 'broken' };
    if (src.url.startsWith('/api/media/')) return { ...src, healthStatus: 'ok' };
    // SSRF Protection: Block probes to localhost, loopback, cloud metadata, or private LAN IPs
    if (!isSafeExternalUrl(src.url)) {
      return {
        ...src,
        healthStatus: 'blocked_ssrf',
        lastCheckedAt: new Date().toISOString(),
      };
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const r = await fetch(src.url, { method: 'HEAD', signal: controller.signal });
      clearTimeout(timeout);
      return {
        ...src,
        healthStatus: r.ok ? 'ok' : `error_${r.status}`,
        lastCheckedAt: new Date().toISOString(),
      };
    } catch {
      return { ...src, healthStatus: 'broken', lastCheckedAt: new Date().toISOString() };
    }
  }

  if (title.type === 'series') {
    for (const s of title.seasons || []) {
      for (const ep of s.episodes || []) {
        if (ep.sources?.length) {
          ep.sources = await Promise.all(ep.sources.map(probe));
        }
      }
    }
  } else if (title.sources?.length) {
    title.sources = await Promise.all(title.sources.map(probe));
  }

  const saved = store.upsertCmsTitle(title);
  res.json({ ...saved, stats: computeTitleStats(saved) });
});

// DELETE /api/cms/admin/titles/:id
router.delete('/admin/titles/:id', (req, res) => {
  const deleted = store.deleteCmsTitle(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Title not found' });
  res.json({ ok: true });
});

module.exports = router;
