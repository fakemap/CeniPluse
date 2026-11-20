import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  Bookmark,
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
import { SponsoredBanner } from './components/SponsoredBanner';
import { MediaDetailView } from './components/MediaDetailView';
import {
  fetchPublicMonetizationConfig,
  fetchSubscriptionStatus,
  trackEvent,
  type MonetizationConfig,
} from './services/analytics';

// Code-split admin studio only; MediaDetailView is bundled directly for instant 0ms opens & zero stale-chunk errors on iOS/mobile
const AdminPortalView = lazy(() =>
  import('./components/AdminPortalView').then((m) => ({ default: m.AdminPortalView }))
);

const VALID_ROUTES = new Set<NavRoute>([
  'home',
  'series',
  'movies',
  'animation',
  'trending',
  'search',
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

function matchesFilters(item: MediaItem, filters: FilterState): boolean {
  if (filters.genre !== 'All' && !item.genres.includes(filters.genre)) {
    return false;
  }
  if (filters.country !== 'All' && item.country !== filters.country) {
    return false;
  }
  if (filters.year !== 'All') {
    if (filters.year === '2010s') {
      if (item.year < 2010 || item.year > 2019) return false;
    } else if (filters.year === '2000s') {
      if (item.year < 2000 || item.year > 2009) return false;
    } else if (String(item.year) !== filters.year) {
      return false;
    }
  }
  if (
    filters.language !== 'All' &&
    item.language !== filters.language &&
    !item.subtitlesAvailable.includes(filters.language)
  ) {
    return false;
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
  label?: string;
  hasMore?: boolean;
}

const InfiniteSentinel: React.FC<InfiniteSentinelProps> = ({
  onIntersect,
  isLoading,
  label = 'titles',
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
      { rootMargin: '500px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [onIntersect, hasMore, isLoading]);

  return (
    <div ref={sentinelRef} className="flex flex-col items-center justify-center py-6 pb-12 w-full">
      {isLoading ? (
        <div className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-[#141821] border border-[#00E5FF]/40 text-xs font-bold text-[#00E5FF] shadow-lg shadow-[#00E5FF]/10 animate-pulse">
          <Loader2 className="w-4 h-4 animate-spin text-[#00E5FF]" />
          <span>Auto-loading more {label}...</span>
        </div>
      ) : hasMore ? (
        <button
          type="button"
          onClick={onIntersect}
          className="text-xs text-[#94A3B8] hover:text-[#00E5FF] font-semibold transition-colors py-2"
        >
          Scroll for more {label}
        </button>
      ) : (
        <span className="text-xs text-[#64748B] font-medium">You've reached the end</span>
      )}
    </div>
  );
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

  const [watchlistIds, setWatchlistIds] = useState<Set<string>>(() => {
    try {
      const legacyPhantomIds = new Set([
        'cc_tears_of_steel',
        'cc_sintel',
        'mov_tears_of_steel',
        'mov_sintel',
      ]);
      const saved = JSON.parse(localStorage.getItem('cinepulse_watchlist') || '[]');
      if (!Array.isArray(saved)) return new Set();
      // Clear auto-seeded legacy phantom IDs on first upgrade so empty watchlist starts genuinely empty
      if (!localStorage.getItem('cinepulse_watchlist_v2')) {
        localStorage.setItem('cinepulse_watchlist_v2', '1');
        const cleaned = saved.filter((id) => !legacyPhantomIds.has(String(id)));
        localStorage.setItem('cinepulse_watchlist', JSON.stringify(cleaned));
        return new Set(cleaned);
      }
      return new Set(saved);
    } catch {
      return new Set();
    }
  });

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

  const [watchProgressMap, setWatchProgressMap] = useState<Record<string, WatchProgressEntry>>(() => {
    try {
      const raw = localStorage.getItem('cinepulse_progress');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {
      // fallback below
    }
    return {};
  });

  useEffect(() => {
    const syncProgress = () => {
      try {
        const raw = localStorage.getItem('cinepulse_progress');
        if (raw) setWatchProgressMap(JSON.parse(raw));
      } catch {
        // ignore
      }
    };
    window.addEventListener('cinepulse:progress', syncProgress);
    return () => window.removeEventListener('cinepulse:progress', syncProgress);
  }, []);

  const recordPlayStart = (item: MediaItem) => {
    setWatchProgressMap((prev) => {
      const existing = prev[item.id];
      const next: Record<string, WatchProgressEntry> = {
        ...prev,
        [item.id]: {
          mediaId: item.id,
          positionSec: existing?.positionSec || 780,
          durationSec: existing?.durationSec || 5400,
          seasonNumber: item.type === 'series' ? 1 : undefined,
          episodeNumber: item.type === 'series' ? 1 : undefined,
          updatedAt: new Date().toISOString(),
        },
      };
      try {
        localStorage.setItem('cinepulse_progress', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const handleRemoveContinueWatching = (mediaId: string) => {
    setWatchProgressMap((prev) => {
      const next = { ...prev };
      delete next[mediaId];
      try {
        localStorage.setItem('cinepulse_progress', JSON.stringify(next));
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

  // Persist watchlist
  useEffect(() => {
    localStorage.setItem('cinepulse_watchlist', JSON.stringify(Array.from(watchlistIds)));
  }, [watchlistIds]);

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

    if (selectedMedia?.item) {
      document.title = `${selectedMedia.item.title} (${selectedMedia.item.year}) — CeniPluse`;
    } else {
      const routeTitles: Record<NavRoute, string> = {
        home: 'CeniPluse — Stream Movies, Series & Live Cinema',
        movies: 'Movies Spotlight — CeniPluse',
        series: 'Browse TV Series & Shows — CeniPluse',
        animation: 'Animation, Cartoons & Anime — CeniPluse',
        trending: 'Trending & Most Watched — CeniPluse',
        search: 'Search Catalog — CeniPluse',
        watchlist: 'My Watchlist — CeniPluse',
        downloads: 'Downloads — CeniPluse',
        admin: 'Admin Publishing Studio — CeniPluse',
      };
      document.title = routeTitles[activeRoute] || 'CeniPluse';
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

  // Optimistic Watchlist toggle with server sync & rollback on failure
  const handleToggleWatchlist = (id: string) => {
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

  const handleLoadMoreFromTmdb = async (bucket: 'movie' | 'series' | 'animation') => {
    if (loadingMoreCatalog) return;
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
        setCatalog((prev) => {
          const existingKeys = new Set(
            prev.map((m) => (m.tmdbId ? `${m.type}_${m.tmdbId}` : m.id))
          );
          const fresh = res.items.filter(
            (m) => !existingKeys.has(m.tmdbId ? `${m.type}_${m.tmdbId}` : m.id)
          );
          return fresh.length > 0 ? [...prev, ...fresh] : prev;
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
    () => catalog.filter((m) => m.type === 'animation' || m.genres.includes('Animation')),
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
    () => sortItems(catalog.filter((m) => m.genres.includes('Action')), 'Hottest'),
    [catalog]
  );
  const romanceItems = useMemo(
    () => sortItems(catalog.filter((m) => m.genres.includes('Romance')), 'Hottest'),
    [catalog]
  );
  const horrorItems = useMemo(
    () => sortItems(catalog.filter((m) => m.genres.includes('Horror')), 'Hottest'),
    [catalog]
  );
  const comedyItems = useMemo(
    () => sortItems(catalog.filter((m) => m.genres.includes('Comedy')), 'Hottest'),
    [catalog]
  );
  const scifiItems = useMemo(
    () => sortItems(catalog.filter((m) => m.genres.includes('Sci-Fi') || m.genres.includes('Fantasy')), 'Hottest'),
    [catalog]
  );
  const documentaryItems = useMemo(
    () => sortItems(catalog.filter((m) => m.genres.includes('Documentary')), 'Hottest'),
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
              ? m.type === 'animation' || m.genres.includes('Animation')
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
    const playableCatalog = catalog.filter((m) => m.sources.length > 0 || hasVidLinkSupport(m));
    return Object.values(watchProgressMap)
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
      .map((progress) => {
        const item = playableCatalog.find((m) => m.id === progress.mediaId);
        return item ? { item, progress } : null;
      })
      .filter((x): x is { item: MediaItem; progress: WatchProgressEntry } => Boolean(x));
  }, [catalog, watchProgressMap]);

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

          <SponsoredBanner
            config={monetizationConfig}
            premiumPlan={premiumPlan}
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
      const actionMovies = trendingMovies.filter((m) => m.genres.includes('Action'));
      const thrillerHorror = trendingMovies.filter(
        (m) => m.genres.includes('Horror') || m.genres.includes('Thriller')
      );
      const comedyMovies = trendingMovies.filter((m) => m.genres.includes('Comedy'));
      const scifiMovies = trendingMovies.filter(
        (m) => m.genres.includes('Sci-Fi') || m.genres.includes('Fantasy')
      );

      return (
        <div>
          <HeroCarousel
            items={movieHeroPool}
            watchlistIds={watchlistIds}
            onPlay={handlePlayItem}
            onSelect={(item) => setSelectedMedia({ item, autoPlay: false })}
            onToggleWatchlist={handleToggleWatchlist}
          />

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

              <div className="flex items-center justify-between px-4 md:px-0 mb-3 md:mb-4">
                <h2 className="text-base md:text-xl font-extrabold text-[#F8FAFC]">
                  {directoryHeading || 'Explore All Movies'}
                </h2>
                <span className="text-xs font-semibold text-[#94A3B8] tabular-nums">
                  {spotlightMovies.length} movies loaded
                </span>
              </div>

              {spotlightMovies.length > 0 ? (
                <div className="grid grid-cols-3 gap-2 px-2 sm:grid-cols-3 sm:gap-3 sm:px-4 md:px-0 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 min-[1920px]:grid-cols-9 md:gap-4">
                  {spotlightMovies.map((item) => (
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

              <InfiniteSentinel
                onIntersect={() => handleLoadMoreFromTmdb('movie')}
                isLoading={loadingMoreCatalog}
                label="movies"
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

      return (
        <div>
          <FilterMatrix
            filters={filters}
            onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
            onReset={() => setFilters(DEFAULT_FILTERS)}
          />

          <div className="flex items-center justify-between px-4 md:px-0 mb-3 md:mb-4">
            <h1 className="text-base md:text-xl font-extrabold text-[#F8FAFC]">{heading}</h1>
            <span className="text-xs font-semibold text-[#94A3B8]">
              {directoryItems.length} titles
            </span>
          </div>

          {directoryItems.length > 0 ? (
            <>
              <div className="grid grid-cols-3 gap-2 px-2 sm:grid-cols-3 sm:gap-3 sm:px-4 md:px-0 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 min-[1920px]:grid-cols-9 md:gap-4">
                {directoryItems.map((item) => (
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
                label={activeRoute === 'animation' ? 'animation & anime' : 'series & shows'}
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

    // 5. WATCHLIST VIEW (3-column mobile grid)
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
                {watchlistItems.length} saved movies &amp; series
              </p>
            </div>
          </div>

          {watchlistItems.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 px-2 sm:grid-cols-3 sm:gap-3 sm:px-4 md:px-0 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 min-[1920px]:grid-cols-9 md:gap-4">
              {watchlistItems.map((item) => (
                <PosterCard
                  key={item.id}
                  item={item}
                  showCast
                  inWatchlist
                  onPlay={(m) => setSelectedMedia({ item: m, autoPlay: true })}
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
