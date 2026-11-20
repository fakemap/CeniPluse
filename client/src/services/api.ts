import type {
  CmsTitleItem,
  EpisodeItem,
  LocalMediaFile,
  MediaItem,
  MediaSource,
  SeasonSummary,
  UserReviewItem,
  VideoClip,
  WatchProvider,
} from '../types/media';

interface TmdbApiItem {
  tmdbId: number;
  type: 'movie' | 'series';
  mediaType?: 'movie' | 'tv';
  title: string;
  overview: string;
  year: number | null;
  rating: number;
  votes?: number;
  poster: string;
  backdrop: string;
  language?: string;
  originCountry?: string;
  discoverGenre?: string;
  country?: string;
  regionTag?: MediaItem['regionTag'];
  genres?: string[];
}

export interface TmdbDetailResponse {
  tmdbId: number;
  imdbId?: string;
  imdbRating?: number | null;
  imdbVotes?: number | null;
  votes?: number;
  releaseDate?: string;
  title: string;
  overview: string;
  director: string;
  runtime: number;
  genres: string[];
  trailerYoutubeId: string;
  videos: VideoClip[];
  recommendations?: TmdbApiItem[];
  seasons: SeasonSummary[];
  numberOfSeasons: number;
  numberOfEpisodes: number;
  boundSources: MediaSource[];
  cast: { name: string; role: string; photo?: string }[];
}

const trailerKeyCache = new Map<string, string>();

export function mapTmdbToMediaItem(item: TmdbApiItem): MediaItem {
  const lang = (item.language || 'EN').toUpperCase();
  const origin = (item.originCountry || '').toUpperCase();
  const isAnim =
    item.discoverGenre === '16' ||
    Boolean(item.genres?.some((g) => /animat/i.test(g)));

  const country =
    item.country ||
    (origin === 'NG'
      ? 'Nigeria'
      : origin === 'IN' || lang === 'HI'
      ? 'India'
      : origin === 'KR' || lang === 'KO'
      ? 'South Korea'
      : origin === 'JP' || lang === 'JA'
      ? 'Japan'
      : lang === 'FR'
      ? 'France'
      : lang === 'ES'
      ? 'Spain'
      : 'United States');

  const regionTag: MediaItem['regionTag'] =
    item.regionTag ||
    (origin === 'NG'
      ? 'Nollywood'
      : origin === 'IN' || lang === 'HI'
      ? 'Bollywood'
      : origin === 'KR' || lang === 'KO'
      ? 'K-Drama'
      : isAnim || lang === 'JA'
      ? 'Anime'
      : 'Hollywood');

  const genres = item.genres?.length
    ? item.genres
    : isAnim
    ? ['Animation', 'Adventure']
    : item.type === 'series'
    ? ['Drama', 'Thriller']
    : ['Action', 'Drama'];

  return {
    id: `tmdb_${item.mediaType || item.type}_${item.tmdbId}`,
    tmdbId: item.tmdbId,
    title: item.title,
    type: isAnim && item.type !== 'series' ? 'animation' : item.type === 'series' ? 'series' : 'movie',
    year: item.year || 2026,
    rating: item.rating || 7.5,
    country,
    regionTag,
    language: 'Original Audio',
    subtitlesAvailable: ['Original Audio', 'English Dub', 'Spanish Sub', 'French Sub'],
    genres,
    quality: '1080p',
    badge: 'Request',
    isDraft: true,
    hasStreamLinks: false,
    runtime: item.type === 'series' ? 'TV Series' : 'Movie',
    poster:
      item.poster ||
      'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600&q=80',
    backdrop:
      item.backdrop ||
      item.poster ||
      'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1400&q=80',
    // IMPORTANT: Never attach an unrelated placeholder movie clip to TMDB items!
    previewVideoUrl: '',
    overview: item.overview || 'Live release metadata synced from TMDB.',
    director: 'Loading...',
    cast: ['Click to view cast & episodes'],
    views: Math.max(45000, (item.votes || 300) * 160),
    downloads: Math.max(8000, (item.votes || 120) * 45),
    trending: true,
    featured: Boolean(item.backdrop),
    // Empty until user binds their own local file / stream URL; official trailer plays automatically!
    sources: [],
  };
}

function getAuthHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('cinepulse_token') || '' : '';
  return token ? { ...extra, 'x-cinepulse-token': token } : extra;
}

export const backendApi = {
  async loginSession(email: string): Promise<{ email: string; role: string; token: string }> {
    const res = await fetch('/api/user/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Sign-in failed');
    return data;
  },

  async syncWatchlistToggle(movieId: string): Promise<{ added: boolean; watchlist: string[] }> {
    const res = await fetch('/api/user/watchlist/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ movieId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Watchlist sync failed');
    return data;
  },

  async saveWatchProgress(payload: {
    movieId: string;
    episodeId?: string | null;
    title: string;
    poster: string;
    currentTime: number;
    duration: number;
  }) {
    try {
      const raw = localStorage.getItem('cinepulse_progress');
      const map: Record<
        string,
        {
          mediaId: string;
          positionSec: number;
          durationSec: number;
          updatedAt: string;
        }
      > = raw ? JSON.parse(raw) : {};
      map[payload.movieId] = {
        mediaId: payload.movieId,
        positionSec: Math.max(30, Math.round(payload.currentTime || 120)),
        durationSec: Math.max(600, Math.round(payload.duration || 5400)),
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem('cinepulse_progress', JSON.stringify(map));
      window.dispatchEvent(new CustomEvent('cinepulse:progress'));
    } catch {
      // ignore storage quota errors
    }

    try {
      await fetch('/api/user/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      // Non-blocking background sync
    }
  },

  async fetchLiveTmdbCatalog(): Promise<MediaItem[]> {
    try {
      const [trendMovies, trendTv, popMovies, popTv, topMovies, nollywood, anime] =
        await Promise.all([
          fetch('/api/tmdb/trending?type=movie').then((r) => (r.ok ? r.json() : { items: [] })),
          fetch('/api/tmdb/trending?type=tv').then((r) => (r.ok ? r.json() : { items: [] })),
          fetch('/api/tmdb/feed/popular_movies').then((r) => (r.ok ? r.json() : { items: [] })),
          fetch('/api/tmdb/feed/popular_tv').then((r) => (r.ok ? r.json() : { items: [] })),
          fetch('/api/tmdb/feed/top_rated').then((r) => (r.ok ? r.json() : { items: [] })),
          fetch('/api/tmdb/discover?type=movie&country=NG').then((r) =>
            r.ok ? r.json() : { items: [] }
          ),
          fetch('/api/tmdb/discover?type=movie&genre=16').then((r) =>
            r.ok ? r.json() : { items: [] }
          ),
        ]);

      const raw: TmdbApiItem[] = [
        ...(trendMovies.items || []),
        ...(trendTv.items || []),
        ...(popMovies.items || []),
        ...(popTv.items || []),
        ...(topMovies.items || []),
        ...(nollywood.items || []),
        ...(anime.items || []),
      ];

      const seen = new Set<string>();
      const out: MediaItem[] = [];
      for (const item of raw) {
        const key = `${item.type}_${item.tmdbId}`;
        if (seen.has(key) || !item.poster) continue;
        seen.add(key);
        out.push(mapTmdbToMediaItem(item));
      }
      return out;
    } catch {
      return [];
    }
  },

  async searchLiveTmdb(query: string, signal?: AbortSignal): Promise<MediaItem[]> {
    if (!query.trim()) return [];
    try {
      const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(query)}`, { signal });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.items || []).slice(0, 14).map(mapTmdbToMediaItem);
    } catch {
      return [];
    }
  },

  async fetchTrailerKey(
    type: string,
    tmdbId: number,
    signal?: AbortSignal
  ): Promise<string> {
    const normalizedType = type === 'series' ? 'tv' : 'movie';
    const cacheKey = `${normalizedType}:${tmdbId}`;
    if (trailerKeyCache.has(cacheKey)) {
      return trailerKeyCache.get(cacheKey) || '';
    }

    try {
      const res = await fetch(`/api/tmdb/trailer/${normalizedType}/${tmdbId}`, { signal });
      if (!res.ok) return '';
      const data = await res.json();
      const key = typeof data.trailerYoutubeId === 'string' ? data.trailerYoutubeId : '';
      if (trailerKeyCache.size >= 400) {
        const oldestKey = trailerKeyCache.keys().next().value;
        if (oldestKey !== undefined) trailerKeyCache.delete(oldestKey);
      }
      trailerKeyCache.set(cacheKey, key);
      return key;
    } catch {
      return '';
    }
  },

  async fetchTmdbDetails(
    type: string,
    tmdbId: number,
    signal?: AbortSignal
  ): Promise<TmdbDetailResponse | null> {
    try {
      const res = await fetch(
        `/api/tmdb/details/${type === 'series' ? 'tv' : 'movie'}/${tmdbId}`,
        { signal }
      );
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  },

  async fetchTmdbSeason(
    tvId: number,
    seasonNumber: number,
    signal?: AbortSignal
  ): Promise<{ seasonNumber: number; name: string; episodes: EpisodeItem[] } | null> {
    try {
      const res = await fetch(`/api/tmdb/tv/${tvId}/season/${seasonNumber}`, { signal });
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  },

  async resolveScrapedStreams(
    params: {
      tmdbId?: number | null;
      type: string;
      season?: number;
      episode?: number;
      title?: string;
      year?: number;
    },
    signal?: AbortSignal
  ): Promise<{
    sources: MediaSource[];
    subtitles: Array<{ label: string; lang: string; url: string }>;
    mycima?: {
      watchEmbedUrl: string;
      seasonDownloads: Array<{ id: string; quality: string; label: string; url: string }>;
    };
  }> {
    try {
      const qs = new URLSearchParams();
      if (params.tmdbId) qs.set('tmdbId', String(params.tmdbId));
      qs.set('type', params.type === 'series' || params.type === 'tv' ? 'tv' : 'movie');
      if (params.season) qs.set('season', String(params.season));
      if (params.episode) qs.set('episode', String(params.episode));
      if (params.title) qs.set('title', params.title);
      if (params.year) qs.set('year', String(params.year));

      const res = await fetch(`/api/scraper/resolve?${qs.toString()}`, { signal });
      if (!res.ok) return { sources: [], subtitles: [] };
      const data = await res.json();
      return {
        sources: Array.isArray(data.sources) ? data.sources : [],
        subtitles: Array.isArray(data.subtitles) ? data.subtitles : [],
        mycima: data.mycima,
      };
    } catch {
      return { sources: [], subtitles: [] };
    }
  },

  async bindSource(payload: {
    tmdbId: number;
    mediaType: 'movie' | 'tv';
    season?: number;
    episode?: number;
    label: string;
    quality: string;
    size?: string;
    url: string;
    downloadUrl?: string;
  }): Promise<{ bindingKey: string; source: MediaSource; sources: MediaSource[] }> {
    const res = await fetch('/api/tmdb/bind-source', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to bind source');
    return data;
  },

  async scanLocalDrive(): Promise<{ root: string; files: LocalMediaFile[] }> {
    try {
      const res = await fetch('/api/media/scan');
      if (!res.ok) return { root: '', files: [] };
      const data = await res.json();
      return { root: data.root || '', files: data.files || [] };
    } catch {
      return { root: '', files: [] };
    }
  },

  // ==================== CMS PUBLISHING PIPELINE ====================
  async fetchPublicPublishedCatalog(): Promise<MediaItem[]> {
    try {
      const res = await fetch('/api/cms/public');
      if (!res.ok) return [];
      const data = await res.json();
      return data.items || [];
    } catch {
      return [];
    }
  },

  async fetchCmsAdminTitles(
    status = 'all',
    q = '',
    opts: { type?: string; region?: string; genre?: string } = {}
  ): Promise<{
    summary: {
      total: number;
      published: number;
      draftQueue: number;
      partialSeries: number;
      totalLinks: number;
      requestedTitles?: number;
      totalRequests?: number;
    };
    availableGenres: string[];
    availableRegions: string[];
    items: CmsTitleItem[];
  }> {
    const qs = new URLSearchParams({ status });
    if (q.trim()) qs.set('q', q.trim());
    if (opts.type && opts.type !== 'all') qs.set('type', opts.type);
    if (opts.region && opts.region !== 'all') qs.set('region', opts.region);
    if (opts.genre && opts.genre !== 'all') qs.set('genre', opts.genre);
    const res = await fetch(`/api/cms/admin/titles?${qs.toString()}`, {
      headers: getAuthHeaders(),
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error('AUTH_REQUIRED');
    }
    if (!res.ok) throw new Error('Failed to load Admin CMS inventory');
    return res.json();
  },

  async fetchHarvestCategories(): Promise<{
    categories: Array<{ id: string; label: string; mediaType: string; nextPage: number }>;
  }> {
    const res = await fetch('/api/cms/admin/harvest-categories', {
      headers: getAuthHeaders(),
    });
    if (!res.ok) return { categories: [] };
    return res.json();
  },

  async fetchAutoHarvestStatus(): Promise<{
    enabled: boolean;
    intervalMinutes: number;
    batchPerCycle: number;
    lastRunAt: string | null;
    nextRunAt: string | null;
    totalAutoAdded: number;
    runningNow: boolean;
    nextCategoryPreview?: string;
  }> {
    const res = await fetch('/api/cms/admin/auto-harvest', {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to load auto-harvest status');
    return res.json();
  },

  async updateAutoHarvest(patch: {
    enabled?: boolean;
    intervalMinutes?: number;
    batchPerCycle?: number;
  }) {
    const res = await fetch('/api/cms/admin/auto-harvest', {
      method: 'PUT',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error('Failed to update auto-harvest settings');
    return res.json();
  },

  async cmsHarvestTmdb(category = 'all', limit = 6) {
    const res = await fetch('/api/cms/admin/harvest', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ category, limit }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Harvest failed');
    return data as {
      category: string;
      categoriesScanned: number;
      added: number;
      skipped: number;
      sample: Array<{ id: string; title: string; type: string; regionTag: string }>;
    };
  },

  async cmsSourceFromTmdb(tmdbId: number, mediaType: 'movie' | 'tv') {
    const res = await fetch('/api/cms/admin/source-from-tmdb', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ tmdbId, mediaType }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to import from TMDB');
    return data;
  },

  async cmsSyncTrendingToDrafts(mediaType: 'movie' | 'tv', limit = 6) {
    const res = await fetch('/api/cms/admin/sync-trending', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ mediaType, limit }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Sync failed');
    return data;
  },

  async cmsCreateCustomTitle(payload: Record<string, unknown>) {
    const res = await fetch('/api/cms/admin/titles', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Create failed');
    return data as CmsTitleItem;
  },

  async cmsAddMovieSource(
    id: string,
    payload: { label: string; quality: string; size: string; url: string; downloadUrl?: string }
  ) {
    const res = await fetch(`/api/cms/admin/titles/${encodeURIComponent(id)}/sources`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to add link');
    return data as CmsTitleItem;
  },

  async cmsDeleteMovieSource(id: string, sourceId: string) {
    const res = await fetch(
      `/api/cms/admin/titles/${encodeURIComponent(id)}/sources/${encodeURIComponent(sourceId)}`,
      { method: 'DELETE', headers: getAuthHeaders() }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to remove link');
    return data as CmsTitleItem;
  },

  async cmsAddEpisodeSource(
    id: string,
    seasonNum: number,
    epNum: number,
    payload: { label: string; quality: string; size: string; url: string; downloadUrl?: string }
  ) {
    const res = await fetch(
      `/api/cms/admin/titles/${encodeURIComponent(id)}/seasons/${seasonNum}/episodes/${epNum}/sources`,
      {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to add episode link');
    return data as CmsTitleItem;
  },

  async cmsDeleteEpisodeSource(id: string, seasonNum: number, epNum: number, sourceId: string) {
    const res = await fetch(
      `/api/cms/admin/titles/${encodeURIComponent(id)}/seasons/${seasonNum}/episodes/${epNum}/sources/${encodeURIComponent(sourceId)}`,
      { method: 'DELETE', headers: getAuthHeaders() }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to remove episode link');
    return data as CmsTitleItem;
  },

  async cmsBulkAddSeasonLinks(id: string, seasonNum: number, urlsText: string, quality = '1080p') {
    const res = await fetch(
      `/api/cms/admin/titles/${encodeURIComponent(id)}/seasons/${seasonNum}/bulk-links`,
      {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ urlsText, quality }),
      }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Bulk import failed');
    return data as { linkedCount: number; title: CmsTitleItem };
  },

  async cmsPublish(id: string) {
    const res = await fetch(`/api/cms/admin/titles/${encodeURIComponent(id)}/publish`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Cannot publish');
    return data as CmsTitleItem;
  },

  async cmsUnpublish(id: string) {
    const res = await fetch(`/api/cms/admin/titles/${encodeURIComponent(id)}/unpublish`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Cannot unpublish');
    return data as CmsTitleItem;
  },

  async cmsToggleFeatured(id: string) {
    const res = await fetch(`/api/cms/admin/titles/${encodeURIComponent(id)}/toggle-featured`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    return data as CmsTitleItem;
  },

  async cmsUpdateTitleMetadata(
    id: string,
    payload: { malId?: number | null; tmdbId?: number | null }
  ) {
    const res = await fetch(`/api/cms/admin/titles/${encodeURIComponent(id)}/metadata`, {
      method: 'PATCH',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update metadata');
    return data as CmsTitleItem;
  },

  async cmsCheckLinks(id: string) {
    const res = await fetch(`/api/cms/admin/titles/${encodeURIComponent(id)}/check-links`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Link check failed');
    return data as CmsTitleItem;
  },

  async cmsDeleteTitle(id: string) {
    const res = await fetch(`/api/cms/admin/titles/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Delete failed');
    return res.json();
  },

  async requestMediaTitle(item: MediaItem): Promise<{
    ok: boolean;
    id: string;
    title: string;
    requestCount: number;
    lastRequestedAt: string;
  }> {
    const res = await fetch(`/api/cms/request/${encodeURIComponent(item.id)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: item.title,
        type: item.type,
        year: item.year,
        rating: item.rating,
        tmdbId: item.tmdbId,
        poster: item.poster,
        backdrop: item.backdrop,
        overview: item.overview,
        genres: item.genres,
        country: item.country,
        regionTag: item.regionTag,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  },

  async fetchCmsAdminRequests(): Promise<{
    summary: {
      totalRequestClicks: number;
      uniqueRequestedTitles: number;
      unfulfilledRequestedTitles: number;
      fulfilledRequestedTitles: number;
    };
    mostRequested: CmsTitleItem[];
    recentRequests: CmsTitleItem[];
  }> {
    const res = await fetch('/api/cms/admin/requests', {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to load user requests');
    return res.json();
  },

  async clearCmsTitleRequests(id: string) {
    const res = await fetch(`/api/cms/admin/requests/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to clear requests');
    return res.json();
  },

  async fetchReviews(movieId: string): Promise<UserReviewItem[]> {
    try {
      const res = await fetch(`/api/user/reviews/${encodeURIComponent(movieId)}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.items || [];
    } catch {
      return [];
    }
  },

  async postReview(
    movieId: string,
    payload: { author: string; rating: number; text: string }
  ): Promise<UserReviewItem> {
    const res = await fetch(`/api/user/reviews/${encodeURIComponent(movieId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to post review');
    return data;
  },
};
