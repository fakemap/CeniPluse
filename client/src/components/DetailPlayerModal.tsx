import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  X,
  Play,
  Download,
  Star,
  Plus,
  Check,
  Youtube,
  Server,
  Globe,
  Clock,
  Tv,
  Link2,
  HardDrive,
  Film,
  Send,
  CheckCircle2,
} from 'lucide-react';
import type {
  EpisodeItem,
  LocalMediaFile,
  MediaItem,
  MediaSource,
  SeasonSummary,
} from '../types/media';
import { backendApi, mapTmdbToMediaItem } from '../services/api';
import { hasVidLinkSupport, resolveVidLinkEmbedUrl } from '../utils/vidlink';

interface DetailPlayerModalProps {
  item: MediaItem;
  autoPlayVideo?: boolean;
  inWatchlist: boolean;
  onClose: () => void;
  onToggleWatchlist: (id: string) => void;
  onSelectRecommendation?: (item: MediaItem) => void;
}

export const DetailPlayerModal: React.FC<DetailPlayerModalProps> = ({
  item,
  autoPlayVideo = false,
  inWatchlist,
  onClose,
  onToggleWatchlist,
  onSelectRecommendation,
}) => {
  const [enriched, setEnriched] = useState<MediaItem>(item);
  const [loadingDetails, setLoadingDetails] = useState(Boolean(item.tmdbId));
  const [mode, setMode] = useState<'stream' | 'embed' | 'trailer' | 'poster'>('poster');
  const [activeVideoKey, setActiveVideoKey] = useState<string>(item.trailerYoutubeId || '');

  // Active playback target: either the movie itself or a specific series episode
  const [activeSources, setActiveSources] = useState<MediaSource[]>(item.sources || []);
  const [activeSourceIdx, setActiveSourceIdx] = useState(0);
  const [activeEpisodeLabel, setActiveEpisodeLabel] = useState<string>('');

  // Series Seasons & Episodes state
  const [seasons, setSeasons] = useState<SeasonSummary[]>(item.seasons || []);
  const [selectedSeasonNum, setSelectedSeasonNum] = useState<number>(
    item.seasons?.[0]?.seasonNumber || 1
  );
  const [selectedEpNum, setSelectedEpNum] = useState<number>(
    item.seasons?.[0]?.episodes?.[0]?.episodeNumber || 1
  );
  const [episodes, setEpisodes] = useState<EpisodeItem[]>(
    item.seasons?.[0]?.episodes || []
  );
  const [loadingSeason, setLoadingSeason] = useState(false);

  // Bind Local File / Custom URL drawer state
  const [bindTarget, setBindTarget] = useState<{
    title: string;
    season?: number;
    episode?: number;
  } | null>(null);
  const [bindUrl, setBindUrl] = useState('');
  const [bindQuality, setBindQuality] = useState('1080p');
  const [bindSaving, setBindSaving] = useState(false);
  const [localFiles, setLocalFiles] = useState<LocalMediaFile[]>([]);
  const [synopsisExpanded, setSynopsisExpanded] = useState(false);
  const [streamError, setStreamError] = useState<string>('');
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

  const videoRef = useRef<HTMLVideoElement>(null);
  const lastProgressSentRef = useRef<number>(0);

  // Lock background body scroll & close on Escape
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Load live TMDB details: real cast, real official trailers, watch providers, bound sources & real seasons!
  useEffect(() => {
    let mounted = true;
    setEnriched(item);
    setActiveSources(item.sources || []);
    setActiveEpisodeLabel('');
    setSeasons(item.seasons || []);
    setEpisodes(item.seasons?.[0]?.episodes || []);
    setSelectedSeasonNum(item.seasons?.[0]?.seasonNumber || 1);
    setActiveVideoKey(item.trailerYoutubeId || '');
    setRequestCount(item.requestCount || 0);
    setRequestToast('');
    try {
      const saved = JSON.parse(localStorage.getItem('cinepulse_requested_ids') || '[]');
      setHasRequested(Array.isArray(saved) && saved.includes(item.id));
    } catch {
      setHasRequested(false);
    }

    // If custom non-TMDB item, auto-play its stream or trailer if requested
    if (!item.tmdbId) {
      setLoadingDetails(false);
      if (autoPlayVideo) {
        if (item.sources.length > 0) setMode('stream');
        else if (hasVidLinkSupport(item)) setMode('embed');
        else if (item.trailerYoutubeId) setMode('trailer');
        else setMode('poster');
      } else {
        setMode('poster');
      }
      return;
    }

    const controller = new AbortController();
    setLoadingDetails(true);
    backendApi.fetchTmdbDetails(item.type, item.tmdbId, controller.signal).then((det) => {
      if (!mounted || controller.signal.aborted) return;
      setLoadingDetails(false);

      if (!det) {
        if (autoPlayVideo && item.sources.length > 0) setMode('stream');
        else if (autoPlayVideo && hasVidLinkSupport(item)) setMode('embed');
        return;
      }

      const mergedSources = [...(det.boundSources || []), ...(item.sources || [])];
      const bestTrailer = det.trailerYoutubeId || item.trailerYoutubeId || '';

      setEnriched((prev) => ({
        ...prev,
        overview: det.overview || prev.overview,
        director: det.director || prev.director,
        trailerYoutubeId: bestTrailer,
        videos: det.videos || [],
        imdbId: det.imdbId || prev.imdbId,
        imdbRating: det.imdbRating ?? prev.imdbRating,
        imdbVotes: det.imdbVotes ?? prev.imdbVotes,
        recommendations: det.recommendations?.length
          ? det.recommendations.map(mapTmdbToMediaItem)
          : [],
        genres: det.genres?.length ? det.genres : prev.genres,
        cast: det.cast?.length ? det.cast.map((c) => c.name) : prev.cast,
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

      // Auto-play the full video:
      // 1) Custom/local bound stream if available, else 2) VidLink stream for TMDB/MAL titles, else 3) Official YouTube trailer
      if (autoPlayVideo) {
        if (mergedSources.length > 0) {
          setMode('stream');
        } else if (hasVidLinkSupport(item)) {
          setMode('embed');
        } else if (bestTrailer) {
          setMode('trailer');
        }
      }
    });

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [item, autoPlayVideo]);

  // Fetch real episodes whenever a TV series season is selected (with AbortController)
  useEffect(() => {
    if (enriched.type !== 'series') return;

    const localSeason = (enriched.seasons || []).find(
      (s) => s.seasonNumber === selectedSeasonNum && s.episodes && s.episodes.length > 0
    );
    if (localSeason?.episodes) {
      setEpisodes(localSeason.episodes);
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
        } else {
          setEpisodes([]);
        }
      });

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [enriched.type, enriched.tmdbId, enriched.seasons, selectedSeasonNum]);

  // Load PC local media files when user opens the Link Video panel
  useEffect(() => {
    if (!bindTarget) return;
    backendApi.scanLocalDrive().then((res) => setLocalFiles(res.files || []));
  }, [bindTarget]);

  const currentSource = activeSources[activeSourceIdx] || activeSources[0];

  // Attach HLS.js or direct HTML5 video with automatic mirror failover, resume progress & full buffer teardown
  useEffect(() => {
    if (mode !== 'stream' || !currentSource || !videoRef.current) return;
    const video = videoRef.current;
    let hls: Hls | null = null;
    setStreamError('');

    const progressKey = `cinepulse_prog_${enriched.id}_${activeEpisodeLabel || 'main'}`;
    const savedSec = Number(localStorage.getItem(progressKey) || 0);

    const applyResumeAndPlay = () => {
      if (
        savedSec > 5 &&
        isFinite(video.duration) &&
        savedSec < video.duration - 10
      ) {
        video.currentTime = savedSec;
      }
      video.play().catch(() => {});
    };

    const handleFatalStreamFailure = () => {
      if (activeSourceIdx + 1 < activeSources.length) {
        setActiveSourceIdx((idx) => idx + 1);
      } else {
        setStreamError(
          'This stream mirror is currently unavailable or timed out. Try another server or switch to the official trailer.'
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

    const isHls =
      currentSource.type === 'hls' || /\.m3u8(\?|$)/i.test(currentSource.url);

    if (isHls && Hls.isSupported()) {
      hls = new Hls({ enableWorker: true });
      hls.loadSource(currentSource.url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        applyResumeAndPlay();
      });
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
      video.load(); // Forces browser media decoder buffer release
    };
  }, [mode, currentSource, activeSourceIdx, activeSources.length, enriched.id, enriched.title, enriched.backdrop, enriched.poster, activeEpisodeLabel]);

  const handleRequestTitle = async () => {
    if (requesting) return;
    setRequesting(true);
    try {
      const res = await backendApi.requestMediaTitle(enriched);
      setRequestCount(res.requestCount);
      setHasRequested(true);
      setRequestToast(`Requested "${enriched.title}" — our team will prioritize adding stream links!`);
      try {
        const saved = JSON.parse(localStorage.getItem('cinepulse_requested_ids') || '[]');
        const next = Array.isArray(saved)
          ? Array.from(new Set([...saved, enriched.id]))
          : [enriched.id];
        localStorage.setItem('cinepulse_requested_ids', JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
    } catch {
      setRequestToast('Unable to submit request right now. Please try again.');
    } finally {
      setRequesting(false);
    }
  };

  const canEmbedVidLink = hasVidLinkSupport(enriched);
  const resolvedEmbedUrl = resolveVidLinkEmbedUrl({
    item: enriched,
    season: selectedSeasonNum,
    episode: selectedEpNum,
  });

  const handlePlayPrimary = () => {
    if (activeSources.length > 0) {
      setMode('stream');
    } else if (canEmbedVidLink) {
      setMode('embed');
    } else if (activeVideoKey) {
      setMode('trailer');
    } else {
      handleRequestTitle();
    }
  };

  const handlePlayEpisode = (ep: EpisodeItem) => {
    setSelectedEpNum(ep.episodeNumber);
    setActiveEpisodeLabel(
      `S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(
        2,
        '0'
      )} — ${ep.title}`
    );
    if (ep.sources && ep.sources.length > 0) {
      setActiveSources(ep.sources);
      setActiveSourceIdx(0);
      setMode('stream');
    } else if (canEmbedVidLink) {
      setActiveSources([]);
      setMode('embed');
    } else {
      setBindTarget({
        title: `${enriched.title} — S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')}: ${ep.title}`,
        season: ep.seasonNumber,
        episode: ep.episodeNumber,
      });
    }
  };

  const handleSaveBinding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enriched.tmdbId || !bindTarget || !bindUrl.trim()) return;
    setBindSaving(true);
    try {
      const res = await backendApi.bindSource({
        tmdbId: enriched.tmdbId,
        mediaType: enriched.type === 'series' ? 'tv' : 'movie',
        season: bindTarget.season,
        episode: bindTarget.episode,
        label: bindUrl.startsWith('/api/media/') ? 'Local Drive File' : 'Custom Stream',
        quality: bindQuality,
        url: bindUrl.trim(),
      });

      if (bindTarget.season && bindTarget.episode) {
        setEpisodes((prev) =>
          prev.map((ep) =>
            ep.seasonNumber === bindTarget.season && ep.episodeNumber === bindTarget.episode
              ? { ...ep, sources: res.sources }
              : ep
          )
        );
        setActiveEpisodeLabel(bindTarget.title);
      } else {
        setEnriched((prev) => ({ ...prev, sources: res.sources }));
        setActiveEpisodeLabel('');
      }

      setActiveSources(res.sources);
      setActiveSourceIdx(0);
      setBindUrl('');
      setBindTarget(null);
      setMode('stream');
    } finally {
      setBindSaving(false);
    }
  };

  const hasPlayableFullVideo = activeSources.length > 0 || canEmbedVidLink;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-end md:items-start justify-center overflow-y-auto p-0 md:p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl max-h-[92vh] md:max-h-none overflow-y-auto rounded-t-2xl md:rounded-2xl bg-[#141821] border-t md:border border-white/[0.12] shadow-[0_32px_90px_rgba(0,0,0,0.85)] animate-sheet-up md:animate-modal md:my-auto pb-[env(safe-area-inset-bottom)] md:pb-0"
      >
        {/* Top Media Stage: Plays ONLY the matched movie/episode stream, embedded full video, OR THIS title's real official trailer */}
        <div className="relative aspect-video bg-[#0B0D12] overflow-hidden">
          {mode === 'stream' && currentSource ? (
            <>
              <video
                ref={videoRef}
                controls
                playsInline
                className="w-full h-full bg-black"
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
                      className="min-h-[44px] px-4 rounded-full bg-[#00E5FF] text-[#071018] text-xs font-extrabold"
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
                        className="min-h-[44px] px-4 rounded-full bg-[#10B981] text-[#041811] text-xs font-extrabold"
                      >
                        Switch to Backup Server
                      </button>
                    )}
                    {activeVideoKey && (
                      <button
                        type="button"
                        onClick={() => {
                          setStreamError('');
                          setMode('trailer');
                        }}
                        className="min-h-[44px] px-4 rounded-full bg-[#1E2430] border border-white/15 text-xs font-bold text-[#F8FAFC]"
                      >
                        Watch Official Trailer
                      </button>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : mode === 'embed' && resolvedEmbedUrl ? (
            <iframe
              key={resolvedEmbedUrl}
              src={resolvedEmbedUrl}
              title={enriched.title}
              allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
              allowFullScreen
              frameBorder={0}
              className="w-full h-full border-0 bg-black"
            />
          ) : mode === 'trailer' && activeVideoKey ? (
            <iframe
              key={activeVideoKey}
              src={`https://www.youtube.com/embed/${encodeURIComponent(
                activeVideoKey
              )}?autoplay=1&rel=0`}
              title={`${enriched.title} Official Trailer`}
              allow="autoplay; encrypted-media; fullscreen"
              allowFullScreen
              className="w-full h-full border-0"
            />
          ) : (
            <>
              <img
                src={enriched.backdrop || enriched.poster}
                alt={enriched.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#141821] via-[#141821]/30 to-black/30" />
              <button
                type="button"
                onClick={handlePlayPrimary}
                disabled={!hasPlayableFullVideo && !activeVideoKey && requesting}
                className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-6 h-14 rounded-full font-extrabold text-sm inline-flex items-center gap-2 hover:scale-105 transition-all ${
                  !hasPlayableFullVideo && !activeVideoKey && hasRequested
                    ? 'bg-[#10B981] text-[#041811]'
                    : 'bg-[#00E5FF] hover:bg-[#33ECFF] text-[#071018]'
                }`}
              >
                {hasPlayableFullVideo || activeVideoKey ? (
                  <Play className="w-5 h-5 fill-current" />
                ) : hasRequested ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {hasPlayableFullVideo
                  ? 'Play Full Video'
                  : activeVideoKey
                  ? 'Play Official Trailer'
                  : requesting
                  ? 'Sending Request...'
                  : hasRequested
                  ? 'Requested'
                  : enriched.type === 'series'
                  ? 'Request This Series'
                  : 'Request This Movie'}
              </button>
            </>
          )}

          {activeEpisodeLabel && mode === 'stream' && (
            <div className="absolute top-3 left-3 z-20 px-3 py-1 rounded-full bg-[#0B0D12]/85 backdrop-blur-md border border-[#00E5FF]/35 text-[11px] font-bold text-[#00E5FF]">
              Now Playing: {activeEpisodeLabel}
            </div>
          )}

          {/* Close Button (44px x 44px touch target) */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="absolute top-3 right-3 z-20 min-w-[44px] min-h-[44px] rounded-full bg-[#0B0D12]/80 hover:bg-[#00E5FF] text-[#F8FAFC] hover:text-[#071018] border border-white/15 backdrop-blur-md flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Details, Trailers, Seasons & Episodes, and Source Linking */}
        <div className="p-4 sm:p-6 space-y-5">
          {/* Header & Primary Action Pills */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1.5 flex-1 min-w-[220px]">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="px-2 py-0.5 rounded-md bg-[#10B981]/20 text-[#10B981] font-bold">
                  {enriched.year}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-[#00E5FF]/15 text-[#00E5FF] font-bold">
                  {enriched.type === 'series' ? 'TV SERIES' : enriched.quality}
                </span>
                <span className="inline-flex items-center gap-1 text-[#FFB800] font-bold">
                  <Star className="w-3.5 h-3.5 fill-[#FFB800]" />
                  {enriched.rating.toFixed(1)}
                </span>
                {enriched.imdbRating && (
                  <span className="px-2 py-0.5 rounded-md bg-[#FFB800]/20 border border-[#FFB800]/40 text-[#FFB800] font-extrabold">
                    IMDb {enriched.imdbRating.toFixed(1)}
                    {enriched.imdbVotes
                      ? ` (${Math.round(enriched.imdbVotes / 1000)}K)`
                      : ''}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 text-[#94A3B8]">
                  <Globe className="w-3.5 h-3.5" />
                  {enriched.country}
                </span>
                {enriched.runtime && (
                  <span className="inline-flex items-center gap-1 text-[#94A3B8]">
                    <Clock className="w-3.5 h-3.5" />
                    {enriched.runtime}
                  </span>
                )}
              </div>

              <h2 className="text-xl sm:text-2xl font-extrabold text-[#F8FAFC]">
                {enriched.title}
              </h2>

              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {enriched.genres.map((g) => (
                  <span
                    key={g}
                    className="px-2.5 py-0.5 rounded-full bg-[#1E2430] text-[11px] font-medium text-[#CBD5E1]"
                  >
                    {g}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {hasPlayableFullVideo ? (
                <button
                  type="button"
                  onClick={handlePlayPrimary}
                  className="min-h-[44px] px-4 rounded-full bg-[#00E5FF] hover:bg-[#33ECFF] active:scale-[0.98] text-[#071018] text-xs font-extrabold inline-flex items-center gap-1.5 transition-all"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Play Full Video
                </button>
              ) : (
                <button
                  type="button"
                  disabled={requesting}
                  onClick={handleRequestTitle}
                  className={`min-h-[44px] px-4 rounded-full active:scale-[0.98] text-xs font-extrabold inline-flex items-center gap-1.5 transition-all ${
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
                  {requesting
                    ? 'Requesting...'
                    : hasRequested
                    ? `Requested${requestCount > 0 ? ` (${requestCount})` : ''}`
                    : enriched.type === 'series'
                    ? 'Request Series'
                    : 'Request Movie'}
                </button>
              )}

              {activeVideoKey && (
                <button
                  type="button"
                  onClick={() => setMode(mode === 'trailer' ? 'poster' : 'trailer')}
                  className={`min-h-[44px] px-4 rounded-full border text-xs font-bold inline-flex items-center gap-1.5 active:scale-[0.98] transition-all ${
                    mode === 'trailer'
                      ? 'bg-[#FFB800] border-[#FFB800] text-[#1A1200]'
                      : 'bg-[#1E2430] border-white/10 text-[#F8FAFC] hover:border-[#FFB800]/50'
                  }`}
                >
                  <Youtube className="w-4 h-4" />
                  {mode === 'trailer' ? 'Playing Trailer' : 'Official Trailer'}
                </button>
              )}

              {enriched.tmdbId && (
                <button
                  type="button"
                  onClick={() => setBindTarget({ title: enriched.title })}
                  className="min-h-[44px] px-3.5 rounded-full bg-[#1E2430] hover:bg-[#273041] active:scale-[0.98] border border-white/10 text-xs font-semibold text-[#F8FAFC] inline-flex items-center gap-1.5 transition-all"
                >
                  <Link2 className="w-3.5 h-3.5 text-[#00E5FF]" />
                  Attach Video
                </button>
              )}

              <button
                type="button"
                onClick={() => onToggleWatchlist(enriched.id)}
                className={`min-h-[44px] px-3.5 rounded-full border text-xs font-semibold inline-flex items-center gap-1.5 active:scale-[0.98] transition-all ${
                  inWatchlist
                    ? 'bg-[#00E5FF]/15 border-[#00E5FF]/50 text-[#00E5FF]'
                    : 'bg-[#1E2430] border-white/10 text-[#F8FAFC] hover:border-white/25'
                }`}
              >
                {inWatchlist ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                {inWatchlist ? 'In My List' : 'My List'}
              </button>
            </div>
          </div>

          {requestToast && (
            <div className="px-3.5 py-2.5 rounded-xl bg-[#10B981]/15 border border-[#10B981]/35 text-xs font-bold text-[#10B981] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{requestToast}</span>
            </div>
          )}

          <div>
            <p
              className={`text-sm text-[#94A3B8] leading-relaxed ${
                !synopsisExpanded ? 'line-clamp-3' : ''
              }`}
            >
              {enriched.overview}
            </p>
            {enriched.overview && enriched.overview.length > 160 && (
              <button
                type="button"
                onClick={() => setSynopsisExpanded((v) => !v)}
                className="min-h-[36px] mt-1 text-xs font-bold text-[#00E5FF] hover:underline"
              >
                {synopsisExpanded ? 'Show less' : 'Read more'}
              </button>
            )}
          </div>

          <div className="text-xs text-[#94A3B8] space-y-1">
            <div>
              <span className="font-semibold text-[#F8FAFC]">Director / Creator: </span>
              {loadingDetails ? 'Loading...' : enriched.director}
            </div>
            <div>
              <span className="font-semibold text-[#F8FAFC]">Cast: </span>
              {loadingDetails ? 'Loading...' : enriched.cast.join(', ')}
            </div>
          </div>

          {/* Official Trailers & Featurettes Switcher (when TMDB returns multiple clips for THIS title) */}
          {enriched.videos && enriched.videos.length > 1 && (
            <div className="space-y-2">
              <div className="text-xs font-bold text-[#F8FAFC] flex items-center gap-1.5">
                <Film className="w-3.5 h-3.5 text-[#FFB800]" />
                Official Videos for {enriched.title}
              </div>
              <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                {enriched.videos.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => {
                      setActiveVideoKey(v.key);
                      setMode('trailer');
                    }}
                    className={`shrink-0 min-h-[38px] px-3 rounded-xl border text-xs font-semibold transition-colors ${
                      mode === 'trailer' && activeVideoKey === v.key
                        ? 'bg-[#FFB800]/20 border-[#FFB800]/50 text-[#FFB800]'
                        : 'bg-[#0B0D12] border-white/[0.08] text-[#CBD5E1] hover:border-white/20'
                    }`}
                  >
                    {v.type}: {v.name.slice(0, 32)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Attach Local File or Direct Video URL Panel */}
          {bindTarget && enriched.tmdbId && (
            <div className="rounded-xl bg-[#0B0D12] border border-[#00E5FF]/40 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-extrabold text-[#00E5FF] flex items-center gap-1.5">
                  <Link2 className="w-4 h-4" />
                  Link Full Video File for: {bindTarget.title}
                </div>
                <button
                  type="button"
                  onClick={() => setBindTarget(null)}
                  className="min-w-[36px] min-h-[36px] rounded-full hover:bg-white/10 text-[#94A3B8] flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {localFiles.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-[#94A3B8] flex items-center gap-1">
                    <HardDrive className="w-3.5 h-3.5 text-[#10B981]" />
                    Pick from your PC&apos;s media/ folder:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {localFiles.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setBindUrl(f.streamUrl)}
                        className="px-2.5 py-1.5 rounded-lg bg-[#141821] hover:bg-[#1E2430] border border-white/10 text-[11px] font-semibold text-[#F8FAFC]"
                      >
                        {f.filename} ({f.sizeFormatted})
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <form onSubmit={handleSaveBinding} className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  required
                  value={bindUrl}
                  onChange={(e) => setBindUrl(e.target.value)}
                  placeholder="Paste direct .mp4 / .m3u8 URL or pick a local file above..."
                  className="flex-1 min-h-[42px] px-3 rounded-xl bg-[#141821] border border-white/10 focus:border-[#00E5FF] text-xs text-[#F8FAFC] outline-none"
                />
                <select
                  value={bindQuality}
                  onChange={(e) => setBindQuality(e.target.value)}
                  className="min-h-[42px] px-3 rounded-xl bg-[#141821] border border-white/10 text-xs text-[#F8FAFC]"
                >
                  <option value="4K">4K</option>
                  <option value="1080p">1080p</option>
                  <option value="720p">720p</option>
                  <option value="480p">480p</option>
                </select>
                <button
                  type="submit"
                  disabled={bindSaving}
                  className="min-h-[42px] px-4 rounded-xl bg-[#00E5FF] text-[#071018] text-xs font-extrabold disabled:opacity-60"
                >
                  {bindSaving ? 'Saving...' : 'Save & Play'}
                </button>
              </form>
            </div>
          )}

          {/* SEASONS & EPISODES SECTION (For Every TV Series!) */}
          {enriched.type === 'series' && (
            <div className="rounded-2xl bg-[#0B0D12]/90 border border-white/[0.07] p-4 space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-extrabold text-[#F8FAFC] flex items-center gap-2">
                  <Tv className="w-4 h-4 text-[#00E5FF]" />
                  Seasons &amp; Episodes
                </h3>
                {seasons.length > 0 && (
                  <span className="text-[11px] font-semibold text-[#94A3B8]">
                    {seasons.length} Season{seasons.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {/* Season Selector Pills */}
              {seasons.length > 0 ? (
                <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                  {seasons.map((sea) => {
                    const active = sea.seasonNumber === selectedSeasonNum;
                    return (
                      <button
                        key={sea.seasonNumber}
                        type="button"
                        onClick={() => setSelectedSeasonNum(sea.seasonNumber)}
                        className={`shrink-0 min-h-[40px] px-3.5 rounded-xl border text-xs font-bold transition-all ${
                          active
                            ? 'bg-[#00E5FF] border-[#00E5FF] text-[#071018]'
                            : 'bg-[#141821] border-white/[0.08] text-[#CBD5E1] hover:border-white/25'
                        }`}
                      >
                        {sea.name}
                        {sea.episodeCount > 0 && (
                          <span className="ml-1.5 opacity-75">({sea.episodeCount})</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-[#94A3B8]">
                  {loadingDetails ? 'Loading seasons from TMDB...' : 'No season metadata published yet.'}
                </p>
              )}

              {/* Episodes List */}
              {loadingSeason ? (
                <div className="space-y-2.5">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="h-24 rounded-xl skeleton-shimmer" />
                  ))}
                </div>
              ) : episodes.length > 0 ? (
                <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
                  {episodes.map((ep) => {
                    const hasEpVideo = ep.sources && ep.sources.length > 0;
                    return (
                      <div
                        key={ep.id}
                        className="rounded-xl bg-[#141821] border border-white/[0.06] hover:border-white/[0.15] p-2.5 sm:p-3 flex flex-col sm:flex-row gap-3 transition-colors"
                      >
                        {/* Episode Thumbnail Still */}
                        <div
                          onClick={() => handlePlayEpisode(ep)}
                          className="relative w-full sm:w-40 aspect-video rounded-lg overflow-hidden bg-[#0B0D12] shrink-0 cursor-pointer group"
                        >
                          {ep.still ? (
                            <img
                              src={ep.still}
                              alt={ep.title}
                              loading="lazy"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-xs font-bold text-[#94A3B8]">
                              S{String(ep.seasonNumber).padStart(2, '0')}E
                              {String(ep.episodeNumber).padStart(2, '0')}
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                            <span
                              className={`w-9 h-9 rounded-full flex items-center justify-center ${
                                hasEpVideo
                                  ? 'bg-[#00E5FF] text-[#071018]'
                                  : 'bg-[#0B0D12]/80 text-[#F8FAFC] border border-white/25'
                              }`}
                            >
                              {hasEpVideo ? (
                                <Play className="w-4 h-4 fill-current ml-0.5" />
                              ) : (
                                <Link2 className="w-4 h-4" />
                              )}
                            </span>
                          </div>
                          <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-[#0B0D12]/85 text-[10px] font-extrabold text-[#00E5FF]">
                            E{String(ep.episodeNumber).padStart(2, '0')}
                          </span>
                          {ep.runtime && (
                            <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-[#0B0D12]/85 text-[10px] font-semibold text-[#F8FAFC]">
                              {ep.runtime}
                            </span>
                          )}
                        </div>

                        {/* Episode Metadata + Play / Link Controls */}
                        <div className="flex-1 min-w-0 flex flex-col justify-between gap-2">
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <h4 className="text-sm font-bold text-[#F8FAFC] leading-snug">
                                {ep.episodeNumber}. {ep.title}
                              </h4>
                              {ep.rating > 0 && (
                                <span className="shrink-0 inline-flex items-center gap-0.5 text-[11px] font-bold text-[#FFB800]">
                                  <Star className="w-3 h-3 fill-[#FFB800]" />
                                  {ep.rating.toFixed(1)}
                                </span>
                              )}
                            </div>
                            {ep.airDate && (
                              <div className="text-[11px] text-[#94A3B8] mt-0.5">
                                Aired {ep.airDate}
                              </div>
                            )}
                            <p className="text-xs text-[#94A3B8] line-clamp-2 mt-1 leading-relaxed">
                              {ep.overview}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {hasEpVideo ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handlePlayEpisode(ep)}
                                  className="min-h-[44px] px-4 rounded-full bg-[#00E5FF] active:scale-[0.98] text-[#071018] text-xs font-extrabold inline-flex items-center gap-1.5 transition-transform"
                                >
                                  <Play className="w-3.5 h-3.5 fill-current" />
                                  Play Episode
                                </button>
                                {ep.sources[0]?.downloadUrl && (
                                  <a
                                    href={ep.sources[0].downloadUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    download
                                    className="min-h-[44px] px-3.5 rounded-full bg-[#10B981]/15 active:scale-[0.98] text-[#10B981] text-xs font-bold inline-flex items-center gap-1.5 transition-transform"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    Download
                                  </a>
                                )}
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handlePlayEpisode(ep)}
                                className="min-h-[44px] px-3.5 rounded-full bg-[#1E2430] hover:bg-[#273041] active:scale-[0.98] border border-white/10 text-xs font-semibold text-[#CBD5E1] inline-flex items-center gap-1.5 transition-all"
                              >
                                <Link2 className="w-3.5 h-3.5 text-[#00E5FF]" />
                                Link Local File / Stream URL
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          )}

          {/* Direct Playable Mirrors (Shown cleanly when sources exist; never show bogus local-file warning on embedded or archive videos) */}
          {activeSources.length > 0 ? (
            <div className="rounded-xl bg-[#0B0D12]/90 border border-white/[0.06] p-4 space-y-2.5">
              <div className="flex items-center justify-between text-xs font-bold text-[#F8FAFC]">
                <span className="inline-flex items-center gap-1.5">
                  <Server className="w-4 h-4 text-[#00E5FF]" />
                  Verified Video Sources ({activeSources.length})
                </span>
                <span className="text-[11px] font-medium text-[#10B981]">● Matched Stream</span>
              </div>

              <div className="grid sm:grid-cols-2 gap-2">
                {activeSources.map((src, idx) => (
                  <div
                    key={src.id}
                    className={`rounded-xl p-3 border flex items-center justify-between gap-2 transition-colors ${
                      mode === 'stream' && idx === activeSourceIdx
                        ? 'bg-[#1E2430] border-[#00E5FF]/50'
                        : 'bg-[#141821] border-white/[0.06]'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[#F8FAFC] truncate">
                        {src.label}
                      </div>
                      <div className="text-[11px] text-[#94A3B8] mt-0.5">
                        <span className="text-[#10B981] font-semibold">{src.quality}</span> &bull;{' '}
                        {src.type.toUpperCase()} &bull; {src.size}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveSourceIdx(idx);
                          setMode('stream');
                        }}
                        className="min-h-[44px] px-3.5 rounded-lg bg-[#00E5FF]/15 hover:bg-[#00E5FF] active:scale-[0.98] text-[#00E5FF] hover:text-[#071018] text-xs font-bold transition-all"
                      >
                        Play
                      </button>
                      {src.downloadUrl && (
                        <a
                          href={src.downloadUrl}
                          target="_blank"
                          rel="noreferrer"
                          download
                          className="min-h-[44px] px-3.5 rounded-lg bg-[#10B981]/15 hover:bg-[#10B981] active:scale-[0.98] text-[#10B981] hover:text-[#041811] text-xs font-bold inline-flex items-center gap-1 transition-all"
                        >
                          <Download className="w-3.5 h-3.5" />
                          DL
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : enriched.embedUrl ? null : (
            <div className="rounded-xl bg-[#0B0D12]/90 border border-white/[0.08] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-[#94A3B8] leading-relaxed">
                <strong className="text-[#F8FAFC]">Stream link not added yet.</strong> Request this{' '}
                {enriched.type === 'series' ? 'series' : 'movie'} below so our team knows you want to
                watch it and prioritizes adding the stream &amp; download links!
                {requestCount > 0 && (
                  <span className="ml-2 inline-block px-2 py-0.5 rounded bg-[#FFB800]/15 text-[#FFB800] font-bold tabular-nums">
                    {requestCount} request{requestCount > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <button
                type="button"
                disabled={requesting}
                onClick={handleRequestTitle}
                className={`shrink-0 min-h-[40px] px-4 rounded-full text-xs font-extrabold inline-flex items-center gap-1.5 transition-colors ${
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
                {requesting
                  ? 'Requesting...'
                  : hasRequested
                  ? 'Requested'
                  : enriched.type === 'series'
                  ? 'Request This Series'
                  : 'Request This Movie'}
              </button>
            </div>
          )}

          {/* In-Platform "More Like This" Recommendations (keeps viewers inside CinePulse!) */}
          {enriched.recommendations && enriched.recommendations.length > 0 && onSelectRecommendation && (
            <div className="space-y-2.5 pt-2">
              <h3 className="text-sm font-extrabold text-[#F8FAFC]">More Like This on CinePulse</h3>
              <div className="flex gap-2.5 overflow-x-auto scrollbar-hide pb-1">
                {enriched.recommendations.map((rec) => (
                  <button
                    key={rec.id}
                    type="button"
                    onClick={() => onSelectRecommendation(rec)}
                    className="shrink-0 w-28 text-left group"
                  >
                    <div className="aspect-[2/3] rounded-lg overflow-hidden bg-[#0B0D12] border border-white/[0.08] group-hover:border-[#00E5FF]/50">
                      <img
                        src={rec.poster}
                        alt={rec.title}
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="text-[11px] font-semibold text-[#F8FAFC] line-clamp-1 mt-1 group-hover:text-[#00E5FF]">
                      {rec.title}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
