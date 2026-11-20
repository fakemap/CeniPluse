import React, { useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  ChevronRight,
  Play,
  Download,
  Smartphone,
  Tv2,
  Plus,
  Check,
  Star,
  Youtube,
  Send,
  CheckCircle2,
  Share2,
  Film,
  Volume2,
  VolumeX,
  MessageSquarePlus,
  Maximize2,
  Minimize2,
  Server,
  Subtitles,
  X,
} from 'lucide-react';
import type {
  CastMember,
  DownloadRecord,
  EpisodeItem,
  MediaItem,
  MediaSource,
  SeasonSummary,
  UserReviewItem,
} from '../types/media';
import { backendApi, mapTmdbToMediaItem } from '../services/api';
import {
  hasVidLinkSupport,
  isAnimeMedia,
  resolveVidLinkEmbedUrl,
  type VidLinkAnimeAudio,
  type VidLinkPlayerType,
} from '../utils/vidlink';
import { DownloadOptionsModal } from './DownloadOptionsModal';
import { SnippetPlayer } from './SnippetPlayer';

interface MediaDetailViewProps {
  item: MediaItem;
  autoPlayVideo?: boolean;
  catalog: MediaItem[];
  inWatchlist: boolean;
  userEmail: string | null;
  onBack: () => void;
  onToggleWatchlist: (id: string) => void;
  onSelectMedia: (item: MediaItem) => void;
  onOpenAppModal: () => void;
  onRecordDownload: (rec: DownloadRecord) => void;
}

const AVATAR_TONES = [
  'bg-[#0EA5E9]',
  'bg-[#10B981]',
  'bg-[#8B5CF6]',
  'bg-[#EA580C]',
  'bg-[#E11D48]',
  'bg-[#D97706]',
];

