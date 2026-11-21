import type {
  AudioVersionOption,
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
  language?: string;
  originCountry?: string;
  country?: string;
  regionTag?: MediaItem['regionTag'];
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

export function resolveOriginalAudioName(params: {
  language?: string;
  originCountry?: string;
  country?: string;
  regionTag?: string;
}): string {
  const lang = String(params.language || '').toUpperCase().trim();
  const origin = String(params.originCountry || '').toUpperCase().trim();
  const country = String(params.country || '').toLowerCase();
  const region = String(params.regionTag || '').toLowerCase();

  if (lang === 'KO' || lang === 'KOR' || origin === 'KR' || country.includes('korea') || region.includes('k-drama')) {
    return 'Korean';
  }
  if (lang === 'JA' || lang === 'JPN' || origin === 'JP' || country.includes('japan') || region.includes('anime')) {
    return 'Japanese';
  }
  if (lang === 'HI' || lang === 'HIN' || origin === 'IN' || country.includes('india') || region.includes('bollywood')) {
    return 'Hindi';
  }
  if (lang === 'FR' || lang === 'FRA' || lang === 'FRE' || origin === 'FR' || country.includes('france')) {
    return 'French';
  }
  if (lang === 'ES' || lang === 'SPA' || origin === 'ES' || origin === 'MX' || country.includes('spain') || country.includes('mexico')) {
    return 'Spanish';
  }
  if (lang === 'IT' || lang === 'ITA' || origin === 'IT' || country.includes('italy')) {
    return 'Italian';
  }
  if (lang === 'PT' || lang === 'POR' || origin === 'BR' || origin === 'PT' || country.includes('brazil') || country.includes('portugal')) {
    return 'Portuguese';
  }
  if (lang === 'DE' || lang === 'DEU' || lang === 'GER' || origin === 'DE' || country.includes('germany')) {
    return 'German';
  }
  if (lang === 'ZH' || lang === 'ZHO' || lang === 'CHI' || origin === 'CN' || origin === 'TW' || origin === 'HK' || country.includes('china')) {
    return 'Chinese';
  }
  if (lang === 'TR' || lang === 'TUR' || origin === 'TR' || country.includes('turkey')) {
    return 'Turkish';
  }
  if (lang === 'RU' || lang === 'RUS' || origin === 'RU' || country.includes('russia')) {
    return 'Russian';
  }
  if (lang === 'AR' || lang === 'ARA' || country.includes('egypt') || country.includes('arab')) {
    return 'Arabic';
  }
  if (lang === 'TH' || lang === 'THA' || origin === 'TH' || country.includes('thailand')) {
    return 'Thai';
  }
  if (lang === 'TL' || lang === 'FIL' || origin === 'PH' || country.includes('philippines')) {
    return 'Filipino';
  }
  if (lang === 'ID' || lang === 'IND' || origin === 'ID' || country.includes('indonesia')) {
    return 'Indonesian';
  }
  return 'English';
}

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

  const origAudioName = resolveOriginalAudioName({
    language: lang,
    originCountry: origin,
    country,
    regionTag,
  });

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
    language: `Original (${origAudioName})`,
    subtitlesAvailable: [`Original (${origAudioName})`, 'English Sub', 'Spanish Sub', 'French Sub'],
    genres,
    quality: '1080p',
    badge: 'HD',
    isDraft: false,
    hasStreamLinks: true,
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
  return token
    ? { ...extra, Authorization: `Bearer ${token}`, 'x-cinepulse-token': token }
    : extra;
}

