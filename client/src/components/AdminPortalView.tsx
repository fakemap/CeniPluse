import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  Clock,
  CheckCircle2,
  DownloadCloud,
  Plus,
  Search,
  Link2,
  Trash2,
  Rocket,
  EyeOff,
  Activity,
  Star,
  Tv,
  Film,
  Layers,
  X,
  AlertCircle,
  Zap,
  Globe,
  Send,
  Flame,
  RefreshCw,
} from 'lucide-react';
import type { CmsTitleItem, MediaItem } from '../types/media';
import { backendApi } from '../services/api';

export type AdminTab = 'draft' | 'published' | 'requests' | 'source' | 'create';

interface AdminPortalViewProps {
  onCatalogChanged: () => void;
  onPreviewMedia: (item: MediaItem) => void;
  initialTab?: AdminTab;
  userEmail?: string | null;
  onRequireAuth?: () => void;
  onBackHome?: () => void;
}

export const AdminPortalView: React.FC<AdminPortalViewProps> = ({
  onCatalogChanged,
  onPreviewMedia,
  initialTab = 'draft',
  userEmail = null,
  onRequireAuth,
  onBackHome,
}) => {
  const [tab, setTab] = useState<AdminTab>(initialTab);
  const [authRequired, setAuthRequired] = useState(false);
  const [summary, setSummary] = useState<{
    total: number;
    published: number;
    draftQueue: number;
    partialSeries: number;
    totalLinks: number;
    requestedTitles?: number;
    totalRequests?: number;
  }>({
    total: 0,
    published: 0,
    draftQueue: 0,
    partialSeries: 0,
    totalLinks: 0,
    requestedTitles: 0,
    totalRequests: 0,
  });
  const [requestsData, setRequestsData] = useState<{
    summary: {
      totalRequestClicks: number;
      uniqueRequestedTitles: number;
      unfulfilledRequestedTitles: number;
      fulfilledRequestedTitles: number;
    };
    mostRequested: CmsTitleItem[];
    recentRequests: CmsTitleItem[];
  }>({
    summary: {
      totalRequestClicks: 0,
      uniqueRequestedTitles: 0,
      unfulfilledRequestedTitles: 0,
      fulfilledRequestedTitles: 0,
    },
    mostRequested: [],
    recentRequests: [],
  });
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [items, setItems] = useState<CmsTitleItem[]>([]);
  const [filterQuery, setFilterQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterRegion, setFilterRegion] = useState('all');
  const [filterGenre, setFilterGenre] = useState('all');
  const [availableGenres, setAvailableGenres] = useState<string[]>([]);
  const [availableRegions, setAvailableRegions] = useState<string[]>([]);
  const [visibleCount, setVisibleCount] = useState(25);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string>('');

  // Multi-Category TMDB Harvester + Recurring Auto-Fetcher state
  const [harvestCategories, setHarvestCategories] = useState<
    Array<{ id: string; label: string; mediaType: string; nextPage: number }>
  >([]);
  const [harvestingCat, setHarvestingCat] = useState<string | null>(null);
  const [harvestLimit, setHarvestLimit] = useState<number>(8);
  const [autoHarvest, setAutoHarvest] = useState<{
    enabled: boolean;
    intervalMinutes: number;
    batchPerCycle: number;
    lastRunAt: string | null;
    nextRunAt: string | null;
    totalAutoAdded: number;
    runningNow: boolean;
    nextCategoryPreview?: string;
  } | null>(null);

  // Inline live TMDB fallback search directly inside Draft Queue
  const [inlineTmdbResults, setInlineTmdbResults] = useState<MediaItem[]>([]);
  const [inlineTmdbLoading, setInlineTmdbLoading] = useState(false);
  const [inlineTmdbSearchedFor, setInlineTmdbSearchedFor] = useState('');

  // TMDB Sourcing tab state
  const [tmdbQuery, setTmdbQuery] = useState('');
  const [tmdbResults, setTmdbResults] = useState<MediaItem[]>([]);
  const [tmdbSearching, setTmdbSearching] = useState(false);

  // Active Link Manager Modal state
  const [managing, setManaging] = useState<CmsTitleItem | null>(null);
  const [selectedSeasonNum, setSelectedSeasonNum] = useState<number>(1);
  const [checkingHealth, setCheckingHealth] = useState(false);

  // Movie link form
  const [mvLabel, setMvLabel] = useState('');
  const [mvQuality, setMvQuality] = useState('1080p');
  const [mvSize, setMvSize] = useState('');
  const [mvStreamUrl, setMvStreamUrl] = useState('');
  const [mvDownloadUrl, setMvDownloadUrl] = useState('');

  // Episode link inline state
  const [activeEpNum, setActiveEpNum] = useState<number | null>(null);
  const [epStreamUrl, setEpStreamUrl] = useState('');
  const [epDownloadUrl, setEpDownloadUrl] = useState('');
  const [epQuality, setEpQuality] = useState('1080p');
  const [epSize, setEpSize] = useState('');
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkUrlsText, setBulkUrlsText] = useState('');

  // Custom title form
  const [customForm, setCustomForm] = useState({
    title: '',
    type: 'movie',
    year: String(new Date().getFullYear()),
    country: 'United States',
    genres: 'Action, Drama',
    poster: '',
    backdrop: '',
    overview: '',
    seasonsCount: '1',
    episodesPerSeason: '6',
    tmdbId: '',
    malId: '',
  });
  const [editMalId, setEditMalId] = useState<string>('');
  const [editTmdbId, setEditTmdbId] = useState<string>('');

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  const loadInventory = async () => {
    setLoading(true);
    try {
      const statusArg = tab === 'draft' ? 'draft' : tab === 'published' ? 'published' : 'all';
      const data = await backendApi.fetchCmsAdminTitles(statusArg, filterQuery, {
        type: filterType,
        region: filterRegion,
        genre: filterGenre,
      });
      setAuthRequired(false);
      setSummary(data.summary);
      setAvailableGenres(data.availableGenres || []);
      setAvailableRegions(data.availableRegions || []);
      setItems(data.items);
      if (managing) {
        const refreshed = data.items.find((x) => x.id === managing.id);
        if (refreshed) setManaging(refreshed);
      }
    } catch (err) {
      if ((err as Error).message === 'AUTH_REQUIRED') {
        setAuthRequired(true);
      } else {
        notify((err as Error).message || 'Failed to load Admin CMS inventory.');
      }
    } finally {
      setLoading(false);
    }
  };

  const loadRequests = async () => {
    setLoadingRequests(true);
    try {
      const reqs = await backendApi.fetchCmsAdminRequests();
      setRequestsData(reqs);
    } catch {
      // ignore offline transient
    } finally {
      setLoadingRequests(false);
    }
  };

  const loadHarvestCategories = async () => {
    const [cats, autoCfg] = await Promise.all([
      backendApi.fetchHarvestCategories(),
      backendApi.fetchAutoHarvestStatus().catch(() => null),
    ]);
    setHarvestCategories(cats.categories || []);
    if (autoCfg) setAutoHarvest(autoCfg);
  };

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (tab === 'draft' || tab === 'published') {
      setVisibleCount(25);
      loadInventory();
    } else if (tab === 'requests') {
      loadRequests();
    }
  }, [tab, filterQuery, filterType, filterRegion, filterGenre, userEmail]);

  // Clear inline TMDB results when user clears the Draft Queue search box
  useEffect(() => {
    if (!filterQuery.trim()) {
      setInlineTmdbResults([]);
      setInlineTmdbSearchedFor('');
    }
  }, [filterQuery]);

  // Initial load & 60-second background refresh so 5-minute auto-fetch and user requests stay live
  useEffect(() => {
    backendApi
      .fetchCmsAdminTitles('all')
      .then((d) => {
        setAuthRequired(false);
        setSummary(d.summary);
      })
      .catch((err) => {
        if ((err as Error).message === 'AUTH_REQUIRED') setAuthRequired(true);
      });
    loadHarvestCategories().catch(() => {});
    loadRequests().catch(() => {});

    const timer = window.setInterval(() => {
      backendApi
        .fetchCmsAdminTitles('all')
        .then((d) => {
          setAuthRequired(false);
          setSummary(d.summary);
        })
        .catch(() => {});
      loadRequests().catch(() => {});
    }, 60 * 1000);
    return () => window.clearInterval(timer);
  }, [userEmail]);

  const handleInlineTmdbSearch = async (queryOverride?: string) => {
    const q = (queryOverride ?? filterQuery).trim();
    if (!q) return;
    setInlineTmdbLoading(true);
    setInlineTmdbSearchedFor(q);
    try {
      const res = await backendApi.searchLiveTmdb(q);
      setInlineTmdbResults(res);
    } finally {
      setInlineTmdbLoading(false);
    }
  };

  const handleUpdateAutoHarvest = async (patch: {
    enabled?: boolean;
    intervalMinutes?: number;
  }) => {
    try {
      const updated = await backendApi.updateAutoHarvest(patch);
      setAutoHarvest(updated);
      notify(
        updated.enabled
          ? `Recurring Auto-Fetch ACTIVE — automatically pulling fresh TMDB titles every ${updated.intervalMinutes} min!`
          : 'Recurring Auto-Fetch paused.'
      );
    } catch (err) {
      notify((err as Error).message);
    }
  };

  const syncManagingTitle = (updated: CmsTitleItem) => {
    setManaging(updated);
    loadInventory();
    onCatalogChanged();
  };

  const handleSearchTmdb = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tmdbQuery.trim()) return;
    setTmdbSearching(true);
    try {
      const res = await backendApi.searchLiveTmdb(tmdbQuery.trim());
      setTmdbResults(res);
    } finally {
      setTmdbSearching(false);
    }
  };

  const handlePullToDraft = async (item: MediaItem) => {
    if (!item.tmdbId) return;
    try {
      const res = await backendApi.cmsSourceFromTmdb(
        item.tmdbId,
        item.type === 'series' ? 'tv' : 'movie'
      );
      notify(
        res.alreadyExists
          ? `"${item.title}" is already in Admin Portal.`
          : `Added "${item.title}" to Needs Links (Draft Queue) — hidden from main site until published!`
      );
      await loadInventory();
      if (res.title) {
        setManaging({ ...res.title, stats: res.stats });
        setSelectedSeasonNum(res.title.seasons?.[0]?.seasonNumber || 1);
      }
    } catch (err) {
      notify((err as Error).message);
    }
  };

  const handleHarvest = async (categoryId: string, label?: string) => {
    setHarvestingCat(categoryId);
    try {
      const res = await backendApi.cmsHarvestTmdb(categoryId, harvestLimit);
      notify(
        categoryId === 'all'
          ? `Harvested ${res.added} brand-new titles across ${res.categoriesScanned} TMDB categories (Hollywood, Nollywood, Bollywood, K-Drama, Anime, Action, Horror, Comedy & more) into Draft Queue!`
          : `Pulled ${res.added} new titles from "${label || categoryId}" into Draft Queue!`
      );
      setTab('draft');
      await Promise.all([loadInventory(), loadHarvestCategories()]);
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setHarvestingCat(null);
    }
  };

  const handleAddMovieMirror = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managing || !mvStreamUrl.trim()) return;
    try {
      const updated = await backendApi.cmsAddMovieSource(managing.id, {
        label: mvLabel.trim() || `Server ${(managing.sources?.length || 0) + 1} (${mvQuality})`,
        quality: mvQuality,
        size: mvSize.trim() || 'HD',
        url: mvStreamUrl.trim(),
        downloadUrl: mvDownloadUrl.trim() || mvStreamUrl.trim(),
      });
      setMvLabel('');
      setMvSize('');
      setMvStreamUrl('');
      setMvDownloadUrl('');
      syncManagingTitle(updated);
      notify('Stream & download link attached! Click Publish when ready.');
    } catch (err) {
      notify((err as Error).message);
    }
  };

  const handleAddEpisodeMirror = async (e: React.FormEvent, epNum: number) => {
    e.preventDefault();
    if (!managing || !epStreamUrl.trim()) return;
    try {
      const updated = await backendApi.cmsAddEpisodeSource(
        managing.id,
        selectedSeasonNum,
        epNum,
        {
          label: `S${String(selectedSeasonNum).padStart(2, '0')}E${String(epNum).padStart(2, '0')} (${epQuality})`,
          quality: epQuality,
          size: epSize.trim() || 'HD',
          url: epStreamUrl.trim(),
          downloadUrl: epDownloadUrl.trim() || epStreamUrl.trim(),
        }
      );
      setEpStreamUrl('');
      setEpDownloadUrl('');
      setEpSize('');
      setActiveEpNum(null);
      syncManagingTitle(updated);
      notify(`Linked S${String(selectedSeasonNum).padStart(2, '0')}E${String(epNum).padStart(2, '0')}!`);
    } catch (err) {
      notify((err as Error).message);
    }
  };

  const handleBulkSeasonLinks = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managing || !bulkUrlsText.trim()) return;
    try {
      const res = await backendApi.cmsBulkAddSeasonLinks(
        managing.id,
        selectedSeasonNum,
        bulkUrlsText,
        epQuality
      );
      setBulkUrlsText('');
      setBulkMode(false);
      syncManagingTitle(res.title);
      notify(`Linked ${res.linkedCount} episode(s) in Season ${selectedSeasonNum}!`);
    } catch (err) {
      notify((err as Error).message);
    }
  };

  const handlePublish = async (id: string) => {
    try {
      const updated = await backendApi.cmsPublish(id);
      syncManagingTitle(updated);
      notify(`Published "${updated.title}" — now LIVE on the main website!`);
    } catch (err) {
      notify((err as Error).message);
    }
  };

  const handleUnpublish = async (id: string) => {
    try {
      const updated = await backendApi.cmsUnpublish(id);
      syncManagingTitle(updated);
      notify(`Moved "${updated.title}" back to Draft Queue (hidden from main site).`);
    } catch (err) {
      notify((err as Error).message);
    }
  };

  const handleCheckLinks = async (id: string) => {
    setCheckingHealth(true);
    try {
      const updated = await backendApi.cmsCheckLinks(id);
      syncManagingTitle(updated);
      notify('Finished live HTTP link health check!');
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setCheckingHealth(false);
    }
  };

  useEffect(() => {
    if (managing) {
      setEditMalId(managing.malId ? String(managing.malId) : '');
      setEditTmdbId(managing.tmdbId ? String(managing.tmdbId) : '');
    }
  }, [managing?.id, managing?.malId, managing?.tmdbId]);

  const handleSaveTitleIds = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managing) return;
    try {
      const updated = await backendApi.cmsUpdateTitleMetadata(managing.id, {
        tmdbId: editTmdbId.trim() ? Number(editTmdbId.trim()) : null,
        malId: editMalId.trim() ? Number(editMalId.trim()) : null,
      });
      syncManagingTitle(updated);
      notify('Saved Cloud Stream catalog IDs!');
    } catch (err) {
      notify((err as Error).message);
    }
  };

  const handleCreateCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await backendApi.cmsCreateCustomTitle({
        ...customForm,
        year: Number(customForm.year),
        seasonsCount: Number(customForm.seasonsCount),
        episodesPerSeason: Number(customForm.episodesPerSeason),
        tmdbId: customForm.tmdbId.trim() ? Number(customForm.tmdbId.trim()) : null,
        malId: customForm.malId.trim() ? Number(customForm.malId.trim()) : null,
      });
      notify(`Created "${created.title}" in Draft Queue — attach links now to publish!`);
      setCustomForm({
        title: '',
        type: 'movie',
        year: String(new Date().getFullYear()),
        country: 'United States',
        genres: 'Action, Drama',
        poster: '',
        backdrop: '',
        overview: '',
        seasonsCount: '1',
        episodesPerSeason: '6',
        tmdbId: '',
        malId: '',
      });
      setTab('draft');
      setManaging(created);
      setSelectedSeasonNum(1);
      await loadInventory();
    } catch (err) {
      notify((err as Error).message);
    }
  };

  const activeSeasonObj = managing?.seasons?.find(
    (s) => s.seasonNumber === selectedSeasonNum
  );

  if (authRequired) {
    return (
      <div className="px-4 md:px-0 py-14 flex items-center justify-center">
        <div className="w-full max-w-md rounded-2xl bg-[#141821] border border-white/[0.1] p-6 sm:p-8 text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-[#00E5FF]/15 border border-[#00E5FF]/35 flex items-center justify-center text-[#00E5FF]">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-lg sm:text-xl font-extrabold text-[#F8FAFC]">
              Admin Studio Sign-In Required
            </h1>
            <p className="text-xs text-[#94A3B8] leading-relaxed">
              Sign in with your administrator email to manage drafts, attach cloud links, review viewer requests, and publish titles on Vercel.
            </p>
          </div>
          <div className="pt-2 flex flex-wrap items-center justify-center gap-2.5">
            {onRequireAuth && (
              <button
                type="button"
                onClick={onRequireAuth}
                className="min-h-[42px] px-5 rounded-full bg-[#00E5FF] hover:bg-[#33ECFF] text-[#071018] text-xs font-extrabold transition-colors"
              >
                Sign In to Continue
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (onBackHome) onBackHome();
                else window.location.href = '/';
              }}
              className="min-h-[42px] px-5 rounded-full bg-[#1E2430] hover:bg-[#262E3D] border border-white/15 text-xs font-bold text-[#F8FAFC] transition-colors"
            >
              Back to Site
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 md:px-0 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg md:text-2xl font-extrabold text-[#F8FAFC] flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-[#00E5FF]" />
            Admin Publishing Studio
          </h1>
          <p className="text-xs text-[#94A3B8] mt-0.5">
            Source movies &amp; series from TMDB automatically (every 5 min) &rarr; Users can browse &amp; request missing links &rarr; Attach cloud links &amp; publish live
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={harvestingCat !== null}
            onClick={() => handleHarvest('all')}
            className="min-h-[42px] px-4 rounded-full bg-[#00E5FF] hover:bg-[#33ECFF] disabled:opacity-60 text-xs font-extrabold text-[#071018] inline-flex items-center gap-1.5 transition-all"
          >
            <Zap className={`w-4 h-4 fill-current ${harvestingCat === 'all' ? 'animate-pulse' : ''}`} />
            {harvestingCat === 'all'
              ? 'Fetching All Categories from TMDB...'
              : 'Fetch All Kinds of Movies & Series (TMDB)'}
          </button>
        </div>
      </div>

      {/* Automatic Recurring Background TMDB Fetcher Status Bar */}
      {autoHarvest && (
        <div className="rounded-2xl bg-[#141821] border border-white/[0.08] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <span
              className={`px-2.5 py-1 rounded-full font-extrabold inline-flex items-center gap-1.5 ${
                autoHarvest.enabled
                  ? 'bg-[#10B981]/15 border border-[#10B981]/40 text-[#10B981]'
                  : 'bg-[#1E2430] border border-white/10 text-[#94A3B8]'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  autoHarvest.enabled ? 'bg-[#10B981] animate-pulse' : 'bg-[#64748B]'
                }`}
              />
              {autoHarvest.enabled ? 'Auto-Fetch Running Automatically' : 'Auto-Fetch Paused'}
            </span>
            <span className="text-[#94A3B8]">
              Next rotation:{' '}
              <strong className="text-[#F8FAFC]">
                {autoHarvest.nextCategoryPreview || 'All Categories'}
              </strong>
            </span>
            {autoHarvest.totalAutoAdded > 0 && (
              <span className="text-[#00E5FF] font-semibold">
                &bull; {autoHarvest.totalAutoAdded} auto-added
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <select
              value={autoHarvest.intervalMinutes}
              onChange={(e) =>
                handleUpdateAutoHarvest({ intervalMinutes: Number(e.target.value) })
              }
              aria-label="Auto-fetch interval"
              className="min-h-[36px] px-2.5 rounded-lg bg-[#0B0D12] border border-white/10 text-xs font-semibold text-[#F8FAFC]"
            >
              <option value={5}>Every 5 min</option>
              <option value={15}>Every 15 min</option>
              <option value={30}>Every 30 min</option>
              <option value={60}>Every 1 hour</option>
              <option value={360}>Every 6 hours</option>
              <option value={1440}>Every 24 hours</option>
            </select>

            <button
              type="button"
              onClick={() => handleUpdateAutoHarvest({ enabled: !autoHarvest.enabled })}
              className={`min-h-[36px] px-3.5 rounded-lg text-xs font-extrabold border transition-colors ${
                autoHarvest.enabled
                  ? 'bg-[#1E2430] border-white/10 text-[#CBD5E1] hover:border-[#FFB800]/50 hover:text-[#FFB800]'
                  : 'bg-[#10B981] border-[#10B981] text-[#041811]'
              }`}
            >
              {autoHarvest.enabled ? 'Pause' : 'Resume Auto-Fetch'}
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="px-4 py-3 rounded-xl bg-[#00E5FF]/15 border border-[#00E5FF]/40 text-xs font-bold text-[#00E5FF] flex items-center justify-between">
          <span>{toast}</span>
          <button type="button" onClick={() => setToast('')}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* KPI Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="p-4 rounded-2xl bg-[#141821] border border-[#10B981]/30">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
            Published (Live Links)
          </div>
          <div className="text-2xl font-extrabold text-[#10B981] mt-1 tabular-nums">{summary.published}</div>
        </div>
        <div className="p-4 rounded-2xl bg-[#141821] border border-[#FFB800]/30">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
            Needs Links (Drafts)
          </div>
          <div className="text-2xl font-extrabold text-[#FFB800] mt-1 tabular-nums">{summary.draftQueue}</div>
        </div>
        <button
          type="button"
          onClick={() => setTab('requests')}
          className="p-4 rounded-2xl bg-[#141821] hover:bg-[#1E2430] border border-[#00E5FF]/35 text-left transition-colors"
        >
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
            User Requests
          </div>
          <div className="text-2xl font-extrabold text-[#00E5FF] mt-1 tabular-nums">
            {requestsData.summary.totalRequestClicks}
          </div>
          <div className="text-[10.5px] text-[#94A3B8] mt-0.5 tabular-nums">
            {requestsData.summary.unfulfilledRequestedTitles} awaiting links
          </div>
        </button>
        <div className="p-4 rounded-2xl bg-[#141821] border border-white/10">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
            Partial Series (More Seasons)
          </div>
          <div className="text-2xl font-extrabold text-[#F8FAFC] mt-1 tabular-nums">{summary.partialSeries}</div>
        </div>
        <div className="p-4 rounded-2xl bg-[#141821] border border-white/10">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
            Total Stream / DL Links
          </div>
          <div className="text-2xl font-extrabold text-[#F8FAFC] mt-1 tabular-nums">{summary.totalLinks}</div>
        </div>
      </div>

      {/* Admin Workflow Tabs */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {[
          { id: 'draft' as const, label: `Needs Links / Drafts (${summary.draftQueue})`, icon: Clock },
          { id: 'published' as const, label: `Published Live (${summary.published})`, icon: CheckCircle2 },
          { id: 'requests' as const, label: `User Requests (${requestsData.summary.unfulfilledRequestedTitles})`, icon: Send },
          { id: 'source' as const, label: 'Source from TMDB', icon: Search },
          { id: 'create' as const, label: 'Add Custom Title', icon: Plus },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`shrink-0 min-h-[44px] px-4 rounded-xl border text-xs font-extrabold inline-flex items-center gap-2 transition-all ${
              tab === id
                ? 'bg-[#00E5FF] border-[#00E5FF] text-[#071018]'
                : 'bg-[#141821] border-white/[0.08] text-[#CBD5E1] hover:border-white/20'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* TAB 1 & TAB 2: DRAFT QUEUE & PUBLISHED INVENTORY */}
      {(tab === 'draft' || tab === 'published') && (
        <div className="space-y-3">
          {/* Organized Multi-Filter Bar + Instant "Fetch from TMDB" Search Button */}
          <div className="flex flex-wrap items-center gap-2">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleInlineTmdbSearch();
              }}
              className="flex flex-1 min-w-[260px] max-w-lg gap-1.5"
            >
              <input
                type="search"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder={`Search ${tab === 'draft' ? 'drafts' : 'published'} or press Search TMDB to fetch missing titles...`}
                className="flex-1 min-h-[42px] px-3.5 rounded-xl bg-[#141821] border border-white/10 focus:border-[#00E5FF] text-xs text-[#F8FAFC] outline-none"
              />
              <button
                type="submit"
                disabled={!filterQuery.trim() || inlineTmdbLoading}
                className="shrink-0 min-h-[42px] px-4 rounded-xl bg-[#00E5FF] hover:bg-[#33ECFF] disabled:bg-[#1E2430] disabled:text-[#64748B] text-[#071018] text-xs font-extrabold inline-flex items-center gap-1.5 transition-colors"
              >
                <Search className="w-3.5 h-3.5" />
                {inlineTmdbLoading ? 'Searching...' : 'Search TMDB'}
              </button>
            </form>

            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="min-h-[42px] px-3 rounded-xl bg-[#141821] border border-white/10 text-xs font-semibold text-[#F8FAFC]"
            >
              <option value="all">All Types</option>
              <option value="movie">Movies Only</option>
              <option value="series">TV Series Only</option>
              <option value="animation">Animation Only</option>
            </select>

            <select
              value={filterRegion}
              onChange={(e) => setFilterRegion(e.target.value)}
              className="min-h-[42px] px-3 rounded-xl bg-[#141821] border border-white/10 text-xs font-semibold text-[#F8FAFC]"
            >
              <option value="all">All Categories / Regions</option>
              {availableRegions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>

            <select
              value={filterGenre}
              onChange={(e) => setFilterGenre(e.target.value)}
              className="min-h-[42px] px-3 rounded-xl bg-[#141821] border border-white/10 text-xs font-semibold text-[#F8FAFC]"
            >
              <option value="all">All Genres</option>
              {availableGenres.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          {/* Inline Live TMDB Fetch Results (when user clicks "Search TMDB" for a movie not yet in Drafts!) */}
          {(inlineTmdbLoading || inlineTmdbResults.length > 0 || (inlineTmdbSearchedFor && !inlineTmdbLoading)) && (
            <div className="rounded-2xl bg-[#141821] border border-[#00E5FF]/40 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-extrabold text-[#00E5FF] flex items-center gap-1.5">
                  <DownloadCloud className="w-4 h-4" />
                  Live TMDB Matches for &ldquo;{inlineTmdbSearchedFor}&rdquo; ({inlineTmdbResults.length} found)
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setInlineTmdbResults([]);
                    setInlineTmdbSearchedFor('');
                  }}
                  className="text-xs text-[#94A3B8] hover:text-white inline-flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" /> Close
                </button>
              </div>

              {inlineTmdbLoading ? (
                <div className="text-xs text-[#94A3B8] py-4 text-center">
                  Searching TMDB worldwide catalog...
                </div>
              ) : inlineTmdbResults.length === 0 ? (
                <div className="text-xs text-[#94A3B8] py-3">
                  No titles found on TMDB for &ldquo;{inlineTmdbSearchedFor}&rdquo;. You can still add it manually under <strong>+ Add Custom Title</strong>.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {inlineTmdbResults.slice(0, 12).map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl bg-[#0B0D12] border border-white/[0.08] overflow-hidden flex flex-col"
                    >
                      <div className="relative aspect-[2/3] bg-[#141821]">
                        <img
                          src={item.poster}
                          alt={item.title}
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-[#10B981] text-[#041811] text-[10px] font-extrabold">
                          {item.year}
                        </span>
                        <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-[#0B0D12]/85 text-[#00E5FF] text-[9.5px] font-bold uppercase">
                          {item.type}
                        </span>
                      </div>
                      <div className="p-2 flex-1 flex flex-col justify-between gap-2">
                        <div className="text-xs font-bold text-[#F8FAFC] line-clamp-2">
                          {item.title}
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            await handlePullToDraft(item);
                            setInlineTmdbResults([]);
                            setInlineTmdbSearchedFor('');
                          }}
                          className="w-full min-h-[36px] rounded-lg bg-[#00E5FF] hover:bg-[#33ECFF] text-[#071018] text-[11px] font-extrabold"
                        >
                          + Fetch to Drafts
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {loading ? (
            <div className="space-y-2.5">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-24 rounded-2xl skeleton-shimmer" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl bg-[#141821] border border-white/[0.07] py-14 px-6 text-center space-y-3">
              <p className="text-sm font-bold text-[#F8FAFC]">
                {filterQuery.trim()
                  ? `"${filterQuery}" is not in your ${tab === 'draft' ? 'Draft Queue' : 'Published'} list yet.`
                  : tab === 'draft'
                  ? 'No unlinked drafts matching these filters.'
                  : 'No titles published yet.'}
              </p>
              {filterQuery.trim() ? (
                <button
                  type="button"
                  onClick={() => handleInlineTmdbSearch(filterQuery)}
                  className="min-h-[44px] px-6 rounded-full bg-[#00E5FF] text-[#071018] text-xs font-extrabold inline-flex items-center gap-1.5"
                >
                  <Search className="w-4 h-4" />
                  Fetch &ldquo;{filterQuery}&rdquo; from TMDB Now
                </button>
              ) : (
                <p className="text-xs text-[#94A3B8] max-w-md mx-auto">
                  {tab === 'draft'
                    ? 'Click "Fetch All Kinds of Movies & Series (TMDB)" above or let Auto-Fetch pull fresh titles automatically.'
                    : 'Open a title in the Draft Queue, attach at least 1 stream/download link, and press Publish.'}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2.5">
              {items.slice(0, visibleCount).map((t) => (
                <div
                  key={t.id}
                  className="rounded-2xl bg-[#141821] border border-white/[0.07] hover:border-white/15 p-3.5 flex flex-col lg:flex-row lg:items-center gap-3.5 justify-between"
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <img
                      src={t.poster}
                      alt={t.title}
                      className="w-14 h-20 rounded-xl object-cover bg-[#0B0D12] shrink-0"
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase ${
                            t.status === 'published'
                              ? 'bg-[#10B981]/20 text-[#10B981]'
                              : 'bg-[#FFB800]/20 text-[#FFB800]'
                          }`}
                        >
                          {t.status === 'published' ? '● LIVE ON SITE' : 'HIDDEN DRAFT'}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-[#1E2430] text-[10px] font-bold text-[#CBD5E1] uppercase inline-flex items-center gap-1">
                          {t.type === 'series' ? <Tv className="w-3 h-3" /> : <Film className="w-3 h-3" />}
                          {t.type}
                        </span>
                        {t.regionTag && (
                          <span className="px-2 py-0.5 rounded-md bg-white/[0.06] text-[10px] font-bold text-[#00E5FF]">
                            {t.regionTag}
                          </span>
                        )}
                        {(t.genres || []).slice(0, 2).map((g) => (
                          <span
                            key={g}
                            className="px-1.5 py-0.5 rounded bg-white/[0.04] text-[10px] text-[#94A3B8]"
                          >
                            {g}
                          </span>
                        ))}
                        {t.featured && (
                          <span className="px-2 py-0.5 rounded-md bg-[#00E5FF]/15 text-[#00E5FF] text-[10px] font-bold">
                            HERO PINNED
                          </span>
                        )}
                      </div>

                      <h3 className="text-sm md:text-base font-extrabold text-[#F8FAFC] truncate">
                        {t.title} ({t.year})
                      </h3>

                      <div className="flex flex-wrap items-center gap-2.5 text-xs text-[#94A3B8]">
                        {t.type === 'series' ? (
                          <>
                            <span className="text-[#00E5FF] font-bold">
                              {t.stats.linkedSeasons} / {t.stats.totalSeasons} Seasons Ready
                            </span>
                            <span>&bull;</span>
                            <span>
                              {t.stats.linkedEpisodes} / {t.stats.totalEpisodes} Episodes Linked
                            </span>
                            {t.stats.isPartial && (
                              <span className="text-[#FFB800] font-semibold">
                                (Only linked seasons show live)
                              </span>
                            )}
                          </>
                        ) : (
                          <span
                            className={
                              t.stats.totalSources > 0
                                ? 'text-[#10B981] font-bold'
                                : 'text-[#FFB800] font-bold'
                            }
                          >
                            {t.stats.totalSources > 0
                              ? `${t.stats.totalSources} Stream/Download Mirror(s) Ready`
                              : '0 Links — Needs Stream/Download URL'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Admin Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setManaging(t);
                        setSelectedSeasonNum(t.seasons?.[0]?.seasonNumber || 1);
                        setActiveEpNum(null);
                        setBulkMode(false);
                      }}
                      className="min-h-[40px] px-4 rounded-xl bg-[#00E5FF] hover:bg-[#33ECFF] text-[#071018] text-xs font-extrabold inline-flex items-center gap-1.5"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      {t.type === 'series' ? 'Manage Seasons & Links' : 'Manage Links'}
                    </button>

                    {t.status !== 'published' ? (
                      <button
                        type="button"
                        disabled={!t.stats.hasPlayableLinks}
                        onClick={() => handlePublish(t.id)}
                        title={
                          t.stats.hasPlayableLinks
                            ? 'Publish to live website'
                            : 'Add at least 1 stream/download link first'
                        }
                        className="min-h-[40px] px-3.5 rounded-xl bg-[#10B981] disabled:bg-[#1E2430] disabled:text-[#64748B] text-[#041811] text-xs font-extrabold inline-flex items-center gap-1.5"
                      >
                        <Rocket className="w-3.5 h-3.5" />
                        Publish
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={async () => {
                            const u = await backendApi.cmsToggleFeatured(t.id);
                            syncManagingTitle(u);
                            notify(u.featured ? 'Pinned to Hero Carousel!' : 'Removed from Hero.');
                          }}
                          className={`min-h-[40px] px-3 rounded-xl border text-xs font-bold inline-flex items-center gap-1 ${
                            t.featured
                              ? 'bg-[#FFB800]/20 border-[#FFB800]/50 text-[#FFB800]'
                              : 'bg-[#1E2430] border-white/10 text-[#CBD5E1]'
                          }`}
                        >
                          <Star className="w-3.5 h-3.5" />
                          Hero
                        </button>

                        <button
                          type="button"
                          onClick={() => handleUnpublish(t.id)}
                          className="min-h-[40px] px-3 rounded-xl bg-[#1E2430] hover:bg-[#FFB800]/20 hover:text-[#FFB800] border border-white/10 text-xs font-bold text-[#CBD5E1] inline-flex items-center gap-1"
                        >
                          <EyeOff className="w-3.5 h-3.5" />
                          Unpublish
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.confirm(`Delete "${t.title}" from Admin Portal?`)) return;
                        await backendApi.cmsDeleteTitle(t.id);
                        await loadInventory();
                        onCatalogChanged();
                        notify(`Deleted "${t.title}".`);
                      }}
                      aria-label="Delete title"
                      className="min-w-[40px] min-h-[40px] rounded-xl bg-rose-500/15 hover:bg-rose-500 text-rose-300 hover:text-white flex items-center justify-center transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}

              {items.length > visibleCount && (
                <div className="pt-3 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setVisibleCount((c) => c + 25)}
                    className="min-h-[44px] px-7 rounded-full bg-[#1E2430] hover:bg-[#00E5FF] hover:text-[#071018] border border-white/10 text-xs font-extrabold text-[#F8FAFC] transition-colors"
                  >
                    Show More ({visibleCount} of {items.length})
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2B: USER REQUESTS DASHBOARD (Most Requested Priority + Chronological Requests Side-by-Side) */}
      {tab === 'requests' && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-[#141821] border border-white/[0.08] px-4 py-3.5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm md:text-base font-extrabold text-[#F8FAFC] flex items-center gap-2">
                <Send className="w-4 h-4 text-[#00E5FF]" />
                Viewer Requests Demand Tracker
              </h2>
              <p className="text-xs text-[#94A3B8] mt-0.5">
                {requestsData.summary.totalRequestClicks} total requests across{' '}
                {requestsData.summary.uniqueRequestedTitles} title(s) &mdash; prioritize adding links to the most-requested titles first.
              </p>
            </div>
            <button
              type="button"
              onClick={loadRequests}
              disabled={loadingRequests}
              className="min-h-[38px] px-4 rounded-xl bg-[#1E2430] hover:bg-[#273041] border border-white/10 text-xs font-bold text-[#F8FAFC] inline-flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#00E5FF] ${loadingRequests ? 'animate-spin' : ''}`} />
              Refresh Requests
            </button>
          </div>

          {loadingRequests && requestsData.mostRequested.length === 0 ? (
            <div className="space-y-2.5">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-24 rounded-2xl skeleton-shimmer" />
              ))}
            </div>
          ) : requestsData.mostRequested.length === 0 ? (
            <div className="rounded-2xl bg-[#141821] border border-white/[0.07] py-14 px-6 text-center space-y-2">
              <p className="text-sm font-bold text-[#F8FAFC]">No viewer requests submitted yet</p>
              <p className="text-xs text-[#94A3B8] max-w-md mx-auto">
                Harvested drafts appear on the main website with a Request option. Whenever viewers request a title without stream links, it ranks here automatically.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              {/* Left Column: Most Requested (Ranked by Highest Demand) */}
              <div className="rounded-2xl bg-[#141821] border border-white/[0.08] p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-white/[0.06] pb-2.5">
                  <h3 className="text-sm font-extrabold text-[#F8FAFC] flex items-center gap-2">
                    <Flame className="w-4 h-4 text-[#FFB800]" />
                    Most Requested (Top Priority)
                  </h3>
                  <span className="text-[11px] font-bold text-[#FFB800] tabular-nums">
                    Ranked by Demand
                  </span>
                </div>

                <div className="space-y-2.5">
                  {requestsData.mostRequested.map((t, idx) => (
                    <div
                      key={`most-${t.id}`}
                      className="rounded-xl bg-[#0B0D12] border border-white/[0.07] p-3 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="w-7 h-7 rounded-lg bg-[#FFB800]/15 border border-[#FFB800]/35 text-[#FFB800] text-xs font-black flex items-center justify-center shrink-0 tabular-nums">
                          #{idx + 1}
                        </span>
                        <img
                          src={t.poster}
                          alt={t.title}
                          className="w-11 h-16 rounded-lg object-cover bg-[#141821] shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                            <span className="px-2 py-0.5 rounded bg-[#00E5FF]/15 text-[#00E5FF] text-[10px] font-extrabold tabular-nums">
                              {t.requestCount || 0} Request{(t.requestCount || 0) === 1 ? '' : 's'}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                t.status === 'published' && t.stats?.hasPlayableLinks
                                  ? 'bg-[#10B981]/20 text-[#10B981]'
                                  : 'bg-[#FFB800]/20 text-[#FFB800]'
                              }`}
                            >
                              {t.status === 'published' && t.stats?.hasPlayableLinks
                                ? 'Live'
                                : 'Needs Links'}
                            </span>
                          </div>
                          <h4 className="text-xs sm:text-sm font-extrabold text-[#F8FAFC] truncate">
                            {t.title} ({t.year})
                          </h4>
                          <p className="text-[11px] text-[#94A3B8] truncate capitalize">
                            {t.type} {t.regionTag ? `• ${t.regionTag}` : ''}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setManaging(t);
                            setSelectedSeasonNum(t.seasons?.[0]?.seasonNumber || 1);
                            setActiveEpNum(null);
                            setBulkMode(false);
                          }}
                          className="min-h-[36px] px-3 rounded-lg bg-[#00E5FF] hover:bg-[#33ECFF] text-[#071018] text-[11px] font-extrabold inline-flex items-center gap-1"
                        >
                          <Link2 className="w-3 h-3" />
                          Add Links
                        </button>
                        {t.status !== 'published' && t.stats?.hasPlayableLinks && (
                          <button
                            type="button"
                            onClick={async () => {
                              await handlePublish(t.id);
                              await loadRequests();
                            }}
                            className="min-h-[36px] px-3 rounded-lg bg-[#10B981] text-[#041811] text-[11px] font-extrabold inline-flex items-center gap-1"
                          >
                            <Rocket className="w-3 h-3" />
                            Publish
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={async () => {
                            await backendApi.clearCmsTitleRequests(t.id);
                            await loadRequests();
                            notify(`Cleared request count for "${t.title}".`);
                          }}
                          title="Reset request counter"
                          className="min-h-[36px] px-2.5 rounded-lg bg-[#1E2430] hover:bg-rose-500/20 text-[#94A3B8] hover:text-rose-300 text-[11px] font-bold"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Column: Latest Requested Titles Queue */}
              <div className="rounded-2xl bg-[#141821] border border-white/[0.08] p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-white/[0.06] pb-2.5">
                  <h3 className="text-sm font-extrabold text-[#F8FAFC] flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#00E5FF]" />
                    Requested Titles (Latest Activity)
                  </h3>
                  <span className="text-[11px] font-bold text-[#94A3B8] tabular-nums">
                    {requestsData.recentRequests.length} Titles
                  </span>
                </div>

                <div className="space-y-2.5">
                  {requestsData.recentRequests.map((t) => (
                    <div
                      key={`recent-${t.id}`}
                      className="rounded-xl bg-[#0B0D12] border border-white/[0.07] p-3 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <img
                          src={t.poster}
                          alt={t.title}
                          className="w-11 h-16 rounded-lg object-cover bg-[#141821] shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                            <span className="px-1.5 py-0.5 rounded bg-[#1E2430] text-[10px] font-bold text-[#CBD5E1] uppercase">
                              {t.type}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-[#FFB800]/15 text-[#FFB800] text-[10px] font-bold tabular-nums">
                              {t.requestCount || 0}x
                            </span>
                            {t.lastRequestedAt && (
                              <span className="text-[10.5px] text-[#94A3B8] tabular-nums">
                                {new Date(t.lastRequestedAt).toLocaleString()}
                              </span>
                            )}
                          </div>
                          <h4 className="text-xs sm:text-sm font-extrabold text-[#F8FAFC] truncate">
                            {t.title} ({t.year})
                          </h4>
                          <p className="text-[11px] text-[#94A3B8] truncate">
                            {(t.genres || []).slice(0, 3).join(', ')}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setManaging(t);
                          setSelectedSeasonNum(t.seasons?.[0]?.seasonNumber || 1);
                          setActiveEpNum(null);
                          setBulkMode(false);
                        }}
                        className="shrink-0 min-h-[36px] px-3 rounded-lg bg-[#1E2430] hover:bg-[#00E5FF] text-[#F8FAFC] hover:text-[#071018] border border-white/10 text-[11px] font-extrabold inline-flex items-center gap-1 transition-colors"
                      >
                        <Link2 className="w-3 h-3" />
                        Add Links
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: SOURCE FROM TMDB INTO DRAFT QUEUE (16 Categories Harvester + Live Search) */}
      {tab === 'source' && (
        <div className="space-y-4">
          {/* 16-Category TMDB Auto-Harvester Grid */}
          <div className="rounded-2xl bg-[#141821] border border-white/[0.08] p-4 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-extrabold text-[#F8FAFC] flex items-center gap-2">
                  <DownloadCloud className="w-4 h-4 text-[#00E5FF]" />
                  TMDB Multi-Category Auto-Harvester (16 Genres &amp; Regions)
                </h3>
                <p className="text-xs text-[#94A3B8] mt-0.5">
                  Each click pulls fresh titles (auto-advancing pages so duplicates are skipped) straight into your hidden Draft Queue.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#94A3B8]">Pull per click:</span>
                <select
                  value={harvestLimit}
                  onChange={(e) => setHarvestLimit(Number(e.target.value))}
                  className="min-h-[38px] px-2.5 rounded-lg bg-[#0B0D12] border border-white/10 text-xs font-bold text-[#F8FAFC]"
                >
                  <option value={6}>6 titles</option>
                  <option value={10}>10 titles</option>
                  <option value={15}>15 titles</option>
                  <option value={20}>20 titles</option>
                </select>
                <button
                  type="button"
                  disabled={harvestingCat !== null}
                  onClick={() => handleHarvest('all')}
                  className="min-h-[38px] px-4 rounded-lg bg-[#00E5FF] text-[#071018] text-xs font-extrabold inline-flex items-center gap-1"
                >
                  <Zap className="w-3.5 h-3.5 fill-current" />
                  {harvestingCat === 'all' ? 'Harvesting...' : 'Fetch All 14 Categories'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {harvestCategories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  disabled={harvestingCat !== null}
                  onClick={() => handleHarvest(cat.id, cat.label)}
                  className="p-3 rounded-xl bg-[#0B0D12] hover:bg-[#1E2430] border border-white/[0.08] hover:border-[#00E5FF]/50 text-left transition-all flex flex-col justify-between gap-1.5 disabled:opacity-50"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-extrabold text-[#F8FAFC] line-clamp-1">
                      {cat.label}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-[#141821] text-[9.5px] font-bold text-[#00E5FF] uppercase">
                      {cat.mediaType}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#94A3B8] flex items-center justify-between">
                    <span>
                      {harvestingCat === cat.id ? 'Fetching...' : `Next: Page ${cat.nextPage}`}
                    </span>
                    <span className="text-[#10B981] font-bold">+ Pull</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-[#141821] border border-white/[0.08] p-4 space-y-3">
            <h3 className="text-sm font-extrabold text-[#F8FAFC]">
              Search Any Specific Movie or Series on TMDB
            </h3>
            <form onSubmit={handleSearchTmdb} className="flex flex-col sm:flex-row gap-2">
              <input
                type="search"
                value={tmdbQuery}
                onChange={(e) => setTmdbQuery(e.target.value)}
                placeholder="Search any movie or series (e.g., Me and You, Stranger Things, Inception)..."
                className="flex-1 min-h-[44px] px-3.5 rounded-xl bg-[#0B0D12] border border-white/10 focus:border-[#00E5FF] text-sm text-[#F8FAFC] outline-none"
              />
              <button
                type="submit"
                disabled={tmdbSearching}
                className="min-h-[44px] px-6 rounded-xl bg-[#00E5FF] text-[#071018] text-xs font-extrabold"
              >
                {tmdbSearching ? 'Searching...' : 'Search TMDB'}
              </button>
            </form>
          </div>

          {tmdbResults.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
              {tmdbResults.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl bg-[#141821] border border-white/[0.08] overflow-hidden flex flex-col"
                >
                  <div className="relative aspect-[2/3] bg-[#0B0D12]">
                    <img
                      src={item.poster}
                      alt={item.title}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-[#10B981] text-[#041811] text-[10px] font-extrabold">
                      {item.year}
                    </span>
                    <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-[#0B0D12]/85 text-[#00E5FF] text-[10px] font-bold uppercase">
                      {item.type}
                    </span>
                  </div>
                  <div className="p-2.5 flex-1 flex flex-col justify-between gap-2">
                    <div className="text-xs font-bold text-[#F8FAFC] line-clamp-2">{item.title}</div>
                    <button
                      type="button"
                      onClick={() => handlePullToDraft(item)}
                      className="w-full min-h-[38px] rounded-lg bg-[#00E5FF]/15 hover:bg-[#00E5FF] text-[#00E5FF] hover:text-[#071018] text-[11px] font-extrabold transition-colors"
                    >
                      + Send to Draft Queue
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: ADD CUSTOM TITLE MANUALLY */}
      {tab === 'create' && (
        <form
          onSubmit={handleCreateCustom}
          className="rounded-2xl bg-[#141821] border border-white/[0.08] p-5 space-y-4 max-w-3xl"
        >
          <h3 className="text-base font-extrabold text-[#F8FAFC]">
            Add Custom Movie or Series (Created as Draft until Links Added)
          </h3>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[#94A3B8]">Title *</label>
              <input
                required
                value={customForm.title}
                onChange={(e) => setCustomForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g., Me and You"
                className="mt-1 w-full min-h-[42px] px-3 rounded-xl bg-[#0B0D12] border border-white/10 text-sm text-[#F8FAFC]"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#94A3B8]">Type</label>
              <select
                value={customForm.type}
                onChange={(e) => setCustomForm((f) => ({ ...f, type: e.target.value }))}
                className="mt-1 w-full min-h-[42px] px-3 rounded-xl bg-[#0B0D12] border border-white/10 text-sm text-[#F8FAFC]"
              >
                <option value="movie">Movie</option>
                <option value="series">TV Series (Seasons &amp; Episodes)</option>
                <option value="animation">Animation</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[#94A3B8]">Year</label>
              <input
                type="number"
                value={customForm.year}
                onChange={(e) => setCustomForm((f) => ({ ...f, year: e.target.value }))}
                className="mt-1 w-full min-h-[42px] px-3 rounded-xl bg-[#0B0D12] border border-white/10 text-sm text-[#F8FAFC]"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#94A3B8]">Country / Region</label>
              <input
                value={customForm.country}
                onChange={(e) => setCustomForm((f) => ({ ...f, country: e.target.value }))}
                placeholder="Nigeria, United States, India..."
                className="mt-1 w-full min-h-[42px] px-3 rounded-xl bg-[#0B0D12] border border-white/10 text-sm text-[#F8FAFC]"
              />
            </div>
            {customForm.type === 'series' && (
              <>
                <div>
                  <label className="text-xs font-semibold text-[#94A3B8]">Number of Seasons</label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={customForm.seasonsCount}
                    onChange={(e) =>
                      setCustomForm((f) => ({ ...f, seasonsCount: e.target.value }))
                    }
                    className="mt-1 w-full min-h-[42px] px-3 rounded-xl bg-[#0B0D12] border border-white/10 text-sm text-[#F8FAFC]"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#94A3B8]">
                    Episodes per Season
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={customForm.episodesPerSeason}
                    onChange={(e) =>
                      setCustomForm((f) => ({ ...f, episodesPerSeason: e.target.value }))
                    }
                    className="mt-1 w-full min-h-[42px] px-3 rounded-xl bg-[#0B0D12] border border-white/10 text-sm text-[#F8FAFC]"
                  />
                </div>
              </>
            )}
            <div>
              <label className="text-xs font-semibold text-[#94A3B8]">
                TMDB ID (Optional — enables Cloud Stream for Movie/TV)
              </label>
              <input
                type="number"
                min="1"
                value={customForm.tmdbId}
                onChange={(e) => setCustomForm((f) => ({ ...f, tmdbId: e.target.value }))}
                placeholder="e.g., 786892"
                className="mt-1 w-full min-h-[42px] px-3 rounded-xl bg-[#0B0D12] border border-white/10 text-sm text-[#F8FAFC]"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#94A3B8]">
                Anime ID (Optional — enables Anime Sub/Dub Cloud Stream)
              </label>
              <input
                type="number"
                min="1"
                value={customForm.malId}
                onChange={(e) => setCustomForm((f) => ({ ...f, malId: e.target.value }))}
                placeholder="e.g., 5"
                className="mt-1 w-full min-h-[42px] px-3 rounded-xl bg-[#0B0D12] border border-white/10 text-sm text-[#F8FAFC]"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-[#94A3B8]">Poster Image URL</label>
              <input
                value={customForm.poster}
                onChange={(e) => setCustomForm((f) => ({ ...f, poster: e.target.value }))}
                placeholder="https://..."
                className="mt-1 w-full min-h-[42px] px-3 rounded-xl bg-[#0B0D12] border border-white/10 text-sm text-[#F8FAFC]"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-[#94A3B8]">Synopsis / Plot</label>
              <textarea
                rows={3}
                value={customForm.overview}
                onChange={(e) => setCustomForm((f) => ({ ...f, overview: e.target.value }))}
                placeholder="Short plot summary..."
                className="mt-1 w-full p-3 rounded-xl bg-[#0B0D12] border border-white/10 text-sm text-[#F8FAFC]"
              />
            </div>
          </div>

          <button
            type="submit"
            className="min-h-[44px] px-6 rounded-full bg-[#00E5FF] text-[#071018] text-xs font-extrabold"
          >
            Create Draft &amp; Attach Links &rarr;
          </button>
        </form>
      )}

      {/* ==================== INTERACTIVE LINK MANAGER MODAL ==================== */}
      {managing && (
        <div
          onClick={() => setManaging(null)}
          className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-md flex items-end md:items-center justify-center p-0 md:p-4 overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-t-2xl md:rounded-2xl bg-[#141821] border border-white/15 shadow-2xl p-4 sm:p-6 space-y-5 animate-sheet-up md:animate-modal"
          >
            {/* Modal Top Bar */}
            <div className="flex items-start justify-between gap-3 border-b border-white/[0.08] pb-4">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={managing.poster}
                  alt={managing.title}
                  className="w-12 h-16 rounded-lg object-cover bg-[#0B0D12] shrink-0"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                        managing.status === 'published'
                          ? 'bg-[#10B981]/20 text-[#10B981]'
                          : 'bg-[#FFB800]/20 text-[#FFB800]'
                      }`}
                    >
                      {managing.status === 'published' ? 'PUBLISHED LIVE' : 'DRAFT (HIDDEN)'}
                    </span>
                    <span className="text-xs text-[#94A3B8] uppercase font-bold">
                      {managing.type}
                    </span>
                  </div>
                  <h2 className="text-lg font-extrabold text-[#F8FAFC] truncate mt-0.5">
                    {managing.title} ({managing.year})
                  </h2>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setManaging(null)}
                className="min-w-[44px] min-h-[44px] rounded-full bg-[#1E2430] text-[#94A3B8] hover:text-white flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Publish / Health Check / Preview Control Strip */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 p-3.5 rounded-xl bg-[#0B0D12] border border-white/[0.08]">
              <div className="text-xs text-[#CBD5E1]">
                {managing.type === 'series' ? (
                  <>
                    <strong className="text-[#00E5FF]">
                      {managing.stats.linkedSeasons} of {managing.stats.totalSeasons} Seasons
                    </strong>{' '}
                    ({managing.stats.linkedEpisodes}/{managing.stats.totalEpisodes} episodes) have
                    links.{' '}
                    <span className="text-[#94A3B8]">
                      Only linked seasons &amp; episodes appear on the live website.
                    </span>
                  </>
                ) : (
                  <>
                    <strong className="text-[#00E5FF]">{managing.stats.totalSources}</strong>{' '}
                    stream/download link(s) attached.
                  </>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={checkingHealth || !managing.stats.hasPlayableLinks}
                  onClick={() => handleCheckLinks(managing.id)}
                  className="min-h-[38px] px-3 rounded-lg bg-[#1E2430] hover:bg-[#273041] disabled:opacity-40 text-xs font-bold text-[#00E5FF] inline-flex items-center gap-1.5"
                >
                  <Activity className={`w-3.5 h-3.5 ${checkingHealth ? 'animate-spin' : ''}`} />
                  {checkingHealth ? 'Testing Links...' : 'Check Link Health'}
                </button>

                {(managing.stats.hasPlayableLinks || Boolean(managing.tmdbId || managing.malId)) && (
                  <button
                    type="button"
                    onClick={() => onPreviewMedia(managing)}
                    className="min-h-[38px] px-3 rounded-lg bg-[#1E2430] hover:bg-[#273041] text-xs font-bold text-[#F8FAFC]"
                  >
                    Preview Player
                  </button>
                )}

                {managing.status !== 'published' ? (
                  <button
                    type="button"
                    disabled={!managing.stats.hasPlayableLinks}
                    onClick={() => handlePublish(managing.id)}
                    className="min-h-[38px] px-4 rounded-lg bg-[#10B981] disabled:bg-[#1E2430] disabled:text-[#64748B] text-[#041811] text-xs font-extrabold inline-flex items-center gap-1.5"
                  >
                    <Rocket className="w-3.5 h-3.5" />
                    Publish to Live Site
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleUnpublish(managing.id)}
                    className="min-h-[38px] px-3.5 rounded-lg bg-[#FFB800]/20 text-[#FFB800] text-xs font-extrabold"
                  >
                    Unpublish
                  </button>
                )}
              </div>
            </div>

            {/* CLOUD STREAM AUTO-EMBED IDS (TMDB ID & MYANIMELIST ID) */}
            <form
              onSubmit={handleSaveTitleIds}
              className="rounded-xl bg-[#0B0D12] border border-[#00E5FF]/25 p-3.5 flex flex-wrap items-end justify-between gap-3"
            >
              <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[240px]">
                <div>
                  <label className="block text-[11px] font-bold text-[#94A3B8]">
                    TMDB ID (Cloud Stream Movie / TV)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={editTmdbId}
                    onChange={(e) => setEditTmdbId(e.target.value)}
                    placeholder="e.g., 786892"
                    className="mt-1 w-36 h-9 px-3 rounded-lg bg-[#141821] border border-white/10 focus:border-[#00E5FF] text-xs font-bold text-[#F8FAFC] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#94A3B8]">
                    Anime ID (Cloud Stream Sub/Dub)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={editMalId}
                    onChange={(e) => setEditMalId(e.target.value)}
                    placeholder="e.g., 5"
                    className="mt-1 w-44 h-9 px-3 rounded-lg bg-[#141821] border border-white/10 focus:border-[#00E5FF] text-xs font-bold text-[#F8FAFC] outline-none"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="min-h-[36px] px-4 rounded-lg bg-[#00E5FF]/15 hover:bg-[#00E5FF] border border-[#00E5FF]/40 text-[#00E5FF] hover:text-[#071018] text-xs font-extrabold transition-colors"
              >
                Save Stream IDs
              </button>
            </form>

            {/* MOVIE LINK MANAGER */}
            {managing.type !== 'series' ? (
              <div className="space-y-4">
                <form
                  onSubmit={handleAddMovieMirror}
                  className="rounded-xl bg-[#0B0D12] border border-white/[0.08] p-4 space-y-3"
                >
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#00E5FF]">
                    + Attach Cloud Stream &amp; Download Link
                  </h4>
                  <div className="grid sm:grid-cols-3 gap-2.5">
                    <input
                      value={mvLabel}
                      onChange={(e) => setMvLabel(e.target.value)}
                      placeholder="Server Label (e.g., Cloud R2 1080p)"
                      className="min-h-[40px] px-3 rounded-lg bg-[#141821] border border-white/10 text-xs text-[#F8FAFC]"
                    />
                    <select
                      value={mvQuality}
                      onChange={(e) => setMvQuality(e.target.value)}
                      className="min-h-[40px] px-3 rounded-lg bg-[#141821] border border-white/10 text-xs text-[#F8FAFC]"
                    >
                      <option value="4K">4K UHD</option>
                      <option value="1080p">1080p Full HD</option>
                      <option value="720p">720p HD</option>
                      <option value="480p">480p Mobile Saver</option>
                    </select>
                    <input
                      value={mvSize}
                      onChange={(e) => setMvSize(e.target.value)}
                      placeholder="File Size (e.g., 1.2 GB)"
                      className="min-h-[40px] px-3 rounded-lg bg-[#141821] border border-white/10 text-xs text-[#F8FAFC]"
                    />
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2.5">
                    <input
                      required
                      value={mvStreamUrl}
                      onChange={(e) => setMvStreamUrl(e.target.value)}
                      placeholder="Stream URL (.mp4 or .m3u8 HLS) *"
                      className="min-h-[40px] px-3 rounded-lg bg-[#141821] border border-white/10 focus:border-[#00E5FF] text-xs text-[#F8FAFC] outline-none"
                    />
                    <input
                      value={mvDownloadUrl}
                      onChange={(e) => setMvDownloadUrl(e.target.value)}
                      placeholder="Direct Download URL (optional — defaults to Stream URL)"
                      className="min-h-[40px] px-3 rounded-lg bg-[#141821] border border-white/10 text-xs text-[#F8FAFC]"
                    />
                  </div>
                  <button
                    type="submit"
                    className="min-h-[40px] px-5 rounded-lg bg-[#00E5FF] text-[#071018] text-xs font-extrabold"
                  >
                    Save Mirror Link
                  </button>
                </form>

                {/* Attached Mirrors List */}
                <div className="space-y-2">
                  {(managing.sources || []).map((s) => (
                    <div
                      key={s.id}
                      className="p-3 rounded-xl bg-[#0B0D12] border border-white/[0.07] flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-xs font-bold text-[#F8FAFC]">
                          <span>{s.label}</span>
                          <span className="px-1.5 py-0.5 rounded bg-[#10B981]/20 text-[#10B981] text-[10px]">
                            {s.quality}
                          </span>
                          {s.healthStatus === 'ok' && (
                            <span className="text-[10px] text-[#10B981]">● ONLINE</span>
                          )}
                          {s.healthStatus && s.healthStatus !== 'ok' && s.healthStatus !== 'untested' && (
                            <span className="text-[10px] text-rose-400 inline-flex items-center gap-0.5">
                              <AlertCircle className="w-3 h-3" /> {s.healthStatus}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-[#94A3B8] truncate mt-0.5">
                          {s.url}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          const updated = await backendApi.cmsDeleteMovieSource(managing.id, s.id);
                          syncManagingTitle(updated);
                        }}
                        className="min-w-[38px] min-h-[38px] rounded-lg bg-rose-500/15 hover:bg-rose-500 text-rose-300 hover:text-white flex items-center justify-center shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* TV SERIES SEASONS & EPISODES LINK MANAGER */
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                    {(managing.seasons || []).map((sea) => {
                      const linkedCount = (sea.episodes || []).filter(
                        (e) => (e.sources || []).length > 0
                      ).length;
                      const active = sea.seasonNumber === selectedSeasonNum;
                      return (
                        <button
                          key={sea.seasonNumber}
                          type="button"
                          onClick={() => {
                            setSelectedSeasonNum(sea.seasonNumber);
                            setActiveEpNum(null);
                          }}
                          className={`shrink-0 min-h-[40px] px-3.5 rounded-xl border text-xs font-bold ${
                            active
                              ? 'bg-[#00E5FF] border-[#00E5FF] text-[#071018]'
                              : 'bg-[#0B0D12] border-white/10 text-[#CBD5E1]'
                          }`}
                        >
                          {sea.name}{' '}
                          <span className="opacity-80">
                            ({linkedCount}/{sea.episodes?.length || 0})
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => setBulkMode((b) => !b)}
                    className="min-h-[38px] px-3 rounded-lg bg-[#1E2430] hover:bg-[#273041] text-xs font-bold text-[#00E5FF] inline-flex items-center gap-1.5"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    {bulkMode ? 'Close Bulk Paste' : `Bulk Paste Season ${selectedSeasonNum} URLs`}
                  </button>
                </div>

                {bulkMode && (
                  <form
                    onSubmit={handleBulkSeasonLinks}
                    className="rounded-xl bg-[#0B0D12] border border-[#00E5FF]/40 p-4 space-y-2.5"
                  >
                    <div className="text-xs font-bold text-[#00E5FF]">
                      Bulk Link Season {selectedSeasonNum} — Paste 1 Stream URL per line (Line 1 = E01, Line 2 = E02, etc.)
                    </div>
                    <textarea
                      rows={4}
                      required
                      value={bulkUrlsText}
                      onChange={(e) => setBulkUrlsText(e.target.value)}
                      placeholder={`https://cdn.yoursite.com/show/s0${selectedSeasonNum}e01.mp4\nhttps://cdn.yoursite.com/show/s0${selectedSeasonNum}e02.mp4`}
                      className="w-full p-3 rounded-lg bg-[#141821] border border-white/10 text-xs font-mono text-[#F8FAFC]"
                    />
                    <div className="flex items-center gap-2">
                      <select
                        value={epQuality}
                        onChange={(e) => setEpQuality(e.target.value)}
                        className="min-h-[38px] px-3 rounded-lg bg-[#141821] border border-white/10 text-xs text-[#F8FAFC]"
                      >
                        <option value="4K">4K</option>
                        <option value="1080p">1080p</option>
                        <option value="720p">720p</option>
                        <option value="480p">480p</option>
                      </select>
                      <button
                        type="submit"
                        className="min-h-[38px] px-4 rounded-lg bg-[#00E5FF] text-[#071018] text-xs font-extrabold"
                      >
                        Attach All Lines to Season {selectedSeasonNum}
                      </button>
                    </div>
                  </form>
                )}

                {/* Episodes of Selected Season */}
                <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                  {(activeSeasonObj?.episodes || []).map((ep) => {
                    const hasLinks = (ep.sources || []).length > 0;
                    const isAdding = activeEpNum === ep.episodeNumber;
                    return (
                      <div
                        key={ep.id}
                        className="rounded-xl bg-[#0B0D12] border border-white/[0.07] p-3 space-y-2.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="px-1.5 py-0.5 rounded bg-[#1E2430] text-[10px] font-extrabold text-[#00E5FF]">
                                E{String(ep.episodeNumber).padStart(2, '0')}
                              </span>
                              <span className="text-xs font-bold text-[#F8FAFC] truncate">
                                {ep.title}
                              </span>
                              <span
                                className={`text-[10px] font-extrabold ${
                                  hasLinks ? 'text-[#10B981]' : 'text-[#FFB800]'
                                }`}
                              >
                                {hasLinks
                                  ? `● ${ep.sources.length} Link(s) Ready`
                                  : '○ Needs Link (Hidden)'}
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              setActiveEpNum(isAdding ? null : ep.episodeNumber)
                            }
                            className="min-h-[34px] px-3 rounded-lg bg-[#1E2430] hover:bg-[#00E5FF] hover:text-[#071018] text-[11px] font-bold text-[#CBD5E1]"
                          >
                            {isAdding ? 'Cancel' : '+ Add Link'}
                          </button>
                        </div>

                        {/* Existing links on this episode */}
                        {hasLinks && (
                          <div className="space-y-1">
                            {ep.sources.map((s) => (
                              <div
                                key={s.id}
                                className="px-2.5 py-1.5 rounded-lg bg-[#141821] flex items-center justify-between gap-2 text-[11px]"
                              >
                                <span className="font-mono text-[#94A3B8] truncate">
                                  <strong className="text-[#10B981]">{s.quality}</strong> &bull;{' '}
                                  {s.url}
                                </span>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const updated = await backendApi.cmsDeleteEpisodeSource(
                                      managing.id,
                                      selectedSeasonNum,
                                      ep.episodeNumber,
                                      s.id
                                    );
                                    syncManagingTitle(updated);
                                  }}
                                  className="text-rose-400 hover:text-rose-200 shrink-0"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Inline Add Episode Link Form */}
                        {isAdding && (
                          <form
                            onSubmit={(e) => handleAddEpisodeMirror(e, ep.episodeNumber)}
                            className="grid sm:grid-cols-4 gap-2 pt-1"
                          >
                            <input
                              required
                              value={epStreamUrl}
                              onChange={(e) => setEpStreamUrl(e.target.value)}
                              placeholder="Stream URL (.mp4 / .m3u8) *"
                              className="sm:col-span-2 min-h-[38px] px-2.5 rounded-lg bg-[#141821] border border-white/10 text-xs text-[#F8FAFC]"
                            />
                            <input
                              value={epDownloadUrl}
                              onChange={(e) => setEpDownloadUrl(e.target.value)}
                              placeholder="Download URL (optional)"
                              className="min-h-[38px] px-2.5 rounded-lg bg-[#141821] border border-white/10 text-xs text-[#F8FAFC]"
                            />
                            <button
                              type="submit"
                              className="min-h-[38px] rounded-lg bg-[#00E5FF] text-[#071018] text-xs font-extrabold"
                            >
                              Save Link
                            </button>
                          </form>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