export const MediaDetailView: React.FC<MediaDetailViewProps> = ({
  item,
  autoPlayVideo = false,
  catalog,
  inWatchlist,
  userEmail,
  onBack,
  onToggleWatchlist,
  onSelectMedia,
  onOpenAppModal,
  onRecordDownload,
}) => {
  const [enriched, setEnriched] = useState<MediaItem>(item);
  const [loadingDetails, setLoadingDetails] = useState(Boolean(item.tmdbId));
  const [mode, setMode] = useState<'poster' | 'stream' | 'embed' | 'trailer'>('poster');
  const [trailerFullPlayer, setTrailerFullPlayer] = useState(false);
  const [muted, setMuted] = useState(true);
  const [bannerSnippetReady, setBannerSnippetReady] = useState(false);
  const [bannerHasSnippet, setBannerHasSnippet] = useState(false);
  const [previewDismissed, setPreviewDismissed] = useState(false);
  const [heroInView, setHeroInView] = useState(true);
  const [tabVisible, setTabVisible] = useState(() =>
    typeof document !== 'undefined' ? !document.hidden : true
  );
  const [activeVideoKey, setActiveVideoKey] = useState<string>(item.trailerYoutubeId || '');

  // VidLink (vidlink.pro) Embed Player State & Customization Controls
  const [vidlinkPlayerType, setVidlinkPlayerType] = useState<VidLinkPlayerType>('default');
  const [animeAudioType, setAnimeAudioType] = useState<VidLinkAnimeAudio>('sub');
  const [malIdOverride, setMalIdOverride] = useState<string>(() => {
    if (item.malId) return String(item.malId);
    try {
      return localStorage.getItem(`cinepulse_mal_${item.id}`) || '';
    } catch {
      return '';
    }
  });
  const [externalSubUrl, setExternalSubUrl] = useState<string>('');
  const [externalSubLabel, setExternalSubLabel] = useState<string>('English');
  const [showSubConfig, setShowSubConfig] = useState<boolean>(false);

  const [activeSources, setActiveSources] = useState<MediaSource[]>(item.sources || []);
  const [activeSourceIdx, setActiveSourceIdx] = useState(0);
  const [activeEpisodeLabel, setActiveEpisodeLabel] = useState<string>('');
  const [streamError, setStreamError] = useState<string>('');

  const [seasons, setSeasons] = useState<SeasonSummary[]>(item.seasons || []);
  const [selectedSeasonNum, setSelectedSeasonNum] = useState<number>(
    item.seasons?.[0]?.seasonNumber || 1
  );
  const [episodes, setEpisodes] = useState<EpisodeItem[]>(item.seasons?.[0]?.episodes || []);
  const [selectedEpNum, setSelectedEpNum] = useState<number>(
    item.seasons?.[0]?.episodes?.[0]?.episodeNumber || 1
  );
  const [loadingSeason, setLoadingSeason] = useState(false);

  const [synopsisExpanded, setSynopsisExpanded] = useState(false);
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [activeTab, setActiveTab] = useState<'episodes' | 'cast' | 'reviews'>('episodes');

  // Viewer Request state
  const [requesting, setRequesting] = useState(false);
  const [requestCount, setRequestCount] = useState<number>(item.requestCount || 0);
  const [hasRequested, setHasRequested] = useState<boolean>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('cinepulse_requested_ids') || '[]');
      return Array.isArray(saved) && saved.includes(item.id);
    } catch {
      return false;
    }
  });
  const [requestToast, setRequestToast] = useState<string>('');

  // Persisted Reviews state
  const [reviews, setReviews] = useState<UserReviewItem[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [reviewAuthor, setReviewAuthor] = useState<string>(() =>
    userEmail ? userEmail.split('@')[0] : ''
  );
  const [reviewRating, setReviewRating] = useState<number>(9);
  const [reviewText, setReviewText] = useState<string>('');
  const [submittingReview, setSubmittingReview] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const heroSectionRef = useRef<HTMLElement>(null);
  const lastProgressSentRef = useRef<number>(0);
  const episodesSectionRef = useRef<HTMLDivElement>(null);
  const castSectionRef = useRef<HTMLDivElement>(null);
  const reviewsSectionRef = useRef<HTMLDivElement>(null);

  // Scroll to top when item changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [item.id]);

  // Load live TMDB details (cast portraits, official trailers, recommendations, seasons, votes)
  useEffect(() => {
    let mounted = true;
    setEnriched(item);
    setActiveSources(item.sources || []);
    setActiveSourceIdx(0);
    setActiveEpisodeLabel('');
    setStreamError('');
    setSeasons(item.seasons || []);
    setEpisodes(item.seasons?.[0]?.episodes || []);
    setSelectedSeasonNum(item.seasons?.[0]?.seasonNumber || 1);
    setSelectedEpNum(item.seasons?.[0]?.episodes?.[0]?.episodeNumber || 1);
    setActiveVideoKey(item.trailerYoutubeId || '');
    setRequestCount(item.requestCount || 0);
    setRequestToast('');
    setDownloadModalOpen(false);
    setSynopsisExpanded(false);
    setTrailerFullPlayer(false);
    setBannerSnippetReady(false);
    setBannerHasSnippet(false);
    setPreviewDismissed(false);
    setShowSubConfig(false);

    try {
      const savedMal = item.malId
        ? String(item.malId)
        : localStorage.getItem(`cinepulse_mal_${item.id}`) || '';
      setMalIdOverride(savedMal);
    } catch {
      setMalIdOverride(item.malId ? String(item.malId) : '');
    }

    const canAutoEmbed = hasVidLinkSupport(item);
    setMuted(!(autoPlayVideo && (item.sources.length > 0 || canAutoEmbed)));

    try {
      const saved = JSON.parse(localStorage.getItem('cinepulse_requested_ids') || '[]');
      setHasRequested(Array.isArray(saved) && saved.includes(item.id));
    } catch {
      setHasRequested(false);
    }

    if (!item.tmdbId) {
      setLoadingDetails(false);
      if (autoPlayVideo && item.sources.length > 0) {
        setMode('stream');
        setMuted(false);
      } else if (autoPlayVideo && canAutoEmbed) {
        setMode('embed');
        setMuted(false);
      } else {
        setMode('poster');
        setTrailerFullPlayer(false);
      }
      return;
    }

    const controller = new AbortController();
    setLoadingDetails(true);
    backendApi.fetchTmdbDetails(item.type, item.tmdbId, controller.signal).then((det) => {
      if (!mounted || controller.signal.aborted) return;
      setLoadingDetails(false);

      if (!det) {
        if (autoPlayVideo && item.sources.length > 0) {
          setMode('stream');
          setMuted(false);
        } else if (autoPlayVideo && canAutoEmbed) {
          setMode('embed');
          setMuted(false);
        } else {
          setMode('poster');
          setTrailerFullPlayer(false);
        }
        return;
      }

      const mergedSources = [...(det.boundSources || []), ...(item.sources || [])];
      const bestTrailer = det.trailerYoutubeId || item.trailerYoutubeId || '';

      setEnriched((prev) => ({
        ...prev,
        overview: det.overview || prev.overview,
        director: det.director || prev.director,
        releaseDate: det.releaseDate || prev.releaseDate,
        votes: det.votes ?? prev.votes,
        trailerYoutubeId: bestTrailer,
        videos: det.videos || [],
        recommendations: det.recommendations?.length
          ? det.recommendations.map(mapTmdbToMediaItem)
          : [],
        genres: det.genres?.length ? det.genres : prev.genres,
        cast: det.cast?.length ? det.cast.map((c) => c.name) : prev.cast,
        castProfiles: det.cast?.length ? det.cast : prev.castProfiles,
        runtime: det.runtime
          ? `${det.runtime}m`
          : det.numberOfSeasons
          ? `${det.numberOfSeasons} Season${det.numberOfSeasons > 1 ? 's' : ''}`
          : prev.runtime,
        seasons: det.seasons?.length ? det.seasons : prev.seasons,
        sources: mergedSources,
      }));

      setActiveSources(mergedSources);
      setActiveVideoKey(bestTrailer);

      if (det.seasons && det.seasons.length > 0) {
        setSeasons(det.seasons);
        setSelectedSeasonNum(det.seasons[0].seasonNumber);
      }

      if (autoPlayVideo && mergedSources.length > 0) {
        setMode('stream');
        setMuted(false);
      } else if (autoPlayVideo && canAutoEmbed) {
        setMode('embed');
        setMuted(false);
      } else {
        setMode('poster');
        setTrailerFullPlayer(false);
      }
    });

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [item, autoPlayVideo]);

  // Load persisted User Reviews
  useEffect(() => {
    let active = true;
    setLoadingReviews(true);
    backendApi
      .fetchReviews(item.id)
      .then((list) => {
        if (active) setReviews(list);
      })
      .finally(() => {
        if (active) setLoadingReviews(false);
      });
    return () => {
      active = false;
    };
  }, [item.id]);

  // Fetch season episodes dynamically via TMDB (with AbortController)
  useEffect(() => {
    if (enriched.type !== 'series') return;

    const localSeason = (enriched.seasons || []).find(
      (s) => s.seasonNumber === selectedSeasonNum && s.episodes && s.episodes.length > 0
    );
    if (localSeason?.episodes) {
      setEpisodes(localSeason.episodes);
      setSelectedEpNum(localSeason.episodes[0]?.episodeNumber || 1);
      return;
    }

    if (!enriched.tmdbId) return;

    let mounted = true;
    const controller = new AbortController();
    setLoadingSeason(true);
    backendApi
      .fetchTmdbSeason(enriched.tmdbId, selectedSeasonNum, controller.signal)
      .then((res) => {
        if (!mounted || controller.signal.aborted) return;
        setLoadingSeason(false);
        if (res?.episodes) {
          setEpisodes(res.episodes);
          setSelectedEpNum(res.episodes[0]?.episodeNumber || 1);
        } else {
          setEpisodes([]);
        }
      });

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [enriched.type, enriched.tmdbId, enriched.seasons, selectedSeasonNum]);

  const currentSource = activeSources[activeSourceIdx] || activeSources[0];

  // Attach HLS.js / MP4 video player with mirror failover, progress sync & buffer cleanup
  useEffect(() => {
    if (mode !== 'stream' || !currentSource || !videoRef.current) return;
    const video = videoRef.current;
    video.muted = muted;
    let hls: Hls | null = null;
    setStreamError('');

    const progressKey = `cinepulse_prog_${enriched.id}_${activeEpisodeLabel || 'main'}`;
    const savedSec = Number(localStorage.getItem(progressKey) || 0);

    const applyResumeAndPlay = () => {
      if (savedSec > 5 && isFinite(video.duration) && savedSec < video.duration - 10) {
        video.currentTime = savedSec;
      }
      video.play().catch(() => {});
    };

    const handleFatalStreamFailure = () => {
      if (activeSourceIdx + 1 < activeSources.length) {
        setActiveSourceIdx((idx) => idx + 1);
      } else {
        setStreamError(
          'This stream mirror is currently unavailable. Try another quality or watch the official trailer.'
        );
      }
    };

    const onTimeUpdate = () => {
      if (!isFinite(video.duration) || video.currentTime < 3) return;
      const now = Date.now();
      if (now - lastProgressSentRef.current < 5000) return;
      lastProgressSentRef.current = now;
      localStorage.setItem(progressKey, String(Math.floor(video.currentTime)));
      backendApi.saveWatchProgress({
        movieId: enriched.id,
        episodeId: activeEpisodeLabel || null,
        title: enriched.title,
        poster: enriched.backdrop || enriched.poster,
        currentTime: video.currentTime,
        duration: video.duration,
      });
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('error', handleFatalStreamFailure);

    const isHls = currentSource.type === 'hls' || /\.m3u8(\?|$)/i.test(currentSource.url);

    if (isHls && Hls.isSupported()) {
      hls = new Hls({ enableWorker: true });
      hls.loadSource(currentSource.url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, applyResumeAndPlay);
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls?.recoverMediaError();
          } else {
            if (hls) {
              hls.destroy();
              hls = null;
            }
            handleFatalStreamFailure();
          }
        }
      });
    } else {
      video.src = currentSource.url;
      video.onloadedmetadata = () => {
        video.onloadedmetadata = null;
        applyResumeAndPlay();
      };
    }

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('error', handleFatalStreamFailure);
      video.onloadedmetadata = null;
      if (hls) {
        hls.destroy();
        hls = null;
      }
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [
    mode,
    currentSource,
    activeSourceIdx,
    activeSources.length,
    enriched.id,
    enriched.title,
    enriched.backdrop,
    enriched.poster,
    activeEpisodeLabel,
  ]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  useEffect(() => {
    if (mode !== 'trailer') {
      setTrailerFullPlayer(false);
    }
  }, [mode]);

  const parsedMalId = useMemo(() => {
    const num = Number(malIdOverride.trim());
    return num > 0 ? Math.floor(num) : enriched.malId && Number(enriched.malId) > 0 ? Number(enriched.malId) : null;
  }, [malIdOverride, enriched.malId]);

  const canEmbedVidLink = useMemo(
    () => hasVidLinkSupport(enriched) || Boolean(parsedMalId),
    [enriched, parsedMalId]
  );

  const isAnime = useMemo(() => isAnimeMedia(enriched) || Boolean(parsedMalId), [enriched, parsedMalId]);

  const savedStartAtSec = useMemo(() => {
    try {
      const progressKey = `cinepulse_prog_${enriched.id}_${activeEpisodeLabel || 'main'}`;
      const sec = Number(localStorage.getItem(progressKey) || 0);
      return sec > 10 ? Math.floor(sec) : undefined;
    } catch {
      return undefined;
    }
  }, [enriched.id, activeEpisodeLabel]);

  const vidlinkEmbedUrl = useMemo(() => {
    return resolveVidLinkEmbedUrl({
      item: enriched,
      season: selectedSeasonNum,
      episode: selectedEpNum,
      subOrDub: animeAudioType,
      malIdOverride: parsedMalId,
      params: {
        primaryColor: '00E5FF',
        secondaryColor: '141821',
        iconColor: '00E5FF',
        icons: 'vid',
        title: true,
        poster: true,
        autoplay: true,
        nextbutton: true,
        player: vidlinkPlayerType,
        startAt: savedStartAtSec,
        sub_file: externalSubUrl.trim() || undefined,
        sub_label: externalSubLabel.trim() || undefined,
      },
    });
  }, [
    enriched,
    selectedSeasonNum,
    selectedEpNum,
    animeAudioType,
    parsedMalId,
    vidlinkPlayerType,
    savedStartAtSec,
    externalSubUrl,
    externalSubLabel,
  ]);

  // Record initial progress & listen for VidLink MEDIA_DATA postMessages when streaming via VidLink embed
  useEffect(() => {
    if (mode !== 'embed' || !vidlinkEmbedUrl) return;

    const progressKey = `cinepulse_prog_${enriched.id}_${activeEpisodeLabel || 'main'}`;
    const existingSec = Number(localStorage.getItem(progressKey) || 0);
    backendApi.saveWatchProgress({
      movieId: enriched.id,
      episodeId: activeEpisodeLabel || null,
      title: enriched.title,
      poster: enriched.backdrop || enriched.poster,
      currentTime: existingSec > 10 ? existingSec : 120,
      duration: 5400,
    });

    const onMessage = (event: MessageEvent) => {
      if (!event.origin.includes('vidlink.pro')) return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (!data) return;

        if (data.type === 'PLAYER_EVENT' && data.data) {
          const { currentTime, duration } = data.data;
          if (typeof currentTime === 'number' && currentTime > 5) {
            const now = Date.now();
            if (now - lastProgressSentRef.current < 5000) return;
            lastProgressSentRef.current = now;
            localStorage.setItem(progressKey, String(Math.floor(currentTime)));
            backendApi.saveWatchProgress({
              movieId: enriched.id,
              episodeId: activeEpisodeLabel || null,
              title: enriched.title,
              poster: enriched.backdrop || enriched.poster,
              currentTime,
              duration: typeof duration === 'number' && duration > 0 ? duration : 5400,
            });
          }
        } else if (data.type === 'MEDIA_DATA' && data.data) {
          localStorage.setItem('vidLinkProgress', JSON.stringify(data.data));
        }
      } catch {
        // ignore malformed postMessage
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [mode, vidlinkEmbedUrl, enriched.id, enriched.title, enriched.backdrop, enriched.poster, activeEpisodeLabel]);

  const isTheaterMode =
    mode === 'stream' || mode === 'embed' || (mode === 'trailer' && trailerFullPlayer);
  const bannerPreviewActive =
    !isTheaterMode && !previewDismissed && !downloadModalOpen && heroInView && tabVisible;

  useEffect(() => {
    const onVisibility = () => setTabVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    const el = heroSectionRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setHeroInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        setHeroInView(Boolean(entries[0]?.isIntersecting));
      },
      { threshold: 0.2 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isTheaterMode, item.id]);

  const handleRequestTitle = async () => {
    if (requesting) return;
    setRequesting(true);
    try {
      const res = await backendApi.requestMediaTitle(enriched);
      setRequestCount(res.requestCount);
      setHasRequested(true);
      setRequestToast(
        `Requested "${enriched.title}" — our team will prioritize adding stream & download links!`
      );
      try {
        const saved = JSON.parse(localStorage.getItem('cinepulse_requested_ids') || '[]');
        const next = Array.isArray(saved)
          ? Array.from(new Set([...saved, enriched.id]))
          : [enriched.id];
        localStorage.setItem('cinepulse_requested_ids', JSON.stringify(next));
      } catch {
        // ignore storage quota errors
      }
    } catch {
      setRequestToast('Unable to submit request right now. Please try again.');
    } finally {
      setRequesting(false);
    }
  };

  const handleWatchPrimary = () => {
    if (activeSources.length > 0) {
      setMuted(false);
      setMode('stream');
    } else if (canEmbedVidLink) {
      setMuted(false);
      setMode('embed');
    } else if (activeVideoKey) {
      setPreviewDismissed(false);
      setMuted(false);
      setMode('trailer');
      setTrailerFullPlayer(true);
    } else {
      handleRequestTitle();
    }
  };

  const handleSelectEpisode = (ep: EpisodeItem) => {
    setSelectedEpNum(ep.episodeNumber);
    const label = `S${String(ep.seasonNumber).padStart(2, '0')}E${String(
      ep.episodeNumber
    ).padStart(2, '0')} — ${ep.title}`;
    setActiveEpisodeLabel(label);

    if (ep.sources && ep.sources.length > 0) {
      setActiveSources(ep.sources);
      setActiveSourceIdx(0);
      setMuted(false);
      setMode('stream');
    } else if (canEmbedVidLink) {
      setActiveSources([]);
      setMuted(false);
      setMode('embed');
    }
  };

  const handleCopyShareLink = () => {
    try {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewText.trim() || submittingReview) return;
    setSubmittingReview(true);
    try {
      const saved = await backendApi.postReview(enriched.id, {
        author: reviewAuthor.trim() || 'Viewer',
        rating: reviewRating,
        text: reviewText.trim(),
      });
      setReviews((prev) => [saved, ...prev]);
      setReviewText('');
    } finally {
      setSubmittingReview(false);
    }
  };

  const scrollToSection = (
    tab: 'episodes' | 'cast' | 'reviews',
    ref: React.RefObject<HTMLDivElement | null>
  ) => {
    setActiveTab(tab);
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const hasPlayableFullVideo = activeSources.length > 0 || canEmbedVidLink;
  const isSeries = enriched.type === 'series';
  const heroTitle =
    isSeries && seasons.length > 1
      ? `${enriched.title} S1-S${seasons.length}`
      : enriched.title;

  const castList: CastMember[] = useMemo(() => {
    if (enriched.castProfiles && enriched.castProfiles.length > 0) {
      return enriched.castProfiles;
    }
    return (enriched.cast || [])
      .filter((c) => c && !c.toLowerCase().includes('click to view'))
      .map((name) => ({ name, role: 'Cast' }));
  }, [enriched.castProfiles, enriched.cast]);

  const moreLikeThis: MediaItem[] = useMemo(() => {
    if (enriched.recommendations && enriched.recommendations.length > 0) {
      return enriched.recommendations.slice(0, 12);
    }
    const primaryGenre = enriched.genres[0];
    return catalog
      .filter((m) => m.id !== enriched.id && (!primaryGenre || m.genres.includes(primaryGenre)))
      .slice(0, 12);
  }, [enriched.recommendations, enriched.id, enriched.genres, catalog]);

  const selectedEpisodeObj =
    episodes.find((e) => e.episodeNumber === selectedEpNum) || episodes[0] || null;

  const overviewBarContent = (
    <>
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        {/* Bottom-Left: Poster + Title + Metadata + Action Buttons */}
        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4 flex-1 min-w-0">
          <img
            src={enriched.poster}
            alt={enriched.title}
            className="w-24 sm:w-28 aspect-[2/3] rounded-xl object-cover bg-[#141821] border border-white/15 shrink-0 shadow-xl hidden sm:block"
          />

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-white/10 text-[10px] font-extrabold text-[#F8FAFC] uppercase">
                {isSeries ? 'TV Series' : enriched.quality}
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-[#F8FAFC] tracking-tight leading-tight">
                {heroTitle}
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#CBD5E1] tabular-nums">
              <span className="font-bold text-[#10B981]">{enriched.year}</span>
              {enriched.runtime && (
                <>
                  <span className="text-white/30">|</span>
                  <span>{enriched.runtime}</span>
                </>
              )}
              <span className="text-white/30">|</span>
              <span>{enriched.country}</span>
              <span className="text-white/30">|</span>
              <span className="text-[#94A3B8]">{enriched.genres.join(', ')}</span>
            </div>

            <p
              className={`text-xs sm:text-[13px] text-[#CBD5E1]/90 max-w-2xl leading-relaxed ${
                synopsisExpanded ? '' : 'line-clamp-2'
              }`}
            >
              {enriched.overview}{' '}
              {enriched.overview && enriched.overview.length > 130 && (
                <button
                  type="button"
                  onClick={() => setSynopsisExpanded((s) => !s)}
                  className="font-bold text-[#F8FAFC] hover:text-[#00E5FF] ml-1"
                >
                  {synopsisExpanded ? 'Less' : 'More >'}
                </button>
              )}
            </p>

            {/* Primary Action Bar */}
            <div className="pt-1.5 flex flex-wrap items-center gap-2">
              {hasPlayableFullVideo ? (
                <button
                  type="button"
                  onClick={handleWatchPrimary}
                  className="min-h-[40px] px-5 rounded-md bg-[#10B981] hover:brightness-110 text-[#041811] text-xs font-extrabold inline-flex items-center gap-1.5 transition-all"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Watch Online
                </button>
              ) : (
                <button
                  type="button"
                  disabled={requesting}
                  onClick={handleRequestTitle}
                  className={`min-h-[40px] px-5 rounded-md text-xs font-extrabold inline-flex items-center gap-1.5 transition-all ${
                    hasRequested
                      ? 'bg-[#10B981]/20 border border-[#10B981]/50 text-[#10B981]'
                      : 'bg-[#00E5FF] hover:bg-[#33ECFF] text-[#071018]'
                  }`}
                >
                  {hasRequested ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  {requesting
                    ? 'Requesting...'
                    : hasRequested
                    ? `Requested${requestCount > 0 ? ` (${requestCount})` : ''}`
                    : isSeries
                    ? 'Request Series'
                    : 'Request Movie'}
                </button>
              )}

              {activeVideoKey && (
                <button
                  type="button"
                  onClick={() => {
                    if (mode === 'trailer' && trailerFullPlayer) {
                      setTrailerFullPlayer(false);
                      setMode('poster');
                    } else {
                      setPreviewDismissed(false);
                      setMuted(false);
                      setMode('trailer');
                      setTrailerFullPlayer(true);
                    }
                  }}
                  className={`min-h-[40px] px-4 rounded-md border text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${
                    mode === 'trailer' && trailerFullPlayer
                      ? 'bg-[#FFB800] border-[#FFB800] text-[#1A1200]'
                      : 'bg-[#1E2430] border-white/10 text-[#F8FAFC] hover:border-white/25'
                  }`}
                >
                  <Youtube className="w-4 h-4" />
                  {mode === 'trailer' && trailerFullPlayer ? 'Close Trailer' : 'Official Trailer'}
                </button>
              )}

              <button
                type="button"
                onClick={() => setDownloadModalOpen(true)}
                className="min-h-[40px] px-4 rounded-md bg-[#1B222C] hover:bg-[#242D3B] border border-white/15 text-xs font-bold text-[#F8FAFC] inline-flex items-center gap-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-[#10B981]" />
                Download
              </button>

              <button
                type="button"
                onClick={onOpenAppModal}
                className="hidden sm:inline-flex min-h-[40px] px-4 rounded-md bg-[#1B222C] hover:bg-[#242D3B] border border-white/15 text-xs font-bold text-[#F8FAFC] items-center gap-1.5 transition-colors"
              >
                <Smartphone className="w-3.5 h-3.5 text-[#00E5FF]" />
                Watch in App
              </button>

              <button
                type="button"
                onClick={onOpenAppModal}
                className="hidden sm:inline-flex min-h-[40px] px-4 rounded-md bg-[#1B222C] hover:bg-[#242D3B] border border-white/15 text-xs font-bold text-[#F8FAFC] items-center gap-1.5 transition-colors"
              >
                <Tv2 className="w-3.5 h-3.5 text-[#10B981]" />
                Watch on TV
              </button>

              <button
                type="button"
                onClick={() => onToggleWatchlist(enriched.id)}
                className={`min-h-[40px] px-3.5 rounded-md border text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${
                  inWatchlist
                    ? 'bg-[#00E5FF]/15 border-[#00E5FF]/50 text-[#00E5FF]'
                    : 'bg-[#1B222C] border-white/15 text-[#F8FAFC] hover:border-white/30'
                }`}
              >
                {inWatchlist ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                {inWatchlist ? 'In My List' : 'My List'}
              </button>
            </div>
          </div>
        </div>

        {/* Bottom-Right: Rating Readout & Copy Share Link */}
        <div className="flex lg:flex-col items-center lg:items-end justify-between gap-2 shrink-0 pt-2 lg:pt-0">
          <div className="text-left lg:text-right tabular-nums">
            <div className="inline-flex items-baseline gap-1">
              <Star className="w-5 h-5 fill-[#FFB800] text-[#FFB800] self-center" />
              <span className="text-2xl sm:text-3xl font-black text-[#FFB800]">
                {enriched.rating.toFixed(1)}
              </span>
              <span className="text-xs font-bold text-[#94A3B8]">/ 10</span>
            </div>
            <div className="text-[11px] text-[#94A3B8]">
              {enriched.votes
                ? `${enriched.votes.toLocaleString()} people rated`
                : `${Math.max(120, Math.round(enriched.views / 100)).toLocaleString()} people rated`}
            </div>
          </div>

          <button
            type="button"
            onClick={handleCopyShareLink}
            className="min-h-[34px] px-3 rounded-md bg-[#1B222C] hover:bg-[#252E3C] border border-white/15 text-xs font-semibold text-[#CBD5E1] inline-flex items-center gap-1.5 transition-colors"
          >
            <Share2 className="w-3.5 h-3.5" />
            {copiedLink ? 'Link Copied' : 'Share'}
          </button>
        </div>
      </div>

      {requestToast && (
        <div className="mt-3 px-3.5 py-2 rounded-lg bg-[#10B981]/15 border border-[#10B981]/35 text-xs font-bold text-[#10B981] flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{requestToast}</span>
        </div>
      )}
    </>
  );

  return (
    <div className="space-y-6 pb-12">
      {/* Top Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        className="px-4 md:px-0 flex items-center gap-1.5 text-xs text-[#94A3B8]"
      >
        <button
          type="button"
          onClick={onBack}
          className="hover:text-[#F8FAFC] font-medium transition-colors"
        >
          Home
        </button>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-[#CBD5E1] font-semibold">Details</span>
      </nav>

      {/* Full-Width Top Cinema Stage + Media Overview Banner */}
      {!isTheaterMode ? (
        <section
          ref={heroSectionRef}
          className="relative w-full overflow-hidden rounded-none md:rounded-2xl bg-[#0D1017] border-y md:border border-white/[0.08] min-h-[420px] sm:min-h-[480px] md:min-h-[520px] lg:min-h-[560px] xl:min-h-[600px] flex flex-col justify-end"
        >
          {/* Single Unified Full-Bleed Backdrop + Autoplay Snippet Layer (Zero Double-Iframe Leaks) */}
          <div className="absolute inset-0 overflow-hidden bg-black">
            <img
              src={enriched.backdrop || enriched.poster}
              alt={enriched.title}
              className={`w-full h-full object-cover object-center transition-opacity duration-700 ${
                bannerSnippetReady ? 'opacity-0' : 'opacity-100 animate-hero-zoom'
              }`}
            />

            <SnippetPlayer
              item={enriched}
              active={bannerPreviewActive}
              muted={muted}
              variant="hero"
              startDelayMs={300}
              onReadyChange={setBannerSnippetReady}
              onHasSnippetChange={setBannerHasSnippet}
            />
          </div>

          {/* Multi-Stop Gradient Scrims Over Full-Bleed Hero */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0D1017] via-[#0D1017]/55 to-black/25" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0D1017]/85 via-[#0D1017]/30 to-transparent" />

          {/* Floating Banner Controls */}
          {bannerHasSnippet && !previewDismissed && (
            <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMuted((m) => !m)}
                aria-label={muted ? 'Unmute trailer preview' : 'Mute trailer preview'}
                className="w-9 h-9 rounded-full bg-black/65 hover:bg-black/85 border border-white/15 text-white flex items-center justify-center transition-colors"
              >
                {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              {activeVideoKey && (
                <button
                  type="button"
                  onClick={() => {
                    setMuted(false);
                    setMode('trailer');
                    setTrailerFullPlayer(true);
                  }}
                  className="h-9 px-3.5 rounded-full bg-black/65 hover:bg-black/85 border border-white/15 text-xs font-bold text-white inline-flex items-center gap-1.5 transition-colors"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  Full Player
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setPreviewDismissed(true);
                  setBannerSnippetReady(false);
                }}
                aria-label="Stop background preview"
                className="w-9 h-9 rounded-full bg-black/65 hover:bg-black/85 border border-white/15 text-white flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Bottom Info Bar */}
          <div className="relative z-10 px-4 sm:px-6 lg:px-8 pb-5 sm:pb-6 pt-28 md:pt-24">
            {overviewBarContent}
          </div>
        </section>
      ) : (
        <section className="relative w-full overflow-hidden rounded-none md:rounded-2xl bg-[#0D1017] border-y md:border border-white/[0.08]">
          {/* 100% Full-Width Interactive Theater Player Stage */}
          <div className="relative w-full aspect-video max-h-[78vh] bg-black">
            {mode === 'stream' && currentSource ? (
              <>
                <video
                  ref={videoRef}
                  controls
                  playsInline
                  className="w-full h-full object-contain bg-black"
                />
                {streamError && (
                  <div className="absolute inset-0 bg-[#0B0D12]/95 flex flex-col items-center justify-center p-6 text-center gap-3 z-10">
                    <p className="text-sm font-bold text-[#F8FAFC] max-w-md">{streamError}</p>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setStreamError('');
                          setActiveSourceIdx(0);
                        }}
                        className="min-h-[40px] px-4 rounded-full bg-[#00E5FF] text-[#071018] text-xs font-extrabold"
                      >
                        Retry Stream
                      </button>
                      {canEmbedVidLink && (
                        <button
                          type="button"
                          onClick={() => {
                            setStreamError('');
                            setMode('embed');
                          }}
                          className="min-h-[40px] px-4 rounded-full bg-[#10B981] text-[#041811] text-xs font-extrabold"
                        >
                          Switch to VidLink Cloud Server
                        </button>
                      )}
                      {activeVideoKey && (
                        <button
                          type="button"
                          onClick={() => {
                            setStreamError('');
                            setMuted(false);
                            setMode('trailer');
                            setTrailerFullPlayer(true);
                          }}
                          className="min-h-[40px] px-4 rounded-full bg-[#1E2430] border border-white/15 text-xs font-bold text-[#F8FAFC]"
                        >
                          Watch Official Trailer
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setMuted((m) => !m)}
                  aria-label={muted ? 'Unmute video' : 'Mute video'}
                  className="absolute top-3 right-3 z-20 w-9 h-9 rounded-full bg-black/65 hover:bg-black/85 border border-white/15 text-white flex items-center justify-center transition-colors"
                >
                  {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
              </>
            ) : mode === 'embed' && vidlinkEmbedUrl ? (
              <>
                <iframe
                  key={vidlinkEmbedUrl}
                  src={vidlinkEmbedUrl}
                  title={
                    activeEpisodeLabel
                      ? `${enriched.title} — ${activeEpisodeLabel}`
                      : enriched.title
                  }
                  allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                  allowFullScreen
                  frameBorder={0}
                  className="w-full h-full border-0 bg-black"
                />

                {activeEpisodeLabel && (
                  <div className="pointer-events-none absolute top-3 left-3 z-20 px-3 py-1 rounded-full bg-[#0B0D12]/85 backdrop-blur-md border border-[#00E5FF]/35 text-[11px] font-bold text-[#00E5FF]">
                    Now Playing: {activeEpisodeLabel}
                  </div>
                )}

                <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMuted(true);
                      setMode('poster');
                      setTrailerFullPlayer(false);
                    }}
                    className="h-9 px-3.5 rounded-full bg-black/70 hover:bg-black/90 border border-white/15 text-xs font-bold text-white inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Minimize2 className="w-3.5 h-3.5" />
                    Banner View
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMuted(true);
                      setPreviewDismissed(true);
                      setMode('poster');
                      setTrailerFullPlayer(false);
                    }}
                    aria-label="Close player"
                    className="w-9 h-9 rounded-full bg-black/70 hover:bg-black/90 border border-white/15 text-white flex items-center justify-center transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </>
            ) : (
              activeVideoKey && (
                <>
                  <iframe
                    key={`full-${activeVideoKey}`}
                    src={`https://www.youtube.com/embed/${encodeURIComponent(
                      activeVideoKey
                    )}?autoplay=1&rel=0&playsinline=1`}
                    title={`${enriched.title} Official Trailer`}
                    allow="autoplay; encrypted-media; fullscreen"
                    allowFullScreen
                    className="w-full h-full border-0"
                  />

                  <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setMuted(true);
                        setMode('poster');
                        setTrailerFullPlayer(false);
                      }}
                      className="h-9 px-3.5 rounded-full bg-black/70 hover:bg-black/90 border border-white/15 text-xs font-bold text-white inline-flex items-center gap-1.5 transition-colors"
                    >
                      <Minimize2 className="w-3.5 h-3.5" />
                      Banner View
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMuted(true);
                        setPreviewDismissed(true);
                        setMode('poster');
                        setTrailerFullPlayer(false);
                      }}
                      aria-label="Close trailer"
                      className="w-9 h-9 rounded-full bg-black/70 hover:bg-black/90 border border-white/15 text-white flex items-center justify-center transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )
            )}
          </div>

          {/* VidLink & Server Switcher Toolbar Below Active Theater Player */}
          {canEmbedVidLink && (
            <div className="px-4 sm:px-6 lg:px-8 py-3 bg-[#10141D] border-t border-white/[0.08] space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                {/* Server & Player Engine Selection */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#94A3B8] inline-flex items-center gap-1">
                    <Server className="w-3.5 h-3.5 text-[#00E5FF]" />
                    Server:
                  </span>

                  <button
                    type="button"
                    onClick={() => {
                      setVidlinkPlayerType('default');
                      setMode('embed');
                    }}
                    className={`min-h-[34px] px-3 rounded-lg border text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${
                      mode === 'embed' && vidlinkPlayerType === 'default'
                        ? 'bg-[#00E5FF]/15 border-[#00E5FF]/60 text-[#00E5FF]'
                        : 'bg-[#141821] border-white/10 text-[#CBD5E1] hover:border-white/25'
                    }`}
                  >
                    <Play className="w-3 h-3 fill-current" />
                    VidLink Pro (Default)
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setVidlinkPlayerType('jw');
                      setMode('embed');
                    }}
                    className={`min-h-[34px] px-3 rounded-lg border text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${
                      mode === 'embed' && vidlinkPlayerType === 'jw'
                        ? 'bg-[#00E5FF]/15 border-[#00E5FF]/60 text-[#00E5FF]'
                        : 'bg-[#141821] border-white/10 text-[#CBD5E1] hover:border-white/25'
                    }`}
                  >
                    <Play className="w-3 h-3 fill-current" />
                    VidLink (JWPlayer)
                  </button>

                  {activeSources.map((src, idx) => (
                    <button
                      key={src.id}
                      type="button"
                      onClick={() => {
                        setActiveSourceIdx(idx);
                        setMode('stream');
                      }}
                      className={`min-h-[34px] px-3 rounded-lg border text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${
                        mode === 'stream' && activeSourceIdx === idx
                          ? 'bg-[#10B981]/15 border-[#10B981]/60 text-[#10B981]'
                          : 'bg-[#141821] border-white/10 text-[#CBD5E1] hover:border-white/25'
                      }`}
                    >
                      <Play className="w-3 h-3 fill-current" />
                      {src.label || `Custom Mirror ${idx + 1}`} ({src.quality})
                    </button>
                  ))}
                </div>

                {/* Anime Sub/Dub + MAL ID Switcher & External VTT Subtitles */}
                <div className="flex flex-wrap items-center gap-2">
                  {isAnime && (
                    <>
                      <div className="inline-flex items-center rounded-lg bg-[#141821] border border-white/10 p-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            setAnimeAudioType('sub');
                            setMode('embed');
                          }}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-extrabold uppercase transition-colors ${
                            animeAudioType === 'sub'
                              ? 'bg-[#00E5FF] text-[#071018]'
                              : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                          }`}
                        >
                          SUB
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAnimeAudioType('dub');
                            setMode('embed');
                          }}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-extrabold uppercase transition-colors ${
                            animeAudioType === 'dub'
                              ? 'bg-[#00E5FF] text-[#071018]'
                              : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                          }`}
                        >
                          DUB
                        </button>
                      </div>

                      <div className="inline-flex items-center gap-1.5">
                        <span className="text-[11px] font-bold text-[#94A3B8]">MAL ID:</span>
                        <input
                          type="number"
                          min="1"
                          value={malIdOverride}
                          onChange={(e) => {
                            const val = e.target.value;
                            setMalIdOverride(val);
                            try {
                              if (val.trim()) {
                                localStorage.setItem(`cinepulse_mal_${enriched.id}`, val.trim());
                              } else {
                                localStorage.removeItem(`cinepulse_mal_${enriched.id}`);
                              }
                            } catch {
                              // ignore storage errors
                            }
                          }}
                          placeholder="TMDB Fallback"
                          title="Enter MyAnimeList ID to use /anime/{MALid}/{ep}/{subOrDub}?fallback=true, or leave empty to use TMDB fallback"
                          className="w-28 h-8 px-2.5 rounded-lg bg-[#141821] border border-white/10 focus:border-[#00E5FF] text-xs font-bold text-[#F8FAFC] outline-none"
                        />
                      </div>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowSubConfig((v) => !v)}
                    className={`min-h-[34px] px-3 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                      showSubConfig || externalSubUrl.trim()
                        ? 'bg-[#00E5FF]/15 border-[#00E5FF]/50 text-[#00E5FF]'
                        : 'bg-[#141821] border-white/10 text-[#CBD5E1] hover:border-white/25'
                    }`}
                  >
                    <Subtitles className="w-3.5 h-3.5" />
                    {externalSubUrl.trim() ? `Sub: ${externalSubLabel || 'VTT'}` : 'External .VTT'}
                  </button>
                </div>
              </div>

              {showSubConfig && (
                <div className="pt-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    type="url"
                    value={externalSubUrl}
                    onChange={(e) => setExternalSubUrl(e.target.value)}
                    placeholder="Direct .vtt subtitle URL (e.g. https://example.com/subtitles.vtt)"
                    className="flex-1 min-h-[36px] px-3 rounded-lg bg-[#0B0D12] border border-white/10 focus:border-[#00E5FF] text-xs text-[#F8FAFC] outline-none"
                  />
                  <input
                    type="text"
                    value={externalSubLabel}
                    onChange={(e) => setExternalSubLabel(e.target.value)}
                    placeholder="Subtitle label (e.g. English)"
                    className="sm:w-40 min-h-[36px] px-3 rounded-lg bg-[#0B0D12] border border-white/10 focus:border-[#00E5FF] text-xs text-[#F8FAFC] outline-none"
                  />
                  {externalSubUrl.trim() && (
                    <button
                      type="button"
                      onClick={() => setExternalSubUrl('')}
                      className="min-h-[36px] px-3 rounded-lg bg-[#1E2430] text-xs font-bold text-[#94A3B8] hover:text-white"
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Clean Stacked Overview & Actions Below Player (Zero Controls Collision) */}
          <div className="relative z-10 px-4 sm:px-6 lg:px-8 py-5 bg-[#0D1017] border-t border-white/[0.07]">
            {overviewBarContent}
          </div>
        </section>
      )}

      {/* Two-Column Body: Left (Episodes/Quality + Top Cast + User Reviews) | Right (More like this) */}
      <div className="px-4 md:px-0 grid grid-cols-1 xl:grid-cols-[1fr_290px] gap-7 items-start">
        {/* LEFT MAIN COLUMN */}
        <div className="min-w-0 space-y-8">
          {/* Sub-navigation Jump Tabs */}
          <div className="flex items-center gap-6 border-b border-white/[0.08]">
            <button
              type="button"
              onClick={() => scrollToSection('episodes', episodesSectionRef)}
              className={`pb-3 text-sm font-bold border-b-2 transition-colors ${
                activeTab === 'episodes'
                  ? 'border-[#F8FAFC] text-[#F8FAFC]'
                  : 'border-transparent text-[#94A3B8] hover:text-[#F8FAFC]'
              }`}
            >
              {isSeries ? 'Episodes' : 'Quality & Streams'}
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('cast', castSectionRef)}
              className={`pb-3 text-sm font-bold border-b-2 transition-colors ${
                activeTab === 'cast'
                  ? 'border-[#F8FAFC] text-[#F8FAFC]'
                  : 'border-transparent text-[#94A3B8] hover:text-[#F8FAFC]'
              }`}
            >
              Top Cast ({castList.length})
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('reviews', reviewsSectionRef)}
              className={`pb-3 text-sm font-bold border-b-2 transition-colors ${
                activeTab === 'reviews'
                  ? 'border-[#F8FAFC] text-[#F8FAFC]'
                  : 'border-transparent text-[#94A3B8] hover:text-[#F8FAFC]'
              }`}
            >
              User Review ({reviews.length})
            </button>
          </div>

          {/* SECTION 1: EPISODES (Series) or STREAMS & REQUEST (Movies) */}
          <div ref={episodesSectionRef} className="space-y-4">
            {isSeries ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-extrabold text-[#F8FAFC]">Episodes</h2>
                  {seasons.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {seasons.map((s) => (
                        <button
                          key={s.seasonNumber}
                          type="button"
                          onClick={() => setSelectedSeasonNum(s.seasonNumber)}
                          className={`px-3 py-1 rounded-md text-xs font-bold border transition-colors ${
                            selectedSeasonNum === s.seasonNumber
                              ? 'bg-[#F8FAFC] border-[#F8FAFC] text-[#071018]'
                              : 'bg-[#141821] border-white/[0.08] text-[#CBD5E1] hover:border-white/25'
                          }`}
                        >
                          {s.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Quality Indicator Strip + Anime Sub/Dub Toggle */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    {(activeSources.length > 0
                      ? activeSources.map((s) => s.quality)
                      : ['4K', '1080p', '720p', '480p']
                    ).map((q, i) => (
                      <span
                        key={`${q}-${i}`}
                        className="px-2.5 py-1 rounded bg-[#1B222C] border border-white/[0.08] font-bold text-[#CBD5E1]"
                      >
                        {q}
                      </span>
                    ))}
                    {canEmbedVidLink && (
                      <span className="px-2.5 py-1 rounded bg-[#00E5FF]/15 border border-[#00E5FF]/40 font-extrabold text-[#00E5FF]">
                        {parsedMalId
                          ? `VidLink Anime (MAL #${parsedMalId} • ${animeAudioType.toUpperCase()})`
                          : 'VidLink Cloud Stream Ready'}
                      </span>
                    )}
                    {loadingSeason && (
                      <span className="text-xs text-[#00E5FF] font-semibold">Loading episodes...</span>
                    )}
                  </div>

                  {isAnime && (
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="inline-flex items-center rounded-lg bg-[#141821] border border-white/10 p-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            setAnimeAudioType('sub');
                            if (canEmbedVidLink) setMode('embed');
                          }}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-extrabold uppercase transition-colors ${
                            animeAudioType === 'sub'
                              ? 'bg-[#00E5FF] text-[#071018]'
                              : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                          }`}
                        >
                          SUB
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAnimeAudioType('dub');
                            if (canEmbedVidLink) setMode('embed');
                          }}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-extrabold uppercase transition-colors ${
                            animeAudioType === 'dub'
                              ? 'bg-[#00E5FF] text-[#071018]'
                              : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                          }`}
                        >
                          DUB
                        </button>
                      </div>
                      <input
                        type="number"
                        min="1"
                        value={malIdOverride}
                        onChange={(e) => {
                          const val = e.target.value;
                          setMalIdOverride(val);
                          try {
                            if (val.trim()) {
                              localStorage.setItem(`cinepulse_mal_${enriched.id}`, val.trim());
                            } else {
                              localStorage.removeItem(`cinepulse_mal_${enriched.id}`);
                            }
                          } catch {
                            // ignore
                          }
                        }}
                        placeholder="MAL ID (optional)"
                        className="w-32 h-8 px-2.5 rounded-lg bg-[#141821] border border-white/10 focus:border-[#00E5FF] text-xs font-bold text-[#F8FAFC] outline-none"
                      />
                    </div>
                  )}
                </div>

                {episodes.length > 0 ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {episodes.map((ep) => {
                        const isSelected = ep.episodeNumber === selectedEpNum;
                        const epReady =
                          Boolean(ep.sources && ep.sources.length > 0) || canEmbedVidLink;
                        return (
                          <button
                            key={ep.id}
                            type="button"
                            onClick={() => handleSelectEpisode(ep)}
                            title={ep.title}
                            className={`min-w-[44px] h-10 px-2.5 rounded-lg border text-xs font-extrabold tabular-nums transition-colors ${
                              isSelected
                                ? 'bg-[#10B981]/15 border-[#10B981]/60 text-[#10B981]'
                                : epReady
                                ? 'bg-[#141821] border-[#00E5FF]/35 text-[#F8FAFC] hover:border-[#00E5FF]'
                                : 'bg-[#141821] border-white/[0.08] text-[#94A3B8] hover:text-[#F8FAFC]'
                            }`}
                          >
                            {String(ep.episodeNumber).padStart(2, '0')}
                          </button>
                        );
                      })}
                    </div>

                    {selectedEpisodeObj && (
                      <div className="rounded-xl bg-[#141821] border border-white/[0.07] p-3.5 flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-extrabold text-[#F8FAFC]">
                            S{String(selectedEpisodeObj.seasonNumber).padStart(2, '0')}E
                            {String(selectedEpisodeObj.episodeNumber).padStart(2, '0')} &bull;{' '}
                            {selectedEpisodeObj.title}
                          </div>
                          <p className="text-xs text-[#94A3B8] line-clamp-2 mt-0.5">
                            {selectedEpisodeObj.overview || 'No episode description available.'}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {(Boolean(selectedEpisodeObj.sources?.length) || canEmbedVidLink) && (
                            <button
                              type="button"
                              onClick={() => handleSelectEpisode(selectedEpisodeObj)}
                              className="min-h-[38px] px-4 rounded-md bg-[#10B981] hover:brightness-110 text-[#041811] text-xs font-extrabold inline-flex items-center gap-1.5"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              Watch Episode
                            </button>
                          )}

                          {!selectedEpisodeObj.sources?.length && (
                            <button
                              type="button"
                              disabled={requesting}
                              onClick={handleRequestTitle}
                              className={`min-h-[38px] px-3.5 rounded-md text-xs font-bold inline-flex items-center gap-1.5 ${
                                hasRequested
                                  ? 'bg-[#10B981]/15 border border-[#10B981]/40 text-[#10B981]'
                                  : 'bg-[#1E2430] hover:bg-[#273041] border border-white/10 text-[#CBD5E1]'
                              }`}
                            >
                              {hasRequested ? (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              ) : (
                                <Send className="w-3.5 h-3.5" />
                              )}
                              {hasRequested ? 'Requested' : 'Request Direct Download'}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-[#94A3B8]">
                    {loadingDetails ? 'Loading episodes from TMDB...' : 'Episode list synced on demand.'}
                  </p>
                )}
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-extrabold text-[#F8FAFC]">Streams &amp; Quality</h2>
                  {isAnime && (
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="inline-flex items-center rounded-lg bg-[#141821] border border-white/10 p-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            setAnimeAudioType('sub');
                            if (canEmbedVidLink) setMode('embed');
                          }}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-extrabold uppercase transition-colors ${
                            animeAudioType === 'sub'
                              ? 'bg-[#00E5FF] text-[#071018]'
                              : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                          }`}
                        >
                          SUB
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAnimeAudioType('dub');
                            if (canEmbedVidLink) setMode('embed');
                          }}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-extrabold uppercase transition-colors ${
                            animeAudioType === 'dub'
                              ? 'bg-[#00E5FF] text-[#071018]'
                              : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                          }`}
                        >
                          DUB
                        </button>
                      </div>
                      <input
                        type="number"
                        min="1"
                        value={malIdOverride}
                        onChange={(e) => {
                          const val = e.target.value;
                          setMalIdOverride(val);
                          try {
                            if (val.trim()) {
                              localStorage.setItem(`cinepulse_mal_${enriched.id}`, val.trim());
                            } else {
                              localStorage.removeItem(`cinepulse_mal_${enriched.id}`);
                            }
                          } catch {
                            // ignore
                          }
                        }}
                        placeholder="MAL ID (optional)"
                        className="w-32 h-8 px-2.5 rounded-lg bg-[#141821] border border-white/10 focus:border-[#00E5FF] text-xs font-bold text-[#F8FAFC] outline-none"
                      />
                    </div>
                  )}
                </div>

                {(activeSources.length > 0 || canEmbedVidLink) && (
                  <div className="flex flex-wrap gap-2">
                    {canEmbedVidLink && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setVidlinkPlayerType('default');
                            setMode('embed');
                          }}
                          className={`min-h-[40px] px-4 rounded-lg border text-xs font-bold inline-flex items-center gap-2 transition-colors ${
                            mode === 'embed' && vidlinkPlayerType === 'default'
                              ? 'bg-[#00E5FF]/15 border-[#00E5FF]/60 text-[#00E5FF]'
                              : 'bg-[#141821] border-white/[0.08] text-[#F8FAFC] hover:border-white/25'
                          }`}
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>
                            {parsedMalId
                              ? `VidLink Anime (${animeAudioType.toUpperCase()})`
                              : 'VidLink Cloud Stream'}
                          </span>
                          <span className="text-[#94A3B8] font-normal">(1080p Auto)</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setVidlinkPlayerType('jw');
                            setMode('embed');
                          }}
                          className={`min-h-[40px] px-4 rounded-lg border text-xs font-bold inline-flex items-center gap-2 transition-colors ${
                            mode === 'embed' && vidlinkPlayerType === 'jw'
                              ? 'bg-[#00E5FF]/15 border-[#00E5FF]/60 text-[#00E5FF]'
                              : 'bg-[#141821] border-white/[0.08] text-[#F8FAFC] hover:border-white/25'
                          }`}
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>VidLink JWPlayer</span>
                          <span className="text-[#94A3B8] font-normal">(1080p)</span>
                        </button>
                      </>
                    )}

                    {activeSources.map((src, idx) => (
                      <button
                        key={src.id}
                        type="button"
                        onClick={() => {
                          setActiveSourceIdx(idx);
                          setMode('stream');
                        }}
                        className={`min-h-[40px] px-4 rounded-lg border text-xs font-bold inline-flex items-center gap-2 transition-colors ${
                          mode === 'stream' && activeSourceIdx === idx
                            ? 'bg-[#10B981]/15 border-[#10B981]/50 text-[#10B981]'
                            : 'bg-[#141821] border-white/[0.08] text-[#F8FAFC] hover:border-white/25'
                        }`}
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>{src.quality}</span>
                        <span className="text-[#94A3B8] font-normal">({src.size})</span>
                      </button>
                    ))}
                  </div>
                )}

                {activeSources.length === 0 && (
                  <div className="rounded-xl bg-[#141821] border border-white/[0.08] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="text-xs text-[#94A3B8] leading-relaxed">
                      {canEmbedVidLink ? (
                        <>
                          <strong className="text-[#F8FAFC]">
                            Instant streaming is active via VidLink Cloud.
                          </strong>{' '}
                          Want a direct offline MP4 download mirror added for this title? Submit a
                          request below!
                        </>
                      ) : (
                        <>
                          <strong className="text-[#F8FAFC]">Stream link not added yet.</strong>{' '}
                          Request this movie so our team knows you want to watch it and prioritizes
                          adding the stream &amp; download mirrors!
                        </>
                      )}
                      {requestCount > 0 && (
                        <span className="ml-2 px-2 py-0.5 rounded bg-[#FFB800]/15 text-[#FFB800] font-bold tabular-nums">
                          {requestCount} request{requestCount > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={requesting}
                      onClick={handleRequestTitle}
                      className={`shrink-0 min-h-[40px] px-4 rounded-md text-xs font-extrabold inline-flex items-center gap-1.5 transition-colors ${
                        hasRequested
                          ? 'bg-[#10B981]/20 border border-[#10B981]/45 text-[#10B981]'
                          : 'bg-[#00E5FF] hover:bg-[#33ECFF] text-[#071018]'
                      }`}
                    >
                      {hasRequested ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                      {hasRequested
                        ? 'Requested'
                        : canEmbedVidLink
                        ? 'Request Direct Download'
                        : 'Request This Movie'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* SECTION 2: TOP CAST WITH PORTRAIT CARDS */}
          <div ref={castSectionRef} className="space-y-3">
            <h2 className="text-base font-extrabold text-[#F8FAFC]">
              Top Cast ({castList.length})
            </h2>

            {castList.length > 0 ? (
              <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
                {castList.map((member) => (
                  <div
                    key={`${member.name}-${member.role}`}
                    className="shrink-0 w-28 sm:w-32 space-y-1.5"
                  >
                    <div className="aspect-[2/3] rounded-xl overflow-hidden bg-[#141821] border border-white/[0.08]">
                      {member.photo ? (
                        <img
                          src={member.photo}
                          alt={member.name}
                          loading="lazy"
                          className="w-full h-full object-cover object-top"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-[#1B222C] text-xl font-black text-[#94A3B8]">
                          {member.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="text-xs font-bold text-[#F8FAFC] line-clamp-1">
                      {member.name}
                    </div>
                    {member.role && (
                      <div className="text-[11px] text-[#94A3B8] line-clamp-1">
                        {member.role}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[#94A3B8]">
                {loadingDetails
                  ? 'Loading cast profiles from TMDB...'
                  : 'Cast details unavailable for this title.'}
              </p>
            )}
          </div>

          {/* SECTION 3: USER REVIEWS (Persisted via Backend) */}
          <div ref={reviewsSectionRef} className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-extrabold text-[#F8FAFC]">User Review</h2>
              <span className="text-xs text-[#94A3B8] tabular-nums">
                {reviews.length} review{reviews.length === 1 ? '' : 's'}
              </span>
            </div>

            {/* Write a Review Form */}
            <form
              onSubmit={handleSubmitReview}
              className="rounded-xl bg-[#141821] border border-white/[0.08] p-4 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#F8FAFC] inline-flex items-center gap-1.5">
                  <MessageSquarePlus className="w-4 h-4 text-[#00E5FF]" />
                  Share your review
                </span>

                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-[#94A3B8]">Your Rating:</span>
                  <select
                    value={reviewRating}
                    onChange={(e) => setReviewRating(Number(e.target.value))}
                    aria-label="Your review rating"
                    className="h-8 px-2 rounded-lg bg-[#0B0D12] border border-white/10 text-xs font-bold text-[#FFB800]"
                  >
                    {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((n) => (
                      <option key={n} value={n}>
                        {n} / 10
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid sm:grid-cols-[200px_1fr] gap-2.5">
                <input
                  type="text"
                  value={reviewAuthor}
                  onChange={(e) => setReviewAuthor(e.target.value)}
                  placeholder="Your name"
                  className="min-h-[40px] px-3 rounded-lg bg-[#0B0D12] border border-white/10 focus:border-[#00E5FF] text-xs text-[#F8FAFC] outline-none"
                />
                <input
                  type="text"
                  required
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                  placeholder={`Write your thoughts on ${enriched.title}...`}
                  className="min-h-[40px] px-3 rounded-lg bg-[#0B0D12] border border-white/10 focus:border-[#00E5FF] text-xs text-[#F8FAFC] outline-none"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={submittingReview || !reviewText.trim()}
                  className="min-h-[38px] px-5 rounded-md bg-[#00E5FF] hover:bg-[#33ECFF] disabled:opacity-50 text-[#071018] text-xs font-extrabold transition-colors"
                >
                  {submittingReview ? 'Posting...' : 'Post Review'}
                </button>
              </div>
            </form>

            {/* Existing Reviews List */}
            {loadingReviews ? (
              <div className="h-20 rounded-xl skeleton-shimmer" />
            ) : reviews.length === 0 ? (
              <div className="rounded-xl bg-[#141821] border border-white/[0.06] p-6 text-center text-xs text-[#94A3B8]">
                No user reviews yet — be the first to review {enriched.title}!
              </div>
            ) : (
              <div className="space-y-2.5">
                {reviews.map((rev, idx) => (
                  <div
                    key={rev.id}
                    className="rounded-xl bg-[#141821] border border-white/[0.07] p-4 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`w-8 h-8 rounded-full ${
                            AVATAR_TONES[idx % AVATAR_TONES.length]
                          } text-white text-xs font-extrabold flex items-center justify-center shrink-0`}
                        >
                          {rev.author.slice(0, 1).toUpperCase()}
                        </span>
                        <div>
                          <div className="text-xs font-bold text-[#F8FAFC]">{rev.author}</div>
                          <div className="text-[10.5px] text-[#94A3B8] tabular-nums">
                            {new Date(rev.createdAt).toLocaleString()}
                          </div>
                        </div>
                      </div>

                      <span className="px-2 py-0.5 rounded bg-[#FFB800]/15 text-[#FFB800] text-[11px] font-bold inline-flex items-center gap-1 tabular-nums">
                        <Star className="w-3 h-3 fill-[#FFB800]" />
                        {rev.rating}/10
                      </span>
                    </div>

                    <p className="text-xs sm:text-[13px] text-[#CBD5E1] leading-relaxed">
                      {rev.text}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT SIDEBAR: MORE LIKE THIS (2-Column Recommendations Grid) */}
        <aside className="space-y-3">
          <h2 className="text-base font-extrabold text-[#F8FAFC]">More like this</h2>

          {moreLikeThis.length > 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-2 gap-3">
              {moreLikeThis.map((rec) => (
                <button
                  key={rec.id}
                  type="button"
                  onClick={() => onSelectMedia(rec)}
                  className="group text-left space-y-1.5"
                >
                  <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-[#141821] border border-white/[0.08] group-hover:border-[#00E5FF]/50 transition-colors">
                    {rec.poster ? (
                      <img
                        src={rec.poster}
                        alt={rec.title}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center p-2 text-center text-xs text-[#94A3B8]">
                        <Film className="w-6 h-6 opacity-50" />
                      </div>
                    )}
                    <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-[#0B0D12]/80 text-[10px] font-bold text-[#FFB800] inline-flex items-center gap-0.5 tabular-nums">
                      <Star className="w-2.5 h-2.5 fill-[#FFB800]" />
                      {rec.rating.toFixed(1)}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-[#CBD5E1] group-hover:text-[#00E5FF] line-clamp-1 transition-colors">
                    {rec.title}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[#94A3B8]">Recommendations load automatically with TMDB details.</p>
          )}
        </aside>
      </div>

      {/* Download Options Dialog */}
      {downloadModalOpen && (
        <DownloadOptionsModal
          item={enriched}
          seasons={seasons}
          episodes={episodes}
          selectedSeasonNum={selectedSeasonNum}
          onSelectSeason={setSelectedSeasonNum}
          activeSources={activeSources}
          onClose={() => setDownloadModalOpen(false)}
          onRequestTitle={handleRequestTitle}
          hasRequested={hasRequested}
          requesting={requesting}
          onRecordDownload={onRecordDownload}
        />
      )}
    </div>
  );
};
