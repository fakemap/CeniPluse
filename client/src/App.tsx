import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  Bookmark,
  PlayCircle,
  Play,
  X,
  LogIn,
  Trash2,
  Loader2,
  Plus,
} from 'lucide-react';
import type {
  CategoryCardItem,
  DownloadRecord,
  FilterState,
  MediaItem,
  NavRoute,
} from './types/media';
import { CATEGORY_CARDS, INITIAL_CATALOG } from './data/catalog';
import { backendApi } from './services/api';
import {
  supabase,
  extractAuthProfile,
  syncSessionToken,
  signOutSupabase,
  type AuthUserProfile,
} from './services/supabase';
import { hasVidLinkSupport } from './utils/vidlink';
import { AppShell } from './components/AppShell';
import { HeroCarousel } from './components/HeroCarousel';
import { CategoryCards } from './components/CategoryCards';
import { SpotlightMiniRail } from './components/SpotlightMiniRail';
import { FilterMatrix } from './components/FilterMatrix';
import { ContentRail } from './components/ContentRail';
import { TopTenRail } from './components/TopTenRail';
import { ContinueWatchingRail, type WatchProgressEntry } from './components/ContinueWatchingRail';
import { PosterCard } from './components/PosterCard';
import { ActionModals } from './components/ActionModals';
import { MobileSearchView } from './components/MobileSearchView';
import { TrendingRankedView } from './components/TrendingRankedView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { GridSkeleton, HeroSkeleton, RailSkeleton } from './components/SkeletonLoaders';
import { AdSlot } from './components/AdSlot';
import { GlobalAdLoader } from './components/GlobalAdLoader';
import {
  fetchPublicMonetizationConfig,
  fetchSubscriptionStatus,
  trackEvent,
  type MonetizationConfig,
} from './services/analytics';

// Lazy-load heavy views so the initial homepage bundle stays small and fast on mobile
const AdminPortalView = lazy(() =>
  import('./components/AdminPortalView').then((m) => ({ default: m.AdminPortalView }))
);
const MediaDetailView = lazy(() =>
  import('./components/MediaDetailView').then((m) => ({ default: m.MediaDetailView }))
);

const VALID_ROUTES = new Set<NavRoute>([
  'home',
  'series',
  'movies',
  'animation',
  'trending',
  'search',
  'watching',
  'watchlist',
  'downloads',
  'admin',
]);

function readUrlState(): {
  route: NavRoute;
  q: string;
  filters: FilterState;
} {
  if (typeof window === 'undefined') {
    return { route: 'home', q: '', filters: DEFAULT_FILTERS };
  }
  const pathname = window.location.pathname.replace(/\/+$/, '').toLowerCase();
  if (pathname === '/admin') {
    return { route: 'admin', q: '', filters: DEFAULT_FILTERS };
  }
  const params = new URLSearchParams(window.location.search);
  const rawView = (params.get('view') || 'home') as NavRoute;
  const route: NavRoute = VALID_ROUTES.has(rawView) ? rawView : 'home';
  const q = params.get('q') || '';
  const sortRaw = params.get('sort') as FilterState['sortBy'] | null;
  const validSorts: Array<FilterState['sortBy']> = ['For You', 'Hottest', 'Latest', 'Top Rated'];
  return {
    route,
    q,
    filters: {
      genre: params.get('genre') || 'All',
      country: params.get('country') || 'All',
      year: params.get('year') || 'All',
      language: params.get('lang') || 'All',
      sortBy: sortRaw && validSorts.includes(sortRaw) ? sortRaw : 'For You',
      regionShortcut: 'All',
    },
  };
}

const DEFAULT_FILTERS: FilterState = {
  genre: 'All',
  country: 'All',
  year: 'All',
  language: 'All',
  sortBy: 'For You',
  regionShortcut: 'All',
};

function matchGenre(genres: string[] | undefined, targetGenre: string): boolean {
  if (targetGenre === 'All') return true;
  if (!genres || !Array.isArray(genres) || genres.length === 0) return false;
  const target = targetGenre.toLowerCase();
  return genres.some((g) => {
    if (typeof g !== 'string') return false;
    const lower = g.toLowerCase();
    if (lower === target) return true;
    if (target === 'action' && lower.includes('action')) return true;
    if (target === 'adventure' && lower.includes('adventure')) return true;
    if (target === 'sci-fi' && (lower.includes('sci-fi') || lower.includes('science fiction'))) return true;
    if (target === 'fantasy' && lower.includes('fantasy')) return true;
    if (target === 'war' && lower.includes('war')) return true;
    if (target === 'animation' && lower.includes('animat')) return true;
    if (target === 'biography' && (lower.includes('bio') || lower.includes('docu') || lower.includes('history'))) return true;
    return lower.includes(target);
  });
}

function matchCountry(itemCountry: string | undefined, targetCountry: string): boolean {
  if (targetCountry === 'All') return true;
  if (!itemCountry || typeof itemCountry !== 'string') return false;
  if (itemCountry === targetCountry) return true;
  const lowerItem = itemCountry.toLowerCase();
  const lowerTarget = targetCountry.toLowerCase();
  if (lowerTarget === 'united states' && (lowerItem === 'us' || lowerItem === 'usa' || lowerItem === 'united states')) return true;
  if (lowerTarget === 'united kingdom' && (lowerItem === 'uk' || lowerItem === 'gb' || lowerItem === 'united kingdom')) return true;
  if (lowerTarget === 'south korea' && (lowerItem === 'kr' || lowerItem === 'korea' || lowerItem === 'south korea')) return true;
  return lowerItem === lowerTarget;
}

function matchesFilters(item: MediaItem, filters: FilterState): boolean {
  if (filters.genre !== 'All' && !matchGenre(item.genres, filters.genre)) {
    return false;
  }
  if (filters.country !== 'All' && !matchCountry(item.country, filters.country)) {
    return false;
  }
  if (filters.year !== 'All') {
    const y = Number(item.year);
    if (filters.year === '2010s') {
      if (!y || y < 2010 || y > 2019) return false;
    } else if (filters.year === '2000s') {
      if (!y || y < 2000 || y > 2009) return false;
    } else if (String(item.year) !== filters.year) {
      return false;
    }
  }
  if (filters.language !== 'All' && filters.language !== 'Original Audio') {
    const subs = Array.isArray(item.subtitlesAvailable) ? item.subtitlesAvailable : [];
    if (item.language !== filters.language && !subs.includes(filters.language)) {
      return false;
    }
  }
  return true;
}

function sortItems(items: MediaItem[], sortBy: FilterState['sortBy']): MediaItem[] {
  const copy = [...items];
  switch (sortBy) {
    case 'Hottest':
      return copy.sort((a, b) => b.views - a.views);
    case 'Latest':
      return copy.sort((a, b) => b.year - a.year || b.rating - a.rating);
    case 'Top Rated':
      return copy.sort((a, b) => b.rating - a.rating);
    default:
      return copy.sort(
        (a, b) =>
          Number(Boolean(b.trending)) - Number(Boolean(a.trending)) || b.rating - a.rating
      );
  }
}

interface InfiniteSentinelProps {
  onIntersect: () => void;
  isLoading: boolean;
  hasMore?: boolean;
}

// Invisible sentinel — no loading indicator shown to users, purely triggers fetch when in view
const InfiniteSentinel: React.FC<InfiniteSentinelProps> = ({
  onIntersect,
  isLoading,
  hasMore = true,
}) => {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hasMore || isLoading) return;
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onIntersect();
        }
      },
      { rootMargin: '400px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [onIntersect, hasMore, isLoading]);

  // Invisible spacer — no visible UI, just a trigger point
  return <div ref={sentinelRef} className="h-4 w-full" aria-hidden="true" />;
};