export const backendApi = {
  async fetchAuthSession(): Promise<{
    authenticated: boolean;
    id?: string;
    email?: string;
    role?: 'admin' | 'user';
    fullName?: string;
    avatarUrl?: string;
  }> {
    const res = await fetch('/api/user/auth/session', {
      headers: getAuthHeaders(),
    });
    if (!res.ok) return { authenticated: false };
    return res.json();
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

  async discoverTmdbPage(opts: {
    type: 'movie' | 'tv';
    page: number;
    genre?: string;
    country?: string;
    year?: string;
    sortBy?: string;
  }): Promise<{ items: MediaItem[]; page: number; totalPages: number; totalResults: number }> {
    try {
      const genreIdMap: Record<string, string> = {
        Action: opts.type === 'tv' ? '10759' : '28',
        Adventure: opts.type === 'tv' ? '10759' : '12',
        Animation: '16',
        Biography: '99',
        Comedy: '35',
        Crime: '80',
        Documentary: '99',
        Drama: '18',
        Family: '10751',
        Fantasy: opts.type === 'tv' ? '10765' : '14',
        History: '36',
        Horror: '27',
        Mystery: '9648',
        Romance: '10749',
        'Sci-Fi': opts.type === 'tv' ? '10765' : '878',
        Thriller: '53',
        War: opts.type === 'tv' ? '10768' : '10752',
      };
      const countryCodeMap: Record<string, string> = {
        'United States': 'US',
        Nigeria: 'NG',
        'United Kingdom': 'GB',
        'South Korea': 'KR',
        Japan: 'JP',
        India: 'IN',
        France: 'FR',
        Germany: 'DE',
        Netherlands: 'NL',
        Spain: 'ES',
        Canada: 'CA',
      };
      const sortMap: Record<string, string> = {
        'For You': 'popularity.desc',
        Hottest: 'popularity.desc',
        Latest: opts.type === 'tv' ? 'first_air_date.desc' : 'primary_release_date.desc',
        'Top Rated': 'vote_average.desc',
      };

      const qs = new URLSearchParams({
        type: opts.type,
        page: String(Math.max(1, opts.page)),
        sort_by: sortMap[opts.sortBy || 'For You'] || 'popularity.desc',
      });
      if (opts.genre && opts.genre !== 'All' && genreIdMap[opts.genre]) {
        qs.set('genre', genreIdMap[opts.genre]);
      }
      if (opts.country && opts.country !== 'All' && countryCodeMap[opts.country]) {
        qs.set('country', countryCodeMap[opts.country]);
      }
      if (opts.year && opts.year !== 'All') {
        qs.set('year', opts.year);
      }

      const res = await fetch(`/api/tmdb/discover?${qs.toString()}`);
      if (!res.ok) return { items: [], page: opts.page, totalPages: 1, totalResults: 0 };
      const data = await res.json();
      const items = ((data.items || []) as TmdbApiItem[])
        .filter((x) => Boolean(x.poster))
        .map(mapTmdbToMediaItem);
      return {
        items,
        page: data.page || opts.page,
        totalPages: data.totalPages || 1,
        totalResults: data.totalResults || items.length,
      };
    } catch {
      return { items: [], page: opts.page, totalPages: 1, totalResults: 0 };
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
      dubId?: string;
      detailPath?: string;
    },
    signal?: AbortSignal
  ): Promise<{
    sources: MediaSource[];
    subtitles: Array<{ label: string; lang: string; url: string }>;
    audioVersions?: AudioVersionOption[];
    seasonPacks?: Array<{ id: string; quality: string; label: string; url: string }>;
  }> {
    try {
      const qs = new URLSearchParams();
      if (params.tmdbId) qs.set('tmdbId', String(params.tmdbId));
      qs.set('type', params.type === 'series' || params.type === 'tv' ? 'tv' : 'movie');
      if (params.season) qs.set('season', String(params.season));
      if (params.episode) qs.set('episode', String(params.episode));
      if (params.title) qs.set('title', params.title);
      if (params.year) qs.set('year', String(params.year));
      if (params.dubId) qs.set('dubId', String(params.dubId));
      if (params.detailPath) qs.set('detailPath', String(params.detailPath));

      const viteEnv = (
        import.meta as ImportMeta & { env?: Record<string, string | undefined> }
      ).env;
      const isLocalClient =
        typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' ||
          window.location.hostname === '127.0.0.1' ||
          window.location.hostname.startsWith('192.168.') ||
          window.location.hostname.startsWith('10.'));
      const remoteScraper = String(
        viteEnv?.VITE_SCRAPER_API_BASE ||
          (isLocalClient ? '' : 'https://fjiklhy643.apps.bot-hosting.cloud')
      )
        .trim()
        .replace(/\/+$/, '');

      const parseResScore = (q?: string) => {
        const s = String(q || '').toLowerCase();
        if (s.includes('4k') || s.includes('2160')) return 2160;
        const m = s.match(/(\d{3,4})/);
        return m ? Number(m[1]) : 720;
      };

      const fetchFromBase = async (base: string) => {
        const prefix = (u?: string) =>
          u && base && u.startsWith('/') ? `${base}${u}` : u || '';
        const r = await fetch(`${base}/api/scraper/resolve?${qs.toString()}`, { signal });
        if (!r.ok) return null;
        const d = await r.json();
        return {
          sources: Array.isArray(d.sources)
            ? d.sources.map((s: MediaSource) => ({
                ...s,
                url: prefix(s.url),
                downloadUrl: s.downloadUrl ? prefix(s.downloadUrl) : undefined,
              }))
            : [],
          subtitles: Array.isArray(d.subtitles)
            ? d.subtitles.map((sub: { label: string; lang: string; url: string }) => ({
                ...sub,
                url: prefix(sub.url),
              }))
            : [],
          audioVersions: Array.isArray(d.audioVersions) ? (d.audioVersions as AudioVersionOption[]) : [],
          seasonPacks: Array.isArray(d.seasonPacks) ? d.seasonPacks : [],
        };
      };

      // Query same-origin Vercel API first (instant MovieBox multi-language + OpenSubtitles).
      // Only fall back to remote Bot-Hosting /resolve if same-origin returns 0 sources (avoids slow dual calls & stale Italian dubs).
      const localResult = await fetchFromBase('').catch(() => null);
      const shouldFallbackRemote =
        Boolean(remoteScraper) &&
        !params.dubId &&
        (!localResult || localResult.sources.length === 0);
      const remoteResult = shouldFallbackRemote
        ? await fetchFromBase(remoteScraper).catch(() => null)
        : null;

      const rawSources: MediaSource[] = [
        ...(localResult?.sources || []),
        ...(remoteResult?.sources || []),
      ];
      const combinedSubs = [
        ...(localResult?.subtitles || []),
        ...(remoteResult?.subtitles || []),
      ];
      const seenSubKeys = new Set<string>();
      const uniqueSubs = combinedSubs.filter((s) => {
        const key = `${String(s.label).toLowerCase()}_${String(s.lang).toLowerCase()}`;
        if (!s.url || seenSubKeys.has(key)) return false;
        seenSubKeys.add(key);
        return true;
      });
      const audioVersions: AudioVersionOption[] =
        (localResult?.audioVersions && localResult.audioVersions.length > 0
          ? localResult.audioVersions
          : remoteResult?.audioVersions) || [];

      // Order by Original Audio first (when not requesting a dub), then resolution descending (1080p first), preferring MP4 over HLS
      rawSources.sort((a, b) => {
        if (!params.dubId) {
          const aDub = a.isDub ? 1 : 0;
          const bDub = b.isDub ? 1 : 0;
          if (aDub !== bDub) return aDub - bDub;
        }
        const resDiff = parseResScore(b.quality) - parseResScore(a.quality);
        if (resDiff !== 0) return resDiff;
        if (a.type !== b.type) return a.type === 'mp4' ? -1 : 1;
        return 0;
      });
      const sortedSources = rawSources.map((s, idx) => ({
        ...s,
        label: `Server ${idx + 1} (${s.quality || '1080p'})`,
      }));

      return {
        sources: sortedSources,
        subtitles: uniqueSubs,
        audioVersions,
        seasonPacks: localResult?.seasonPacks?.length
          ? localResult.seasonPacks
          : remoteResult?.seasonPacks || [],
      };
    } catch {
      return { sources: [], subtitles: [], audioVersions: [], seasonPacks: [] };
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
    if (res.status === 401) {
      throw new Error('AUTH_REQUIRED');
    }
    if (res.status === 403) {
      throw new Error('ADMIN_FORBIDDEN');
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