export const App: React.FC = () => {
  const initialUrl = useMemo(() => readUrlState(), []);
  const [activeRoute, setActiveRoute] = useState<NavRoute>(initialUrl.route);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [uiLanguage, setUiLanguage] = useState('EN');
  const [searchQuery, setSearchQuery] = useState(initialUrl.q);

  const [publishedCatalog, setPublishedCatalog] = useState<MediaItem[]>([]);
  const [draftedCatalog, setDraftedCatalog] = useState<MediaItem[]>([]);
  const [catalog, setCatalog] = useState<MediaItem[]>(INITIAL_CATALOG);
  // Items fetched from TMDB pagination — kept separate so they always APPEND at the bottom
  // of the grid rather than being re-sorted into the middle of the existing list
  const [tmdbAppended, setTmdbAppended] = useState<Record<string, MediaItem[]>>({
    movie: [],
    series: [],
    animation: [],
  });

  const [isHydratingLive, setIsHydratingLive] = useState(true);

  const [filters, setFilters] = useState<FilterState>(initialUrl.filters);
  const [activeCategoryCard, setActiveCategoryCard] = useState<string>('all');
  const [directoryHeading, setDirectoryHeading] = useState<string>('');
  const [directoryTypeFilter, setDirectoryTypeFilter] = useState<
    'all' | 'movie' | 'series' | 'animation'
  >(() =>
    initialUrl.route === 'series'
      ? 'series'
      : initialUrl.route === 'animation'
      ? 'animation'
      : 'all'
  );

  const [watchlistIds, setWatchlistIds] = useState<Set<string>>(() => new Set());

  const [selectedMedia, setSelectedMedia] = useState<{
    item: MediaItem;
    autoPlay: boolean;
  } | null>(null);
  const [activeModal, setActiveModal] = useState<'pro' | 'app' | 'signin' | null>(null);
  const [userProfile, setUserProfile] = useState<AuthUserProfile | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(() =>
    localStorage.getItem('cinepulse_user')
  );
  const [premiumPlan, setPremiumPlan] = useState<string | null>(() =>
    localStorage.getItem('cinepulse_premium_plan')
  );

  const accountKey = useMemo(() => {
    const raw = (userProfile?.email || userEmail || '').trim().toLowerCase();
    return raw || null;
  }, [userProfile, userEmail]);
  const isSignedIn = Boolean(accountKey);

  // Sync live Supabase Auth session (Email/Password + Google OAuth + Auto Token Refresh)
  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const session = data.session;
      syncSessionToken(session);
      const profile = extractAuthProfile(session?.user);
      setUserProfile(profile);
      setUserEmail(profile?.email || null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      syncSessionToken(session);
      const profile = extractAuthProfile(session?.user);
      setUserProfile(profile);
      setUserEmail(profile?.email || null);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const [watchProgressMap, setWatchProgressMap] = useState<Record<string, WatchProgressEntry>>({});

  // Load account-scoped Watchlist & Watching progress ONLY when signed in; clear immediately when signed out
  useEffect(() => {
    if (!accountKey) {
      setWatchlistIds(new Set());
      setWatchProgressMap({});
      return;
    }

    const watchlistKey = `cinepulse_watchlist_${accountKey}`;
    const progressKey = `cinepulse_progress_${accountKey}`;

    try {
      const savedWatchlist = JSON.parse(localStorage.getItem(watchlistKey) || '[]');
      setWatchlistIds(Array.isArray(savedWatchlist) ? new Set(savedWatchlist) : new Set());
    } catch {
      setWatchlistIds(new Set());
    }

    const syncProgress = () => {
      try {
        const raw = localStorage.getItem(progressKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          setWatchProgressMap(parsed && typeof parsed === 'object' ? parsed : {});
        } else {
          setWatchProgressMap({});
        }
      } catch {
        setWatchProgressMap({});
      }
    };

    syncProgress();
    window.addEventListener('cinepulse:progress', syncProgress);
    return () => window.removeEventListener('cinepulse:progress', syncProgress);
  }, [accountKey]);

  const recordPlayStart = (item: MediaItem) => {
    // Only track Watching history for signed-in accounts
    if (!accountKey) return;
    const progressKey = `cinepulse_progress_${accountKey}`;
    setWatchProgressMap((prev) => {
      const existing = prev[item.id];
      const next: Record<string, WatchProgressEntry> = {
        ...prev,
        [item.id]: {
          mediaId: item.id,
          positionSec: existing?.positionSec || 60,
          durationSec: existing?.durationSec || 5400,
          seasonNumber: item.type === 'series' ? existing?.seasonNumber || 1 : undefined,
          episodeNumber: item.type === 'series' ? existing?.episodeNumber || 1 : undefined,
          updatedAt: new Date().toISOString(),
        },
      };
      try {
        localStorage.setItem(progressKey, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const handleRemoveContinueWatching = (mediaId: string) => {
    if (!accountKey) return;
    const progressKey = `cinepulse_progress_${accountKey}`;
    setWatchProgressMap((prev) => {
      const next = { ...prev };
      delete next[mediaId];
      try {
        localStorage.setItem(progressKey, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const [monetizationConfig, setMonetizationConfig] = useState<MonetizationConfig | null>(null);
  const [serverSubActive, setServerSubActive] = useState<boolean>(false);
  const [paywallReason, setPaywallReason] = useState<string | null>(null);

  const hasActiveSubscription = Boolean(
    userProfile?.role === 'admin' || serverSubActive || premiumPlan
  );

  const openPaywallModal = (reason: string) => {
    setPaywallReason(reason);
    setActiveModal('pro');
  };

  useEffect(() => {
    fetchSubscriptionStatus().then((st) => {
      setServerSubActive(Boolean(st.active));
      if (st.active && st.planId) {
        setPremiumPlan(st.planId);
      }
    });
  }, [userEmail]);

  const handlePlayItem = (item: MediaItem) => {
    const mode = monetizationConfig?.accessMode || 'free';
    if (['soft_paywall', 'strict_gate'].includes(mode) && !hasActiveSubscription) {
      setSelectedMedia({ item, autoPlay: false });
      openPaywallModal(
        `Subscribe to CeniPluse Premium (from GHS 25/mo via MoMo or Card) to stream "${item.title}" ad-free in HD.`
      );
      return;
    }
    if (item.sources.length > 0 || hasVidLinkSupport(item)) {
      recordPlayStart(item);
    }
    setSelectedMedia({ item, autoPlay: true });
  };

  // Persist account-scoped watchlist only when signed in
  useEffect(() => {
    if (!accountKey) return;
    try {
      localStorage.setItem(
        `cinepulse_watchlist_${accountKey}`,
        JSON.stringify(Array.from(watchlistIds))
      );
    } catch {
      // ignore
    }
  }, [watchlistIds, accountKey]);

  // ---- Browser history (Back / Forward) support ----
  // Every "page" (route, directory view, or opened title) gets its own history entry via pushState.
  // Search typing / filter tweaks only replace the current entry so Back doesn't step through keystrokes.
  type HistoryNavState = {
    cpNav: true;
    route: NavRoute;
    titleId: string | null;
    autoPlay: boolean;
    heading: string;
    typeFilter: 'all' | 'movie' | 'series' | 'animation';
    scrollY: number;
    idx?: number;
  };
  const lastNavKeyRef = useRef<string | null>(null);
  const restoringFromPopRef = useRef(false);
  const pendingScrollRef = useRef<number | null>(null);
  const catalogRef = useRef<MediaItem[]>(catalog);
  catalogRef.current = catalog;
  const pendingTitleIdRef = useRef<string | null>(
    new URLSearchParams(window.location.search).get('title')
  );

  const MEDIA_CACHE_KEY = 'cinepulse_nav_media_cache';
  const readMediaCache = (): Record<string, MediaItem> => {
    try {
      return JSON.parse(sessionStorage.getItem(MEDIA_CACHE_KEY) || '{}') || {};
    } catch {
      return {};
    }
  };
  const findMediaById = (id: string): MediaItem | null =>
    catalogRef.current.find((m) => m.id === id) || readMediaCache()[id] || null;

  // Remember opened titles so Back/Forward/Reload can restore them even if they aren't in the home catalog
  useEffect(() => {
    const item = selectedMedia?.item;
    if (!item) return;
    try {
      const cache = readMediaCache();
      cache[item.id] = item;
      const ids = Object.keys(cache);
      if (ids.length > 60) ids.slice(0, ids.length - 60).forEach((k) => delete cache[k]);
      sessionStorage.setItem(MEDIA_CACHE_KEY, JSON.stringify(cache));
    } catch {
      // ignore quota errors
    }
  }, [selectedMedia]);

  // Deep link / reload with ?title=... — open the title once it can be found
  useEffect(() => {
    const pendingId = pendingTitleIdRef.current;
    if (!pendingId || selectedMedia) return;
    const item = findMediaById(pendingId);
    if (item) {
      pendingTitleIdRef.current = null;
      setSelectedMedia({ item, autoPlay: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog]);

  // Synchronize route, search query, and filters bidirectionally with URL query parameters + document.title
  useEffect(() => {
    const navState: HistoryNavState = {
      cpNav: true,
      route: activeRoute,
      titleId: selectedMedia?.item?.id || null,
      autoPlay: Boolean(selectedMedia?.autoPlay),
      heading: directoryHeading,
      typeFilter: directoryTypeFilter,
      scrollY: 0,
    };
    const navKey = `${navState.route}|${navState.titleId || ''}|${navState.heading}|${navState.typeFilter}`;
    // Title still waiting to be resolved from the URL: don't overwrite the deep link yet
    const waitingForDeepLink = Boolean(pendingTitleIdRef.current) && !selectedMedia;

    const commitUrl = (nextUrl: string) => {
      const currentUrl = `${window.location.pathname}${window.location.search}`;
      const shouldPush =
        lastNavKeyRef.current !== null &&
        lastNavKeyRef.current !== navKey &&
        !restoringFromPopRef.current;
      if (shouldPush) {
        // Save scroll position of the page we're leaving so Back returns to the same spot
        const prev = window.history.state as HistoryNavState | null;
        if (prev && prev.cpNav) {
          window.history.replaceState({ ...prev, scrollY: window.scrollY }, '', currentUrl);
        }
        window.history.pushState({ ...navState, idx: (prev?.cpNav ? prev.idx || 0 : 0) + 1 }, '', nextUrl);
      } else if (nextUrl !== currentUrl || !(window.history.state as HistoryNavState | null)?.cpNav) {
        const prev = window.history.state as HistoryNavState | null;
        window.history.replaceState(
          { ...navState, scrollY: prev?.cpNav ? prev.scrollY : 0, idx: prev?.cpNav ? prev.idx || 0 : 0 },
          '',
          nextUrl
        );
      }
      lastNavKeyRef.current = navKey;
      restoringFromPopRef.current = false;
    };

    if (waitingForDeepLink) {
      // keep current URL untouched
    } else if (activeRoute === 'admin' && !selectedMedia?.item) {
      commitUrl('/admin');
    } else {
      const params = new URLSearchParams();
      if (activeRoute !== 'home') params.set('view', activeRoute);
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      if (filters.genre !== 'All') params.set('genre', filters.genre);
      if (filters.country !== 'All') params.set('country', filters.country);
      if (filters.year !== 'All') params.set('year', filters.year);
      if (filters.language !== 'All') params.set('lang', filters.language);
      if (filters.sortBy !== 'For You') params.set('sort', filters.sortBy);
      if (selectedMedia?.item?.id) params.set('title', selectedMedia.item.id);

      const qs = params.toString();
      const nextUrl = `/${qs ? `?${qs}` : ''}`;
      commitUrl(nextUrl);
    }

    if (pendingScrollRef.current !== null) {
      const y = pendingScrollRef.current;
      pendingScrollRef.current = null;
      requestAnimationFrame(() => window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior }));
    }

    const setMetaTag = (selector: string, attr: string, value: string) => {
      const el = document.querySelector(selector);
      if (el) el.setAttribute(attr, value);
    };

    if (selectedMedia?.item) {
      const item = selectedMedia.item;
      const mediaTitle = `${item.title} (${item.year}) — Watch Free in HD on CeniPluse`;
      const mediaDesc = item.overview
        ? item.overview.slice(0, 160)
        : `Watch ${item.title} (${item.year}) online in full HD. Stream and download free on CeniPluse.`;
      const mediaUrl = `https://www.cenipluse.xyz/?title=${encodeURIComponent(item.id)}`;

      document.title = mediaTitle;
      setMetaTag('meta[name="description"]', 'content', mediaDesc);
      setMetaTag('meta[property="og:title"]', 'content', mediaTitle);
      setMetaTag('meta[property="og:description"]', 'content', mediaDesc);
      setMetaTag('meta[property="og:url"]', 'content', mediaUrl);
      if (item.poster || item.backdrop) {
        setMetaTag('meta[property="og:image"]', 'content', item.backdrop || item.poster);
        setMetaTag('meta[name="twitter:image"]', 'content', item.backdrop || item.poster);
      }
      setMetaTag('link[rel="canonical"]', 'href', mediaUrl);

      // Inject structured JSON-LD Movie/TVSeries schema for Google Rich Results
      try {
        let script = document.getElementById('media-jsonld') as HTMLScriptElement | null;
        if (!script) {
          script = document.createElement('script');
          script.id = 'media-jsonld';
          script.type = 'application/ld+json';
          document.head.appendChild(script);
        }
        script.text = JSON.stringify({
          '@context': 'https://schema.org',
          '@type': item.type === 'series' ? 'TVSeries' : 'Movie',
          name: item.title,
          description: item.overview || '',
          image: item.poster || item.backdrop || '',
          datePublished: item.releaseDate || String(item.year || ''),
          genre: item.genres || [],
          aggregateRating: item.rating
            ? {
                '@type': 'AggregateRating',
                ratingValue: item.rating,
                bestRating: '10',
                worstRating: '1',
                ratingCount: item.votes || 100,
              }
            : undefined,
        });
      } catch {
        // ignore schema injection errors
      }
    } else {
      const routeTitles: Record<NavRoute, { title: string; desc: string }> = {
        home: {
          title: 'CeniPluse — Watch Free Movies, TV Series & Anime in HD',
          desc: 'Stream and download trending movies, TV series, anime, and Nollywood hits in HD on CeniPluse. 100% free streaming with multi-server mirrors.',
        },
        movies: {
          title: 'Watch Trending Movies & Blockbusters in HD — CeniPluse',
          desc: 'Explore the latest Hollywood, Nollywood, and international movies in 1080p and 4K with multi-server playback on CeniPluse.',
        },
        series: {
          title: 'Stream Popular TV Series, Shows & K-Drama — CeniPluse',
          desc: 'Binge-watch full seasons and episodes of top trending television series, Korean dramas, and English shows free on CeniPluse.',
        },
        animation: {
          title: 'Watch Anime & Animated Series Online Free — CeniPluse',
          desc: 'Stream top Japanese anime series with English Sub & Dub, classic cartoons, and animated movies in HD on CeniPluse.',
        },
        trending: {
          title: 'Most Watched & Trending Today — CeniPluse',
          desc: 'Discover the most popular movies and TV series trending worldwide right now on CeniPluse.',
        },
        search: {
          title: 'Search Free Movies, TV Shows, Cast & Genres — CeniPluse',
          desc: 'Search our catalog of over 1,000,000 movies, series, anime, and Nollywood hits by title, actor, or genre.',
        },
        watching: {
          title: 'Continue Watching — CeniPluse',
          desc: 'Pick up right where you left off across movies and TV series saved to your CeniPluse account.',
        },
        watchlist: {
          title: 'My Watchlist & Favorites — CeniPluse',
          desc: 'Access your saved movies, TV shows, and bookmarks on CeniPluse.',
        },
        downloads: {
          title: 'Downloads & Offline Mirrors — CeniPluse',
          desc: 'Manage your downloaded movies and offline video files on CeniPluse.',
        },
        admin: {
          title: 'Admin Publishing Studio — CeniPluse',
          desc: 'CeniPluse Content Management and Stream Publishing Dashboard.',
        },
      };
      const meta = routeTitles[activeRoute] || routeTitles.home;
      document.title = meta.title;
      setMetaTag('meta[name="description"]', 'content', meta.desc);
      setMetaTag('meta[property="og:title"]', 'content', meta.title);
      setMetaTag('meta[property="og:description"]', 'content', meta.desc);
      setMetaTag('meta[property="og:url"]', 'content', `https://www.cenipluse.xyz/${activeRoute === 'home' ? '' : `?view=${activeRoute}`}`);
      setMetaTag('link[rel="canonical"]', 'href', `https://www.cenipluse.xyz/${activeRoute === 'home' ? '' : `?view=${activeRoute}`}`);
      const mediaScript = document.getElementById('media-jsonld');
      if (mediaScript) mediaScript.remove();
    }
  }, [activeRoute, searchQuery, filters, selectedMedia, directoryHeading, directoryTypeFilter]);

  // Browser Back / Forward navigation support
  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const next = readUrlState();
      const params = new URLSearchParams(window.location.search);
      const state = event.state as HistoryNavState | null;
      const titleId = params.get('title');
      const restoredHeading = state?.cpNav ? state.heading || '' : '';
      const restoredTypeFilter: HistoryNavState['typeFilter'] = state?.cpNav
        ? state.typeFilter || 'all'
        : next.route === 'series'
        ? 'series'
        : next.route === 'animation'
        ? 'animation'
        : 'all';

      // Mark the restored entry as "current" so the URL sync effect replaces instead of pushing
      lastNavKeyRef.current = `${next.route}|${titleId || ''}|${restoredHeading}|${restoredTypeFilter}`;
      pendingScrollRef.current = state?.cpNav ? state.scrollY || 0 : 0;

      if (titleId) {
        const item = findMediaById(titleId);
        if (item) {
          pendingTitleIdRef.current = null;
          setSelectedMedia((cur) =>
            cur?.item.id === titleId ? cur : { item, autoPlay: Boolean(state?.autoPlay) }
          );
        } else {
          pendingTitleIdRef.current = titleId;
          setSelectedMedia(null);
        }
      } else {
        setSelectedMedia(null);
      }

      setActiveRoute(next.route);
      setSearchQuery(next.q);
      setFilters(next.filters);
      setDirectoryHeading(restoredHeading);
      setDirectoryTypeFilter(restoredTypeFilter);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [userDownloads, setUserDownloads] = useState<DownloadRecord[]>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('cinepulse_user_downloads') || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  });

  const handleRecordDownload = (rec: DownloadRecord) => {
    setUserDownloads((prev) => {
      const next = [rec, ...prev.filter((d) => d.id !== rec.id)].slice(0, 50);
      try {
        localStorage.setItem('cinepulse_user_downloads', JSON.stringify(next));
      } catch {
        // ignore storage quota errors
      }
      return next;
    });
  };

  // Load TMDB + Admin CMS content (Published Releases + Newly Harvested Requestable Drafts)
  const reloadPublicCatalog = async () => {
    const allCms = await backendApi.fetchPublicPublishedCatalog();
    let combined = [...allCms];

    if (allCms.length < 15) {
      const liveTmdb = await backendApi.fetchLiveTmdbCatalog();
      if (liveTmdb.length > 0) {
        const existingTmdbKeys = new Set(
          allCms
            .filter((m) => Boolean(m.tmdbId))
            .map((m) => `${m.type === 'series' ? 'series' : 'movie'}_${m.tmdbId}`)
        );
        const extras = liveTmdb.filter(
          (m) => !existingTmdbKeys.has(`${m.type === 'series' ? 'series' : 'movie'}_${m.tmdbId}`)
        );
        combined = [...allCms, ...extras];
      }
    }

    const readyCms = combined.filter((m) => !m.isDraft && m.sources.length > 0);
    const queuedDrafts = combined.filter((m) => m.isDraft || m.sources.length === 0);
    setPublishedCatalog(readyCms);
    setDraftedCatalog(queuedDrafts);

    const seen = new Set<string>();
    const deduped = combined.filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
    setCatalog(deduped.length ? deduped : INITIAL_CATALOG);
  };

  useEffect(() => {
    let active = true;
    const minSkeletonTimer = setTimeout(() => {
      if (active) setIsHydratingLive(false);
    }, 220);

    reloadPublicCatalog().finally(() => {
      if (active) setIsHydratingLive(false);
    });

    // Keep public website synchronized with the 5-minute background TMDB auto-fetch
    const syncTimer = window.setInterval(() => {
      if (active) reloadPublicCatalog();
    }, 5 * 60 * 1000);

    return () => {
      active = false;
      clearTimeout(minSkeletonTimer);
      window.clearInterval(syncTimer);
    };
  }, []);

  // Prune any orphaned/phantom IDs from Watchlist once live catalog is loaded so count === visible items
  useEffect(() => {
    if (isHydratingLive || catalog.length === 0) return;
    const catalogIds = new Set(catalog.map((m) => m.id));
    setWatchlistIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (catalogIds.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [isHydratingLive, catalog]);

  // Optimistic Watchlist toggle with server sync & rollback on failure (signed-in accounts only)
  const handleToggleWatchlist = (id: string) => {
    if (!accountKey) {
      setActiveModal('signin');
      return;
    }
    let previousSnapshot: Set<string> = new Set();
    setWatchlistIds((prev) => {
      previousSnapshot = new Set(prev);
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

    backendApi.syncWatchlistToggle(id).catch(() => {
      setWatchlistIds(previousSnapshot);
    });

    if (!previousSnapshot.has(id)) {
      const targetItem = catalog.find((m) => m.id === id);
      trackEvent({
        eventType: 'watchlist_add',
        mediaId: id,
        mediaTitle: targetItem?.title,
        mediaType: targetItem?.type,
        mediaPoster: targetItem?.poster,
      });
    }
  };

  // Monetization / Ad Config fetched once for Soft Paywall & Double Ad Banners
  useEffect(() => {
    fetchPublicMonetizationConfig().then((cfg) => {
      if (cfg) setMonetizationConfig(cfg);
    });
  }, []);

  // Track page views & title detail views automatically
  useEffect(() => {
    if (selectedMedia?.item) {
      trackEvent({
        eventType: 'title_view',
        mediaId: selectedMedia.item.id,
        mediaTitle: selectedMedia.item.title,
        mediaType: selectedMedia.item.type,
        mediaPoster: selectedMedia.item.poster,
        pagePath: `title/${selectedMedia.item.id}`,
      });
    } else if (activeRoute !== 'admin') {
      trackEvent({
        eventType: 'page_view',
        pagePath: activeRoute,
      });
    }
  }, [activeRoute, selectedMedia?.item?.id]);

  // In-app "Back" on the detail page: step back through browser history when we came from inside the site
  const handleDetailBack = () => {
    const st = window.history.state as HistoryNavState | null;
    if (st?.cpNav && (st.idx || 0) > 0) {
      window.history.back();
    } else {
      setSelectedMedia(null);
    }
  };

  const handleNavigate = (route: NavRoute) => {
    setSelectedMedia(null);
    setActiveRoute(route);
    if (route !== 'search') setSearchQuery('');
    setDirectoryHeading('');
    setFilters(DEFAULT_FILTERS);
    setActiveCategoryCard('all');
    // Clear appended TMDB pages so stale items from a previous session don't bleed in
    setTmdbAppended({ movie: [], series: [], animation: [] });
    setTmdbPageByBucket({ movie: 1, series: 1, animation: 1 });

    if (route === 'series') setDirectoryTypeFilter('series');
    else if (route === 'animation') setDirectoryTypeFilter('animation');
    else if (route === 'trending') {
      setDirectoryTypeFilter('all');
      setFilters({ ...DEFAULT_FILTERS, sortBy: 'Hottest' });
    } else {
      setDirectoryTypeFilter('all');
    }
    window.scrollTo(0, 0);
  };

  const moviesGridRef = useRef<HTMLDivElement>(null);
  const [tmdbPageByBucket, setTmdbPageByBucket] = useState<Record<string, number>>({
    movie: 1,
    series: 1,
    animation: 1,
  });
  const [loadingMoreCatalog, setLoadingMoreCatalog] = useState(false);
  const [isFilteringLive, setIsFilteringLive] = useState(false);

  // Auto-fetch page 1 from TMDB Discover whenever filters change on a browse view
  useEffect(() => {
    const bucket: 'movie' | 'series' | 'animation' | null =
      activeRoute === 'movies'
        ? 'movie'
        : activeRoute === 'series'
        ? 'series'
        : activeRoute === 'animation'
        ? 'animation'
        : null;

    if (!bucket) return;

    const hasActiveFilters =
      filters.genre !== 'All' ||
      filters.country !== 'All' ||
      filters.year !== 'All' ||
      filters.sortBy !== 'For You';

    // Reset pagination to page 1 for this bucket whenever filters change
    setTmdbPageByBucket((prev) => ({ ...prev, [bucket]: 1 }));
    setTmdbAppended((prev) => ({ ...prev, [bucket]: [] }));

    if (!hasActiveFilters) {
      setIsFilteringLive(false);
      return;
    }

    const controller = new AbortController();
    setIsFilteringLive(true);

    const timer = setTimeout(async () => {
      try {
        const tmdbType: 'movie' | 'tv' = bucket === 'series' ? 'tv' : 'movie';
        const effectiveGenre =
          bucket === 'animation'
            ? 'Animation'
            : filters.genre !== 'All'
            ? filters.genre
            : undefined;

        const res = await backendApi.discoverTmdbPage({
          type: tmdbType,
          page: 1,
          genre: effectiveGenre,
          country: filters.country !== 'All' ? filters.country : undefined,
          year: filters.year !== 'All' ? filters.year : undefined,
          sortBy: filters.sortBy,
        });

        if (!controller.signal.aborted) {
          setTmdbAppended((prev) => ({ ...prev, [bucket]: res.items || [] }));
          setTmdbPageByBucket((prev) => ({ ...prev, [bucket]: 1 }));
        }
      } catch (err) {
        console.warn('Failed to load TMDB filtered items:', err);
      } finally {
        if (!controller.signal.aborted) {
          setIsFilteringLive(false);
        }
      }
    }, 150);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [activeRoute, filters]);

  const handleLoadMoreFromTmdb = async (bucket: 'movie' | 'series' | 'animation') => {
    if (loadingMoreCatalog || isFilteringLive) return;
    setLoadingMoreCatalog(true);
    try {
      const nextPage = (tmdbPageByBucket[bucket] || 1) + 1;
      const tmdbType: 'movie' | 'tv' = bucket === 'series' ? 'tv' : 'movie';
      const effectiveGenre =
        bucket === 'animation'
          ? 'Animation'
          : filters.genre !== 'All'
          ? filters.genre
          : undefined;
      const res = await backendApi.discoverTmdbPage({
        type: tmdbType,
        page: nextPage,
        genre: effectiveGenre,
        country: filters.country !== 'All' ? filters.country : undefined,
        year: filters.year !== 'All' ? filters.year : undefined,
        sortBy: filters.sortBy,
      });
      if (res.items.length > 0) {
        // Collect all existing IDs (catalog + already-appended) to dedupe
        setTmdbAppended((prev) => {
          const current = prev[bucket] || [];
          const currentIds = new Set(current.map((m) => m.id));
          const fresh = res.items.filter((m) => !currentIds.has(m.id));
          if (fresh.length === 0) return prev;
          return { ...prev, [bucket]: [...current, ...fresh] };
        });
        setTmdbPageByBucket((prev) => ({ ...prev, [bucket]: nextPage }));
      }
    } finally {
      setLoadingMoreCatalog(false);
    }
  };

  const openDirectoryWith = (
    heading: string,
    typeFilter: 'all' | 'movie' | 'series' | 'animation',
    patch: Partial<FilterState> = {}
  ) => {
    setDirectoryHeading(heading);
    setDirectoryTypeFilter(typeFilter);
    setFilters({ ...DEFAULT_FILTERS, ...patch });

    if (typeFilter === 'movie') {
      setActiveRoute('movies');
      window.setTimeout(() => {
        moviesGridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    } else if (typeFilter === 'animation') {
      setActiveRoute('animation');
      window.scrollTo(0, 0);
    } else {
      setActiveRoute('series');
      window.scrollTo(0, 0);
    }
  };

  const handleSelectCategoryCard = (card: CategoryCardItem) => {
    setActiveCategoryCard(card.id);

    // Map category IDs to their directory type
    const animationCategories = ['anime', 'cartoon', 'animation'];
    const seriesCategories = ['kdrama'];
    const targetType = animationCategories.includes(card.id)
      ? 'animation'
      : seriesCategories.includes(card.id)
      ? 'series'
      : card.id === 'all'
      ? 'movie'
      : 'all';

    if (activeRoute === 'movies') {
      // Stay on Movies page — filter & scroll smoothly to the Browse Movies grid below
      const isAnimCat = animationCategories.includes(card.id);
      setDirectoryHeading(card.id === 'all' ? 'All Movies' : `${card.label} Movies`);
      setDirectoryTypeFilter(isAnimCat ? 'animation' : 'movie');
      setFilters(
        card.id === 'all' ? DEFAULT_FILTERS : { ...DEFAULT_FILTERS, ...card.filterPatch }
      );
      window.setTimeout(() => {
        moviesGridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
      return;
    }

    // Always navigate to the best directory for the category
    const label =
      card.id === 'all'
        ? 'Explore All'
        : card.id === 'kdrama'
        ? 'K-Drama & Korean Series'
        : card.id === 'anime'
        ? 'Anime'
        : card.id === 'cartoon'
        ? 'Cartoons & Animation'
        : card.label;

    openDirectoryWith(label, targetType, card.filterPatch);
  };

  const popularSeries = useMemo(
    () => sortItems(catalog.filter((m) => m.type === 'series'), 'Hottest'),
    [catalog]
  );
  const trendingSeries = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return [...catalog.filter((m) => m.type === 'series')].sort((a, b) => {
      const aRecent = a.year >= currentYear - 2 ? 1 : 0;
      const bRecent = b.year >= currentYear - 2 ? 1 : 0;
      return (
        bRecent - aRecent ||
        Number(Boolean(b.trending)) - Number(Boolean(a.trending)) ||
        b.views - a.views ||
        b.rating - a.rating
      );
    });
  }, [catalog]);
  const trendingMovies = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return [...catalog.filter((m) => m.type === 'movie')].sort((a, b) => {
      const aRecent = a.year >= currentYear - 2 ? 1 : 0;
      const bRecent = b.year >= currentYear - 2 ? 1 : 0;
      return (
        bRecent - aRecent ||
        Number(Boolean(b.trending)) - Number(Boolean(a.trending)) ||
        b.views - a.views ||
        b.rating - a.rating
      );
    });
  }, [catalog]);
  const topTenMovies = useMemo(() => trendingMovies.slice(0, 10), [trendingMovies]);
  const regionalNollywood = useMemo(
    () => catalog.filter((m) => m.country === 'Nigeria' || m.regionTag === 'Nollywood'),
    [catalog]
  );
  const animationItems = useMemo(
    () => catalog.filter((m) => m.type === 'animation' || matchGenre(m.genres, 'Animation')),
    [catalog]
  );
  const topRatedAll = useMemo(() => sortItems(catalog, 'Top Rated').slice(0, 14), [catalog]);

  // ── NEW genre-specific rails ──
  const kdramaItems = useMemo(
    () => catalog.filter((m) => m.country === 'South Korea' || m.regionTag === 'K-Drama'),
    [catalog]
  );
  const bollywoodItems = useMemo(
    () => catalog.filter((m) => m.country === 'India' || m.regionTag === 'Bollywood'),
    [catalog]
  );
  const actionItems = useMemo(
    () => sortItems(catalog.filter((m) => matchGenre(m.genres, 'Action')), 'Hottest'),
    [catalog]
  );
  const romanceItems = useMemo(
    () => sortItems(catalog.filter((m) => matchGenre(m.genres, 'Romance')), 'Hottest'),
    [catalog]
  );
  const horrorItems = useMemo(
    () => sortItems(catalog.filter((m) => matchGenre(m.genres, 'Horror')), 'Hottest'),
    [catalog]
  );
  const comedyItems = useMemo(
    () => sortItems(catalog.filter((m) => matchGenre(m.genres, 'Comedy')), 'Hottest'),
    [catalog]
  );
  const scifiItems = useMemo(
    () => sortItems(catalog.filter((m) => matchGenre(m.genres, 'Sci-Fi') || matchGenre(m.genres, 'Fantasy')), 'Hottest'),
    [catalog]
  );
  const documentaryItems = useMemo(
    () => sortItems(catalog.filter((m) => matchGenre(m.genres, 'Documentary')), 'Hottest'),
    [catalog]
  );

  const spotlightMovies = useMemo(() => {
    const base = catalog.filter((m) => m.type === 'movie');
    return sortItems(
      base.filter((m) => matchesFilters(m, filters)),
      filters.sortBy
    );
  }, [catalog, filters]);

  // Always showcase NEW, TRENDING & MOST-WATCHED movies/series in the top Hero Carousel (no old classics)
  const heroPool = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const minHeroYear = currentYear - 2;
    const scoreForHero = (m: MediaItem) => {
      const isNew = m.year >= minHeroYear ? 1 : 0;
      const isTrending = m.trending ? 1 : 0;
      return (
        isNew * 1_000_000 +
        isTrending * 200_000 +
        Math.min(m.views, 500_000) +
        Math.round(m.rating * 10_000) +
        m.year * 100
      );
    };
    const withBackdrop = catalog.filter((m) => Boolean(m.backdrop));
    const recent = withBackdrop.filter((m) => m.year >= minHeroYear);
    const pool = (recent.length >= 6 ? recent : withBackdrop).sort(
      (a, b) => scoreForHero(b) - scoreForHero(a)
    );
    return (pool.length ? pool : catalog).slice(0, 6);
  }, [catalog]);

  const movieHeroPool = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const minHeroYear = currentYear - 2;
    const moviesWithBackdrop = catalog.filter((m) => m.type === 'movie' && Boolean(m.backdrop));
    const recent = moviesWithBackdrop.filter((m) => m.year >= minHeroYear);
    const pool = (recent.length >= 4 ? recent : moviesWithBackdrop).sort(
      (a, b) =>
        b.year - a.year ||
        Number(Boolean(b.trending)) - Number(Boolean(a.trending)) ||
        b.views - a.views ||
        b.rating - a.rating
    );
    return (pool.length ? pool : heroPool).slice(0, 6);
  }, [catalog, heroPool]);

  const directoryItems = useMemo(() => {
    const base =
      directoryTypeFilter === 'all'
        ? catalog
        : catalog.filter((m) =>
            directoryTypeFilter === 'animation'
              ? m.type === 'animation' || matchGenre(m.genres, 'Animation')
              : m.type === directoryTypeFilter
          );
    return sortItems(
      base.filter((m) => matchesFilters(m, filters)),
      filters.sortBy
    );
  }, [catalog, directoryTypeFilter, filters]);

  const watchlistItems = useMemo(
    () => catalog.filter((m) => watchlistIds.has(m.id)),
    [catalog, watchlistIds]
  );

  const topTenItems = useMemo(
    () => sortItems(catalog, 'Hottest').slice(0, 10),
    [catalog]
  );

  const continueWatchingEntries = useMemo(() => {
    if (!isSignedIn) return [];
    const playableCatalog = catalog.filter((m) => m.sources.length > 0 || hasVidLinkSupport(m));
    return Object.values(watchProgressMap)
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
      .map((progress) => {
        const item = playableCatalog.find((m) => m.id === progress.mediaId);
        return item ? { item, progress } : null;
      })
      .filter((x): x is { item: MediaItem; progress: WatchProgressEntry } => Boolean(x));
  }, [catalog, watchProgressMap, isSignedIn]);

  const renderPage = () => {
    if (isHydratingLive) {
      return (
        <div>
          <HeroSkeleton />
          <RailSkeleton />
          <RailSkeleton />
          <GridSkeleton count={6} />
        </div>
      );
    }

    // 1. HOME VIEW — Above-the-Fold Featured Hero Spotlight (Mobile 4:5 Card & Desktop Widescreen) + Stacked Content Rails
    if (activeRoute === 'home') {
      return (
        <div>
          <HeroCarousel
            items={heroPool}
            watchlistIds={watchlistIds}
            onPlay={handlePlayItem}
            onSelect={(item) => setSelectedMedia({ item, autoPlay: false })}
            onToggleWatchlist={handleToggleWatchlist}
          />

          <div className="w-full md:px-6 lg:px-8">
            <SpotlightMiniRail
              items={trendingMovies.slice(0, 10)}
              onPlay={handlePlayItem}
              onSelect={(item) => setSelectedMedia({ item, autoPlay: false })}
            />

            <CategoryCards
              cards={CATEGORY_CARDS}
              activeCategoryId={activeCategoryCard}
              onSelectCategory={handleSelectCategoryCard}
            />

            {/* CONTINUE WATCHING RAIL (16:9 Progress Cards with 1-Tap Resume & Glowing Progress Bar) */}
            <ContinueWatchingRail
              entries={continueWatchingEntries}
              onResume={handlePlayItem}
              onSelect={(item) => setSelectedMedia({ item, autoPlay: false })}
              onRemove={handleRemoveContinueWatching}
            />

          {/* SIGNATURE TOP 10 ON CENIPLUSE TODAY RANKED RAIL (Oversized Outlined Numerals 1–10) */}
          <TopTenRail
            items={topTenItems}
            watchlistIds={watchlistIds}
            onPlay={handlePlayItem}
            onSelect={(item) => setSelectedMedia({ item, autoPlay: false })}
            onToggleWatchlist={handleToggleWatchlist}
          />

          <AdSlot
            config={monetizationConfig}
            premiumPlan={premiumPlan}
            hasActiveSubscription={hasActiveSubscription}
            slot="home"
            placement="home_mid"
            onOpenPremium={() => setActiveModal('pro')}
          />

          {/* 1) ADMIN-PUBLISHED LIVE MOVIES & SERIES (Playable right now) */}
          {publishedCatalog.length > 0 && (
            <ContentRail
              title="Featured Releases (Published Live)"
              items={publishedCatalog.slice(0, 18)}
              watchlistIds={watchlistIds}
              onMore={() =>
                openDirectoryWith('Featured Releases', 'all', {
                  sortBy: 'Latest',
                })
              }
              onPlay={handlePlayItem}
              onSelect={(item) => setSelectedMedia({ item, autoPlay: false })}
              onToggleWatchlist={handleToggleWatchlist}
            />
          )}

          {/* 1B) NEWLY ADDED MOVIES & SERIES */}
          {draftedCatalog.length > 0 && (
            <ContentRail
              title="New & Trending"
              items={draftedCatalog.slice(0, 18)}
              watchlistIds={watchlistIds}
              onMore={() =>
                openDirectoryWith('All Newly Added Releases', 'all', {
                  sortBy: 'Latest',
                })
              }
              onPlay={handlePlayItem}
              onSelect={(item) => setSelectedMedia({ item, autoPlay: false })}
              onToggleWatchlist={handleToggleWatchlist}
            />
          )}

          <ContentRail
            title="Trending Movies"
            items={trendingMovies.slice(0, 18)}
            watchlistIds={watchlistIds}
            onMore={() => openDirectoryWith('Trending Movies', 'movie', { sortBy: 'Hottest' })}
            onPlay={handlePlayItem}
            onSelect={(item) => setSelectedMedia({ item, autoPlay: false })}
            onToggleWatchlist={handleToggleWatchlist}
          />

          <ContentRail
            title="Trending Series"
            items={trendingSeries.slice(0, 18)}
            watchlistIds={watchlistIds}
            onMore={() => openDirectoryWith('Trending Series', 'series', { sortBy: 'Hottest' })}
            onPlay={handlePlayItem}
            onSelect={(item) => setSelectedMedia({ item, autoPlay: false })}
            onToggleWatchlist={handleToggleWatchlist}
          />

          <ContentRail
            title="Popular Series"
            items={popularSeries.slice(0, 18)}
            watchlistIds={watchlistIds}
            onMore={() => openDirectoryWith('All Series', 'series', { sortBy: 'Hottest' })}
            onPlay={handlePlayItem}
            onSelect={(item) => setSelectedMedia({ item, autoPlay: false })}
            onToggleWatchlist={handleToggleWatchlist}
          />

          <ContentRail
            title="Regional Hits — Nollywood"
            items={regionalNollywood.slice(0, 18)}
            watchlistIds={watchlistIds}
            onMore={() =>
              openDirectoryWith('Nollywood & African Cinema', 'all', { country: 'Nigeria' })
            }
            onPlay={(item) => setSelectedMedia({ item, autoPlay: true })}
            onSelect={(item) => setSelectedMedia({ item, autoPlay: false })}
            onToggleWatchlist={handleToggleWatchlist}
          />

          <ContentRail
            title="Animation, Cartoons & Anime"
            items={animationItems.slice(0, 18)}
            watchlistIds={watchlistIds}
            onMore={() => openDirectoryWith('Animation, Cartoons & Anime', 'animation')}
            onPlay={(item) => setSelectedMedia({ item, autoPlay: true })}
            onSelect={(item) => setSelectedMedia({ item, autoPlay: false })}
            onToggleWatchlist={handleToggleWatchlist}
          />

          <ContentRail
            title="Top Rated"
            items={topRatedAll.slice(0, 18)}
            watchlistIds={watchlistIds}
            onMore={() => openDirectoryWith('Top Rated Cinema', 'all', { sortBy: 'Top Rated' })}
            onPlay={(item) => setSelectedMedia({ item, autoPlay: true })}
            onSelect={(item) => setSelectedMedia({ item, autoPlay: false })}
            onToggleWatchlist={handleToggleWatchlist}
          />

          {kdramaItems.length > 0 && (
            <ContentRail
              title="K-Drama & Korean Series"
              items={kdramaItems.slice(0, 18)}
              watchlistIds={watchlistIds}
              onMore={() =>
                openDirectoryWith('K-Drama & Korean Series', 'series', { country: 'South Korea' })
              }
              onPlay={(item) => setSelectedMedia({ item, autoPlay: true })}
              onSelect={(item) => setSelectedMedia({ item, autoPlay: false })}
              onToggleWatchlist={handleToggleWatchlist}
            />
          )}

          {bollywoodItems.length > 0 && (
            <ContentRail
              title="Bollywood — Indian Cinema"
              items={bollywoodItems.slice(0, 18)}
              watchlistIds={watchlistIds}
              onMore={() =>
                openDirectoryWith('Bollywood & Indian Cinema', 'all', { country: 'India' })
              }
              onPlay={(item) => setSelectedMedia({ item, autoPlay: true })}
              onSelect={(item) => setSelectedMedia({ item, autoPlay: false })}
              onToggleWatchlist={handleToggleWatchlist}
            />
          )}

          {actionItems.length > 0 && (
            <ContentRail
              title="Action & Adventure"
              items={actionItems.slice(0, 18)}
              watchlistIds={watchlistIds}
              onMore={() =>
                openDirectoryWith('Action & Adventure', 'all', { genre: 'Action' })
              }
              onPlay={(item) => setSelectedMedia({ item, autoPlay: true })}
              onSelect={(item) => setSelectedMedia({ item, autoPlay: false })}
              onToggleWatchlist={handleToggleWatchlist}
            />
          )}

          {romanceItems.length > 0 && (
            <ContentRail
              title="Romance & Love Stories"
              items={romanceItems.slice(0, 18)}
              watchlistIds={watchlistIds}
              onMore={() =>
                openDirectoryWith('Romance & Love Stories', 'all', { genre: 'Romance' })
              }
              onPlay={(item) => setSelectedMedia({ item, autoPlay: true })}
              onSelect={(item) => setSelectedMedia({ item, autoPlay: false })}
              onToggleWatchlist={handleToggleWatchlist}
            />
          )}

          {horrorItems.length > 0 && (
            <ContentRail
              title="Horror & Thriller"
              items={horrorItems.slice(0, 18)}
              watchlistIds={watchlistIds}
              onMore={() =>
                openDirectoryWith('Horror & Thriller', 'all', { genre: 'Horror' })
              }
              onPlay={(item) => setSelectedMedia({ item, autoPlay: true })}
              onSelect={(item) => setSelectedMedia({ item, autoPlay: false })}
              onToggleWatchlist={handleToggleWatchlist}
            />
          )}

          {comedyItems.length > 0 && (
            <ContentRail
              title="Comedy & Feel-Good"
              items={comedyItems.slice(0, 18)}
              watchlistIds={watchlistIds}
              onMore={() =>
                openDirectoryWith('Comedy Cinema', 'all', { genre: 'Comedy' })
              }
              onPlay={(item) => setSelectedMedia({ item, autoPlay: true })}
              onSelect={(item) => setSelectedMedia({ item, autoPlay: false })}
              onToggleWatchlist={handleToggleWatchlist}
            />
          )}

          {scifiItems.length > 0 && (
            <ContentRail
              title="Sci-Fi & Fantasy"
              items={scifiItems.slice(0, 18)}
              watchlistIds={watchlistIds}
              onMore={() =>
                openDirectoryWith('Sci-Fi & Fantasy', 'all', { genre: 'Sci-Fi' })
              }
              onPlay={(item) => setSelectedMedia({ item, autoPlay: true })}
              onSelect={(item) => setSelectedMedia({ item, autoPlay: false })}
              onToggleWatchlist={handleToggleWatchlist}
            />
          )}

          {documentaryItems.length > 0 && (
            <ContentRail
              title="Documentaries & Real Stories"
              items={documentaryItems.slice(0, 18)}
              watchlistIds={watchlistIds}
              onMore={() =>
                openDirectoryWith('Documentaries', 'all', { genre: 'Documentary' })
              }
              onPlay={(item) => setSelectedMedia({ item, autoPlay: true })}
              onSelect={(item) => setSelectedMedia({ item, autoPlay: false })}
              onToggleWatchlist={handleToggleWatchlist}
            />
          )}
          </div>
        </div>
      );
    }

    // 2. MOVIES SPOTLIGHT & FULL FLOWING MOVIES GRID VIEW
    if (activeRoute === 'movies') {
      const actionMovies = trendingMovies.filter((m) => matchGenre(m.genres, 'Action'));
      const thrillerHorror = trendingMovies.filter(
        (m) => matchGenre(m.genres, 'Horror') || matchGenre(m.genres, 'Thriller')
      );
      const comedyMovies = trendingMovies.filter((m) => matchGenre(m.genres, 'Comedy'));
      const scifiMovies = trendingMovies.filter(
        (m) => matchGenre(m.genres, 'Sci-Fi') || matchGenre(m.genres, 'Fantasy')
      );

      return (
        <div>
          {/* Movies Page Header — distinct from Home, no hero carousel */}
          <div className="px-5 sm:px-6 md:px-0 pt-4 pb-3">
            <h1 className="text-2xl sm:text-3xl font-black text-[#F8FAFC] tracking-tight">Movies</h1>
            <p className="text-sm text-[#94A3B8] mt-1">Browse &amp; discover films across every genre</p>
          </div>

          <div className="w-full md:px-6 lg:px-8">
            <CategoryCards
              cards={CATEGORY_CARDS}
              activeCategoryId={activeCategoryCard}
              onSelectCategory={handleSelectCategoryCard}
            />

            {/* TOP 10 MOVIES TODAY */}
            <TopTenRail
              title="Top 10 Movies Today"
              subtitle="Most watched & trending films right now"
              items={topTenMovies}
              watchlistIds={watchlistIds}
              onPlay={handlePlayItem}
              onSelect={(item) => setSelectedMedia({ item, autoPlay: false })}
              onToggleWatchlist={handleToggleWatchlist}
            />

            <ContentRail
              title="Trending Movies"
              items={trendingMovies.slice(0, 20)}
              watchlistIds={watchlistIds}
              onMore={() => openDirectoryWith('Trending Movies', 'movie', { sortBy: 'Hottest' })}
              onPlay={handlePlayItem}
              onSelect={(item) => setSelectedMedia({ item, autoPlay: false })}
              onToggleWatchlist={handleToggleWatchlist}
            />

            {actionMovies.length > 0 && (
              <ContentRail
                title="Action Movies"
                items={actionMovies.slice(0, 20)}
                watchlistIds={watchlistIds}
                onMore={() => openDirectoryWith('Action Movies', 'movie', { genre: 'Action' })}
                onPlay={handlePlayItem}
                onSelect={(item) => setSelectedMedia({ item, autoPlay: false })}
                onToggleWatchlist={handleToggleWatchlist}
              />
            )}

            {thrillerHorror.length > 0 && (
              <ContentRail
                title="Horror & Thriller"
                items={thrillerHorror.slice(0, 20)}
                watchlistIds={watchlistIds}
                onMore={() =>
                  openDirectoryWith('Horror & Thriller Movies', 'movie', { genre: 'Thriller' })
                }
                onPlay={handlePlayItem}
                onSelect={(item) => setSelectedMedia({ item, autoPlay: false })}
                onToggleWatchlist={handleToggleWatchlist}
              />
            )}

            {comedyMovies.length > 0 && (
              <ContentRail
                title="Comedy Movies"
                items={comedyMovies.slice(0, 20)}
                watchlistIds={watchlistIds}
                onMore={() => openDirectoryWith('Comedy Movies', 'movie', { genre: 'Comedy' })}
                onPlay={handlePlayItem}
                onSelect={(item) => setSelectedMedia({ item, autoPlay: false })}
                onToggleWatchlist={handleToggleWatchlist}
              />
            )}

            {scifiMovies.length > 0 && (
              <ContentRail
                title="Sci-Fi & Fantasy"
                items={scifiMovies.slice(0, 20)}
                watchlistIds={watchlistIds}
                onMore={() => openDirectoryWith('Sci-Fi & Fantasy Movies', 'movie', { genre: 'Sci-Fi' })}
                onPlay={handlePlayItem}
                onSelect={(item) => setSelectedMedia({ item, autoPlay: false })}
                onToggleWatchlist={handleToggleWatchlist}
              />
            )}

            {/* FULL FLOWING MOVIES GRID BELOW (Just like Animation — scroll down to explore all movies) */}
            <div ref={moviesGridRef} className="pt-4 scroll-mt-20">
              <FilterMatrix
                filters={filters}
                onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
                onReset={() => {
                  setFilters(DEFAULT_FILTERS);
                  setDirectoryHeading('');
                  setActiveCategoryCard('all');
                }}
              />

              {(() => {
                const rawAppended = tmdbAppended['movie'] || [];
                const seenIds = new Set(spotlightMovies.map((m) => m.id));
                const freshAppended = rawAppended.filter((m) => !seenIds.has(m.id));
                const allMovieItems = [...spotlightMovies, ...freshAppended];

                return (
                  <>
                    <div className="flex items-center justify-between px-4 md:px-0 mb-3 md:mb-4">
                      <h2 className="text-base md:text-xl font-extrabold text-[#F8FAFC]">
                        {directoryHeading || 'Explore All Movies'}
                      </h2>
                      <span className="text-xs font-semibold text-[#94A3B8] tabular-nums">
                        {allMovieItems.length} movies loaded
                      </span>
                    </div>

                    {isFilteringLive && allMovieItems.length === 0 ? (
                      <GridSkeleton count={12} />
                    ) : allMovieItems.length > 0 ? (
                      <div className="grid grid-cols-3 gap-2 px-2 sm:grid-cols-3 sm:gap-3 sm:px-4 md:px-0 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 min-[1920px]:grid-cols-9 md:gap-4">
                        {allMovieItems.map((item) => (
                          <PosterCard
                            key={item.id}
                            item={item}
                            showCast
                            showDirectoryBadges
                            inWatchlist={watchlistIds.has(item.id)}
                            onPlay={handlePlayItem}
                            onSelect={(m) => setSelectedMedia({ item: m, autoPlay: false })}
                            onToggleWatchlist={handleToggleWatchlist}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="mx-4 md:mx-0 rounded-2xl bg-[#141821] border border-white/[0.06] py-12 text-center space-y-3">
                        <p className="text-sm text-[#94A3B8]">
                          No movies matched your current filter selection.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setFilters(DEFAULT_FILTERS);
                            setDirectoryHeading('');
                            setActiveCategoryCard('all');
                          }}
                          className="px-4 py-2 rounded-full bg-[#00E5FF] text-[#071018] text-xs font-extrabold"
                        >
                          Reset Filters
                        </button>
                      </div>
                    )}
                  </>
                );
              })()}

              <InfiniteSentinel
                onIntersect={() => handleLoadMoreFromTmdb('movie')}
                isLoading={loadingMoreCatalog}
              />
            </div>
          </div>
        </div>
      );
    }

    // 3. DEDICATED MOBILE SEARCH VIEW
    if (activeRoute === 'search') {
      return (
        <MobileSearchView
          catalog={catalog}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          watchlistIds={watchlistIds}
          onPlay={(item) => setSelectedMedia({ item, autoPlay: true })}
          onSelect={(item) => setSelectedMedia({ item, autoPlay: false })}
          onToggleWatchlist={handleToggleWatchlist}
        />
      );
    }

    // 3A. ADMIN PUBLISHING STUDIO (with integrated User Requests Dashboard)
    if (activeRoute === 'admin') {
      return (
        <ErrorBoundary fallbackTitle="Admin Studio encountered an error">
          <Suspense fallback={<GridSkeleton count={8} />}>
            <AdminPortalView
              userEmail={userEmail}
              onRequireAuth={() => setActiveModal('signin')}
              onSignOut={async () => {
                await signOutSupabase().catch(() => {});
                setUserProfile(null);
                setUserEmail(null);
              }}
              onBackHome={() => handleNavigate('home')}
              onCatalogChanged={() => {
                reloadPublicCatalog();
              }}
              onPreviewMedia={(item) => setSelectedMedia({ item, autoPlay: true })}
            />
          </Suspense>
        </ErrorBoundary>
      );
    }

    // 4A. RANKED TRENDING MOVIES VIEW (4-Column Numbered Leaderboard + Category Filters)
    if (activeRoute === 'trending') {
      return (
        <TrendingRankedView
          catalog={catalog}
          watchlistIds={watchlistIds}
          onBackHome={() => handleNavigate('home')}
          onPlay={(item) => handlePlayItem(item)}
          onSelect={(item) => setSelectedMedia({ item, autoPlay: false })}
          onToggleWatchlist={handleToggleWatchlist}
        />
      );
    }

    // 4B. BROWSE & FILTER DIRECTORY VIEW (3-column crisp mobile grid + bottom-sheet filter chips)
    if (activeRoute === 'series' || activeRoute === 'animation') {
      const heading =
        directoryHeading ||
        (activeRoute === 'animation'
          ? 'Animation & Anime'
          : 'TV Series & Shows');

      const bucketKey = activeRoute === 'animation' ? 'animation' : 'series';
      const rawAppended = tmdbAppended[bucketKey] || [];
      const seenIds = new Set(directoryItems.map((m) => m.id));
      const freshAppended = rawAppended.filter((m) => !seenIds.has(m.id));
      const allDirectoryItems = [...directoryItems, ...freshAppended];

      return (
        <div>
          <FilterMatrix
            filters={filters}
            onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
            onReset={() => setFilters(DEFAULT_FILTERS)}
          />

          <div className="flex items-center justify-between px-4 md:px-0 mb-3 md:mb-4">
            <h1 className="text-base md:text-xl font-extrabold text-[#F8FAFC]">{heading}</h1>
            <span className="text-xs font-semibold text-[#94A3B8] tabular-nums">
              {allDirectoryItems.length} titles
            </span>
          </div>

          {isFilteringLive && allDirectoryItems.length === 0 ? (
            <GridSkeleton count={12} />
          ) : allDirectoryItems.length > 0 ? (
            <>
              <div className="grid grid-cols-3 gap-2 px-2 sm:grid-cols-3 sm:gap-3 sm:px-4 md:px-0 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 min-[1920px]:grid-cols-9 md:gap-4">
                {allDirectoryItems.map((item) => (
                  <PosterCard
                    key={item.id}
                    item={item}
                    showCast
                    showDirectoryBadges
                    inWatchlist={watchlistIds.has(item.id)}
                    onPlay={handlePlayItem}
                    onSelect={(m) => setSelectedMedia({ item: m, autoPlay: false })}
                    onToggleWatchlist={handleToggleWatchlist}
                  />
                ))}
              </div>

              <InfiniteSentinel
                onIntersect={() =>
                  handleLoadMoreFromTmdb(activeRoute === 'animation' ? 'animation' : 'series')
                }
                isLoading={loadingMoreCatalog}
              />
            </>
          ) : (
            <div className="mx-4 md:mx-0 rounded-2xl bg-[#141821] border border-white/[0.06] py-14 px-6 text-center">
              <p className="text-base font-bold text-[#F8FAFC]">No matching titles found</p>
              <p className="text-xs text-[#94A3B8] mt-1 mb-4">
                Try relaxing your Genre, Country, Year, or Language filters.
              </p>
              <button
                type="button"
                onClick={() => setFilters(DEFAULT_FILTERS)}
                className="min-h-[44px] px-6 rounded-full bg-[#00E5FF] text-[#071018] text-xs font-extrabold"
              >
                Reset All Filters
              </button>
            </div>
          )}
        </div>
      );
    }

    // 4B. WATCHING VIEW (Account-gated Continue Watching history)
    if (activeRoute === 'watching') {
      return (
        <div className="px-4 md:px-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-lg md:text-xl font-extrabold text-[#F8FAFC] flex items-center gap-2">
                <PlayCircle className="w-5 h-5 text-[#10B981]" />
                Watching
              </h1>
              <p className="text-xs text-[#94A3B8] mt-0.5">
                {isSignedIn
                  ? `${continueWatchingEntries.length} ${continueWatchingEntries.length === 1 ? 'title' : 'titles'} in progress on your account`
                  : 'Sign in to track what you are watching and resume anytime'}
              </p>
            </div>
          </div>

          {!isSignedIn ? (
            <div className="rounded-2xl bg-[#141821] border border-white/[0.06] py-14 px-6 text-center max-w-lg mx-auto">
              <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-[#10B981]/10 border border-[#10B981]/25 flex items-center justify-center">
                <LogIn className="w-6 h-6 text-[#10B981]" />
              </div>
              <p className="text-base font-bold text-[#F8FAFC]">Sign in to track what you&apos;re watching</p>
              <p className="text-xs text-[#94A3B8] mt-1.5 mb-5 max-w-sm mx-auto">
                Watch history and resume progress are tied to your CeniPluse account so you can pick up right where you left off.
              </p>
              <button
                type="button"
                onClick={() => setActiveModal('signin')}
                className="min-h-[44px] px-6 rounded-full bg-[#00E5FF] hover:bg-[#33ECFF] text-[#071018] text-xs font-extrabold transition-colors"
              >
                Sign In / Create Account
              </button>
            </div>
          ) : continueWatchingEntries.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {continueWatchingEntries.map(({ item, progress }) => {
                const pct =
                  progress.durationSec > 0
                    ? Math.min(96, Math.max(4, Math.round((progress.positionSec / progress.durationSec) * 100)))
                    : 15;
                const remainingMin = Math.max(
                  1,
                  Math.round(Math.max(0, progress.durationSec - progress.positionSec) / 60)
                );
                const epTag =
                  item.type === 'series' && progress.seasonNumber && progress.episodeNumber
                    ? `S${progress.seasonNumber} E${progress.episodeNumber}`
                    : `${item.year}`;
                return (
                  <div
                    key={item.id}
                    className="group relative rounded-2xl bg-[#141821] border border-white/[0.08] hover:border-[#00E5FF]/40 overflow-hidden transition-all"
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => handlePlayItem(item)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handlePlayItem(item);
                        }
                      }}
                      className="relative aspect-video w-full bg-[#0B0D12] cursor-pointer overflow-hidden"
                    >
                      <img
                        src={item.backdrop || item.poster}
                        alt={item.title}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0B0D12] via-[#0B0D12]/25 to-transparent" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="w-11 h-11 rounded-full bg-[#00E5FF]/90 text-[#071018] flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                          <Play className="w-5 h-5 fill-current ml-0.5" />
                        </span>
                      </div>
                      <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-black/75 border border-white/10 text-[10px] font-bold text-[#F8FAFC]">
                        {epTag}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${item.title} from Watching`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveContinueWatching(item.id);
                        }}
                        className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-black/75 hover:bg-rose-500/90 text-white/80 hover:text-white flex items-center justify-center transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/15">
                        <div
                          className="h-full bg-gradient-to-r from-[#00E5FF] to-[#10B981]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <div className="p-3 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedMedia({ item, autoPlay: false })}
                        className="min-w-0 text-left"
                      >
                        <p className="text-sm font-bold text-[#F8FAFC] truncate hover:text-[#00E5FF] transition-colors">
                          {item.title}
                        </p>
                        <p className="text-[11px] text-[#94A3B8] mt-0.5">
                          {pct}% watched &bull; {remainingMin}m left
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePlayItem(item)}
                        className="shrink-0 px-3 py-1.5 rounded-lg bg-[#00E5FF]/15 hover:bg-[#00E5FF] text-[#00E5FF] hover:text-[#071018] text-[11px] font-extrabold transition-colors"
                      >
                        Resume
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl bg-[#141821] border border-white/[0.06] py-14 px-6 text-center">
              <p className="text-base font-bold text-[#F8FAFC]">Nothing in progress yet</p>
              <p className="text-xs text-[#94A3B8] mt-1 mb-4">
                Start watching any movie or series and it will appear here so you can resume anytime.
              </p>
              <button
                type="button"
                onClick={() => handleNavigate('home')}
                className="min-h-[44px] px-6 rounded-full bg-[#00E5FF] text-[#071018] text-xs font-extrabold"
              >
                Explore Home
              </button>
            </div>
          )}
        </div>
      );
    }

    // 5. WATCHLIST VIEW (Account-gated 3-column mobile grid)
    if (activeRoute === 'watchlist') {
      return (
        <div>
          <div className="flex items-center justify-between px-4 md:px-0 mb-4">
            <div>
              <h1 className="text-lg md:text-xl font-extrabold text-[#F8FAFC] flex items-center gap-2">
                <Bookmark className="w-5 h-5 text-[#00E5FF]" />
                My List
              </h1>
              <p className="text-xs text-[#94A3B8] mt-0.5">
                {isSignedIn
                  ? `${watchlistItems.length} saved movies & series`
                  : 'Sign in to save movies & series to watch later'}
              </p>
            </div>
          </div>

          {!isSignedIn ? (
            <div className="mx-4 md:mx-auto rounded-2xl bg-[#141821] border border-white/[0.06] py-14 px-6 text-center max-w-lg">
              <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-[#00E5FF]/10 border border-[#00E5FF]/25 flex items-center justify-center">
                <LogIn className="w-6 h-6 text-[#00E5FF]" />
              </div>
              <p className="text-base font-bold text-[#F8FAFC]">Sign in to save your Watchlist</p>
              <p className="text-xs text-[#94A3B8] mt-1.5 mb-5 max-w-sm mx-auto">
                Your saved titles are tied to your CeniPluse account so they stay ready whenever you come back.
              </p>
              <button
                type="button"
                onClick={() => setActiveModal('signin')}
                className="min-h-[44px] px-6 rounded-full bg-[#00E5FF] hover:bg-[#33ECFF] text-[#071018] text-xs font-extrabold transition-colors"
              >
                Sign In / Create Account
              </button>
            </div>
          ) : watchlistItems.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 px-2 sm:grid-cols-3 sm:gap-3 sm:px-4 md:px-0 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 min-[1920px]:grid-cols-9 md:gap-4">
              {watchlistItems.map((item) => (
                <PosterCard
                  key={item.id}
                  item={item}
                  showCast
                  inWatchlist
                  onPlay={(m) => handlePlayItem(m)}
                  onSelect={(m) => setSelectedMedia({ item: m, autoPlay: false })}
                  onToggleWatchlist={handleToggleWatchlist}
                />
              ))}
            </div>
          ) : (
            <div className="mx-4 md:mx-0 rounded-2xl bg-[#141821] border border-white/[0.06] py-14 px-6 text-center">
              <p className="text-base font-bold text-[#F8FAFC]">Your list is empty</p>
              <p className="text-xs text-[#94A3B8] mt-1 mb-4">
                Tap + My List on any movie or series to save it here.
              </p>
              <button
                type="button"
                onClick={() => handleNavigate('home')}
                className="min-h-[44px] px-6 rounded-full bg-[#00E5FF] text-[#071018] text-xs font-extrabold"
              >
                Explore Home
              </button>
            </div>
          )}
        </div>
      );
    }

    // 6. DOWNLOADS VIEW — Shows real downloads saved by user, or clean empty state
    return (
      <div className="px-4 md:px-0 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg md:text-xl font-extrabold text-[#F8FAFC] flex items-center gap-2">
              <Download className="w-5 h-5 text-[#10B981]" />
              Downloads
            </h1>
            <p className="text-xs text-[#94A3B8] mt-0.5">
              Offline videos and completed downloads appear here
            </p>
          </div>

          {userDownloads.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setUserDownloads([]);
                localStorage.removeItem('cinepulse_user_downloads');
              }}
              className="min-h-[38px] px-3.5 rounded-lg bg-[#1E2430] hover:bg-rose-500/20 text-xs font-bold text-[#CBD5E1] hover:text-rose-300 border border-white/10 inline-flex items-center gap-1.5 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear History
            </button>
          )}
        </div>

        {userDownloads.length > 0 ? (
          <div className="space-y-2.5">
            {userDownloads.map((dl) => (
              <div
                key={dl.id}
                className="rounded-xl bg-[#141821] border border-white/[0.07] p-3 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <img
                    src={dl.poster}
                    alt={dl.title}
                    className="w-12 h-16 rounded-lg object-cover bg-[#0B0D12] shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-[#F8FAFC] truncate">
                      {dl.title} {dl.episodeLabel ? `• ${dl.episodeLabel}` : ''}
                    </div>
                    <div className="text-xs text-[#94A3B8] mt-0.5 tabular-nums">
                      <span className="text-[#10B981] font-bold">{dl.quality}</span> &bull;{' '}
                      {new Date(dl.downloadedAt).toLocaleString()}
                    </div>
                  </div>
                </div>

                <a
                  href={dl.url}
                  target="_blank"
                  rel="noreferrer"
                  download
                  className="min-h-[38px] px-4 rounded-lg bg-[#10B981]/15 hover:bg-[#10B981] text-[#10B981] hover:text-[#041811] text-xs font-extrabold inline-flex items-center gap-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Again
                </a>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl bg-[#141821] border border-white/[0.06] py-16 px-6 text-center space-y-3">
            <div className="w-12 h-12 mx-auto rounded-full bg-[#1E2430] border border-white/[0.08] flex items-center justify-center text-[#94A3B8]">
              <Download className="w-5 h-5" />
            </div>
            <p className="text-base font-bold text-[#F8FAFC]">No downloads yet</p>
            <p className="text-xs text-[#94A3B8] max-w-sm mx-auto">
              Movies and episodes you download will appear here cleanly.
            </p>
            <button
              type="button"
              onClick={() => handleNavigate('home')}
              className="min-h-[44px] px-6 rounded-full bg-[#00E5FF] hover:bg-[#33ECFF] text-[#071018] text-xs font-extrabold transition-colors"
            >
              Explore Home
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <AppShell
        activeRoute={activeRoute}
        onNavigate={handleNavigate}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        onCloseSidebar={() => setSidebarOpen(false)}
        uiLanguage={uiLanguage}
        onChangeLanguage={setUiLanguage}
        catalog={catalog}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSelectMedia={(item) => setSelectedMedia({ item, autoPlay: false })}
        watchingCount={continueWatchingEntries.length}
        watchlistCount={watchlistItems.length}
        onOpenModal={(m) => {
          if (m !== 'pro') setPaywallReason(null);
          setActiveModal(m);
        }}
        userEmail={userEmail}
        premiumPlan={hasActiveSubscription ? premiumPlan || 'active' : null}
        detailOpen={Boolean(selectedMedia)}
      >
        {monetizationConfig?.accessMode === 'strict_gate' &&
        !hasActiveSubscription &&
        activeRoute !== 'admin' ? (
          <div className="min-h-[75vh] px-4 flex items-center justify-center">
            <div className="w-full max-w-md rounded-2xl bg-[#141821] border border-[#FCE18E]/30 p-6 sm:p-8 text-center space-y-4 shadow-2xl">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-gradient-to-br from-[#FFF1BC] to-[#F5CD67] text-[#2B1907] flex items-center justify-center font-black text-lg">
                VIP
              </div>
              <h1 className="text-2xl font-black text-[#F8FAFC] tracking-tight">
                CeniPluse Members-Only Access
              </h1>
              <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed">
                Subscribe from <strong className="text-[#FCE18E]">GHS 25/month</strong> via MTN MoMo,
                Telecel Cash, or Card to unlock unlimited ad-free HD movies, series, and fast downloads.
              </p>
              <div className="flex flex-col gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => openPaywallModal('Choose a plan below to unlock full access to CeniPluse.')}
                  className="w-full min-h-[46px] rounded-xl bg-gradient-to-r from-[#FFF1BC] via-[#FCE18E] to-[#F5CD67] text-[#2B1907] text-sm font-extrabold"
                >
                  Subscribe Now (MoMo / Card)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveModal('signin')}
                  className="w-full min-h-[44px] rounded-xl bg-[#0B0D12] border border-white/15 text-[#F8FAFC] text-xs font-bold"
                >
                  Already a Member? Sign In
                </button>
              </div>
            </div>
          </div>
        ) : selectedMedia ? (
          <ErrorBoundary fallbackTitle="Media Detail Page encountered an error">
            <Suspense fallback={<HeroSkeleton />}>
              <MediaDetailView
                item={selectedMedia.item}
                autoPlayVideo={selectedMedia.autoPlay}
                catalog={catalog}
                inWatchlist={watchlistIds.has(selectedMedia.item.id)}
                userEmail={userEmail}
                hasActiveSubscription={hasActiveSubscription}
                monetizationConfig={monetizationConfig}
                premiumPlan={premiumPlan}
                onRequireSubscription={openPaywallModal}
                onBack={handleDetailBack}
                onToggleWatchlist={handleToggleWatchlist}
                onSelectMedia={(rec) => setSelectedMedia({ item: rec, autoPlay: false })}
                onOpenAppModal={() => setActiveModal('app')}
                onRecordDownload={handleRecordDownload}
              />
            </Suspense>
          </ErrorBoundary>
        ) : (
          renderPage()
        )}
      </AppShell>

      <GlobalAdLoader
        config={monetizationConfig}
        hasActiveSubscription={hasActiveSubscription}
        isAdminRoute={activeRoute === 'admin'}
      />

      <ActionModals
        modal={activeModal}
        onClose={() => {
          setActiveModal(null);
          setPaywallReason(null);
        }}
        userEmail={userEmail}
        userProfile={userProfile}
        premiumPlan={premiumPlan}
        paystackPublicKey={monetizationConfig?.paystackPublicKey || ''}
        paywallReason={paywallReason}
        onSelectPlan={(planId) => {
          localStorage.setItem('cinepulse_premium_plan', planId);
          setPremiumPlan(planId);
          setServerSubActive(true);
          setPaywallReason(null);
        }}
        onSwitchModal={(next) => setActiveModal(next)}
        onOpenAdmin={() => handleNavigate('admin')}
        onSignOut={async () => {
          await signOutSupabase().catch(() => {});
          setUserProfile(null);
          setUserEmail(null);
          setServerSubActive(false);
        }}
      />
    </>
  );
};

export default App;
