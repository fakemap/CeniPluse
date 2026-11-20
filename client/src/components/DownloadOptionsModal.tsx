import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Star,
  Download,
  Send,
  CheckCircle2,
  ListChecks,
  Gauge,
  Captions,
  ChevronDown,
  Check,
  AlignLeft,
  Video,
  Loader2,
} from 'lucide-react';
import type {
  DownloadRecord,
  EpisodeItem,
  MediaItem,
  MediaSource,
  SeasonSummary,
} from '../types/media';
import { backendApi } from '../services/api';
import {
  downloadSubtitleFile,
  downloadVideoWithProgress,
  type DownloadProgress,
} from '../utils/downloader';

interface DownloadOptionsModalProps {
  item: MediaItem;
  seasons: SeasonSummary[];
  episodes: EpisodeItem[];
  selectedSeasonNum: number;
  selectedEpNum?: number;
  onSelectSeason: (num: number) => void;
  activeSources: MediaSource[];
  scrapedSubtitles?: Array<{ label: string; lang: string; url: string }>;
  onClose: () => void;
  onRequestTitle: () => void;
  hasRequested: boolean;
  requesting: boolean;
  onRecordDownload: (rec: DownloadRecord) => void;
}

interface QualityOption {
  id: string;
  label: string;
  format: string;
  size: string;
  recommended?: boolean;
  downloadUrl?: string;
  sourceType?: 'mp4' | 'hls';
}

interface SubtitleOptionItem {
  code: string;
  label: string;
  size: string;
  url?: string;
}

const DEFAULT_SUBTITLE_FALLBACKS: SubtitleOptionItem[] = [
  { code: 'en', label: 'English', size: '52 KB' },
  { code: 'es', label: 'Español', size: '49 KB' },
  { code: 'fr', label: 'Français', size: '51 KB' },
  { code: 'none', label: 'No Subtitle', size: 'Video Only' },
];

export const DownloadOptionsModal: React.FC<DownloadOptionsModalProps> = ({
  item,
  seasons,
  episodes,
  selectedSeasonNum,
  selectedEpNum,
  onSelectSeason,
  activeSources,
  scrapedSubtitles = [],
  onClose,
  onRequestTitle,
  hasRequested,
  requesting,
  onRecordDownload,
}) => {
  const [bulkSelect, setBulkSelect] = useState(false);
  const [selectedEpNums, setSelectedEpNums] = useState<number[]>(() =>
    selectedEpNum
      ? [selectedEpNum]
      : episodes[0]?.episodeNumber
      ? [episodes[0].episodeNumber]
      : [1]
  );
  const [dataSaver, setDataSaver] = useState(false);
  const [selectedQuality, setSelectedQuality] = useState<string>('1080P');
  const [selectedSub, setSelectedSub] = useState<string>('en');
  const [downloadStatus, setDownloadStatus] = useState<string>('');
  const [downloadError, setDownloadError] = useState<string>('');
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [downloadingVideo, setDownloadingVideo] = useState<boolean>(false);
  const [downloadingSub, setDownloadingSub] = useState<boolean>(false);
  const downloadAbortRef = useRef<AbortController | null>(null);
  const [seasonMenuOpen, setSeasonMenuOpen] = useState(false);
  const seasonDropdownRef = useRef<HTMLDivElement>(null);

  const [resolvedModalSources, setResolvedModalSources] = useState<MediaSource[]>(activeSources);
  const [resolvedModalSubs, setResolvedModalSubs] =
    useState<Array<{ label: string; lang: string; url: string }>>(scrapedSubtitles);
  const [loadingLinks, setLoadingLinks] = useState<boolean>(false);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (seasonMenuOpen) {
          setSeasonMenuOpen(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [seasonMenuOpen, onClose]);

  useEffect(() => {
    if (!seasonMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (seasonDropdownRef.current && !seasonDropdownRef.current.contains(e.target as Node)) {
        setSeasonMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [seasonMenuOpen]);

  const effectiveSeasons: SeasonSummary[] =
    seasons.length > 0
      ? seasons
      : item.type === 'series'
      ? [{ seasonNumber: 1, name: 'Season 1', episodeCount: 12 }]
      : [];
  const isSeries = item.type === 'series' && effectiveSeasons.length > 0;
  const activeSeasonObj =
    effectiveSeasons.find((s) => s.seasonNumber === selectedSeasonNum) || effectiveSeasons[0];
  const episodeSlots: number[] =
    episodes.length > 0
      ? episodes.map((e) => e.episodeNumber)
      : Array.from(
          { length: Math.min(30, Math.max(1, activeSeasonObj?.episodeCount || 12)) },
          (_, i) => i + 1
        );

  const primaryEpNum = selectedEpNums[0] || 1;
  const primaryEp =
    episodes.find((e) => e.episodeNumber === primaryEpNum) || episodes[0] || null;

  // Dynamically resolve stream & download links for the selected movie or series episode
  useEffect(() => {
    if (isSeries && primaryEp?.sources && primaryEp.sources.length > 0) {
      setResolvedModalSources(primaryEp.sources);
      return;
    }
    if (!isSeries && activeSources.length > 0) {
      setResolvedModalSources(activeSources);
      if (scrapedSubtitles.length > 0) {
        setResolvedModalSubs(scrapedSubtitles);
      }
      return;
    }

    if (!item.tmdbId) return;

    let mounted = true;
    const controller = new AbortController();
    setLoadingLinks(true);

    backendApi
      .resolveScrapedStreams(
        {
          tmdbId: item.tmdbId,
          type: item.type,
          season: isSeries ? selectedSeasonNum : undefined,
          episode: isSeries ? primaryEpNum : undefined,
          title: item.title,
          year: item.year,
        },
        controller.signal
      )
      .then((res) => {
        if (!mounted || controller.signal.aborted) return;
        setLoadingLinks(false);
        if (res.sources && res.sources.length > 0) {
          setResolvedModalSources(res.sources);
        }
        if (res.subtitles && res.subtitles.length > 0) {
          setResolvedModalSubs(res.subtitles);
        }
      })
      .catch(() => {
        if (mounted) setLoadingLinks(false);
      });

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [
    item.tmdbId,
    item.type,
    item.title,
    item.year,
    isSeries,
    selectedSeasonNum,
    primaryEpNum,
    primaryEp,
    activeSources,
    scrapedSubtitles,
  ]);

  const downloadableSources = useMemo(
    () => resolvedModalSources.filter((s) => Boolean(s.downloadUrl || s.url)),
    [resolvedModalSources]
  );

  // Build standardized 1080P, 720P, 480P, 360P quality cards backed by real download endpoints
  const qualityOptions: QualityOption[] = useMemo(() => {
    const tiers = [
      { key: '1080', label: '1080P', fallbackSize: '890 MB', recommended: true },
      { key: '720', label: '720P', fallbackSize: '485 MB', recommended: false },
      { key: '480', label: '480P', fallbackSize: '240 MB', recommended: false },
      { key: '360', label: '360P', fallbackSize: '165 MB', recommended: false },
    ];

    if (downloadableSources.length === 0) {
      return tiers.map((t) => ({
        id: `tier_${t.key}`,
        label: t.label,
        format: 'MP4',
        size: t.fallbackSize,
        recommended: t.recommended,
      }));
    }

    // Prefer direct MP4 sources first when matching a resolution tier
    const findBestSourceForTier = (tierKey: string): MediaSource => {
      const exactMp4 = downloadableSources.find(
        (s) => s.type === 'mp4' && s.quality.toLowerCase().includes(tierKey)
      );
      if (exactMp4) return exactMp4;

      const exactAny = downloadableSources.find((s) =>
        s.quality.toLowerCase().includes(tierKey)
      );
      if (exactAny) return exactAny;

      const anyMp4 = downloadableSources.find((s) => s.type === 'mp4');
      return anyMp4 || downloadableSources[0];
    };

    return tiers.map((t) => {
      const matched = findBestSourceForTier(t.key);
      const exactMatch = matched.quality.toLowerCase().includes(t.key);
      const rawDl = matched.downloadUrl || `${matched.url}&download=1`;
      const dlWithQuality = rawDl.includes('quality=')
        ? rawDl.replace(/quality=\d+/i, `quality=${t.key}`)
        : `${rawDl}&quality=${t.key}`;

      return {
        id: `q_${t.key}_${matched.id}`,
        label: t.label,
        format: matched.type === 'hls' ? 'TS / MP4' : 'MP4',
        size:
          exactMatch && matched.size && !matched.size.toLowerCase().includes('adaptive')
            ? matched.size
            : t.fallbackSize,
        recommended: t.recommended,
        downloadUrl: dlWithQuality,
        sourceType: matched.type === 'hls' ? 'hls' : 'mp4',
      };
    });
  }, [downloadableSources]);

  // Build subtitle options from real resolved subtitles
  const subtitleOptions: SubtitleOptionItem[] = useMemo(() => {
    if (resolvedModalSubs.length === 0) {
      return DEFAULT_SUBTITLE_FALLBACKS;
    }

    const out: SubtitleOptionItem[] = [];
    const seenLabels = new Set<string>();

    // Sort English tracks first so English is selected by default
    const sortedSubs = [...resolvedModalSubs].sort((a, b) => {
      const aEn = /^en|english/i.test(`${a.lang || ''} ${a.label || ''}`) ? 0 : 1;
      const bEn = /^en|english/i.test(`${b.lang || ''} ${b.label || ''}`) ? 0 : 1;
      return aEn - bEn;
    });

    for (const sub of sortedSubs) {
      const cleanLabel = (sub.label || 'English').trim();
      const lower = cleanLabel.toLowerCase();
      if (seenLabels.has(lower)) continue;
      seenLabels.add(lower);
      out.push({
        code: `${sub.lang || 'en'}_${out.length}`,
        label: cleanLabel,
        size: 'VTT Subtitle',
        url: sub.url,
      });
      if (out.length >= 8) break;
    }

    out.push({
      code: 'none',
      label: 'No Subtitle',
      size: 'Video Only',
    });

    return out;
  }, [resolvedModalSubs]);

  useEffect(() => {
    if (subtitleOptions.length > 0 && !subtitleOptions.some((s) => s.code === selectedSub)) {
      setSelectedSub(subtitleOptions[0].code);
    }
  }, [subtitleOptions, selectedSub]);

  useEffect(() => {
    if (qualityOptions.length > 0) {
      if (dataSaver) {
        setSelectedQuality('360P');
      } else if (!qualityOptions.some((q) => q.label === selectedQuality)) {
        setSelectedQuality(qualityOptions[0].label);
      }
    }
  }, [dataSaver, qualityOptions, selectedQuality]);

  const activeQualityObj =
    qualityOptions.find((q) => q.label === selectedQuality) || qualityOptions[0];
  const activeSubObj =
    subtitleOptions.find((s) => s.code === selectedSub) || subtitleOptions[0];
  const activeSubLabel = activeSubObj?.label || 'English';

  const handleToggleEpisode = (epNum: number) => {
    if (!bulkSelect) {
      setSelectedEpNums([epNum]);
      return;
    }
    setSelectedEpNums((prev) =>
      prev.includes(epNum)
        ? prev.length > 1
          ? prev.filter((n) => n !== epNum)
          : prev
        : [...prev, epNum].sort((a, b) => a - b)
    );
  };

  useEffect(() => {
    return () => {
      downloadAbortRef.current?.abort();
    };
  }, []);

  const handleCancelDownload = () => {
    downloadAbortRef.current?.abort();
    downloadAbortRef.current = null;
    setDownloadingVideo(false);
    setDownloadProgress(null);
    setDownloadStatus('Download cancelled.');
  };

  const handleDownloadSubtitleOnly = async (sub: SubtitleOptionItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!sub.url) {
      setDownloadError('Subtitle track is not available for this title yet.');
      return;
    }
    setDownloadError('');
    setDownloadingSub(true);
    try {
      const epSuffix = isSeries
        ? `_S${String(selectedSeasonNum).padStart(2, '0')}E${String(primaryEpNum).padStart(2, '0')}`
        : '';
      const safeTitle = item.title.replace(/[^a-zA-Z0-9._-]/g, '_');
      const safeLang = sub.label.replace(/[^a-zA-Z0-9._-]/g, '_');
      const subFilename = `${safeTitle}${epSuffix}.${safeLang}.vtt`;
      await downloadSubtitleFile(sub.url, subFilename);
      setDownloadStatus(`Saved ${sub.label} subtitle (${subFilename}) to your downloads.`);
    } catch (err) {
      setDownloadError((err as Error).message || 'Could not download subtitle file.');
    } finally {
      setDownloadingSub(false);
    }
  };

  const handleStartDownload = async () => {
    if (downloadingVideo) return;
    setDownloadError('');
    setDownloadStatus('');
    setDownloadProgress(null);

    let candidateSources = [...downloadableSources];

    // If user clicked download before links finished resolving, resolve on-demand immediately
    if (candidateSources.length === 0 && item.tmdbId) {
      setLoadingLinks(true);
      try {
        const res = await backendApi.resolveScrapedStreams({
          tmdbId: item.tmdbId,
          type: item.type,
          season: isSeries ? selectedSeasonNum : undefined,
          episode: isSeries ? primaryEpNum : undefined,
          title: item.title,
          year: item.year,
        });
        if (res.sources && res.sources.length > 0) {
          candidateSources = res.sources;
          setResolvedModalSources(res.sources);
        }
        if (res.subtitles && res.subtitles.length > 0) {
          setResolvedModalSubs(res.subtitles);
        }
      } finally {
        setLoadingLinks(false);
      }
    }

    if (candidateSources.length === 0) {
      setDownloadError(
        'Direct video download mirrors are temporarily busy for this title. Please try again in a moment or switch to another quality.'
      );
      return;
    }

    const safeTitle = item.title.replace(/[^a-zA-Z0-9._-]/g, '_');
    const epSuffix = isSeries
      ? `S${String(selectedSeasonNum).padStart(2, '0')}E${String(primaryEpNum).padStart(2, '0')}`
      : undefined;
    const tierKey = selectedQuality.replace(/\D/g, '') || '1080';

    // Order candidate servers: preferred quality match first, then fallback servers
    const orderedSources = [
      ...candidateSources.filter((s) => s.quality.toLowerCase().includes(tierKey)),
      ...candidateSources.filter((s) => !s.quality.toLowerCase().includes(tierKey)),
    ];

    const controller = new AbortController();
    downloadAbortRef.current = controller;
    setDownloadingVideo(true);

    let lastErr = '';
    let succeeded = false;

    for (const src of orderedSources) {
      if (controller.signal.aborted) break;
      const srcUrl = src.downloadUrl || src.url;
      if (!srcUrl) continue;
      const srcType: 'mp4' | 'hls' = src.type === 'hls' ? 'hls' : 'mp4';
      const videoFilename = `${safeTitle}${epSuffix ? `_${epSuffix}` : ''}_${activeQualityObj.label}.${
        srcType === 'hls' ? 'ts' : 'mp4'
      }`;

      try {
        await downloadVideoWithProgress({
          url: srcUrl,
          sourceType: srcType,
          quality: activeQualityObj.label,
          filename: videoFilename,
          onProgress: (p) => setDownloadProgress(p),
          signal: controller.signal,
        });

        onRecordDownload({
          id: `dl_${item.id}_${epSuffix || 'movie'}_${Date.now()}`,
          mediaId: item.id,
          title: item.title,
          poster: item.poster,
          quality: activeQualityObj.label,
          episodeLabel: isSeries ? `S${selectedSeasonNum}:E${primaryEpNum}` : undefined,
          url: srcUrl,
          downloadedAt: new Date().toISOString(),
        });

        setDownloadStatus(
          `Video download started in your browser (${videoFilename}).`
        );
        succeeded = true;
        break;
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          break;
        }
        lastErr = (err as Error).message || 'Server error';
      }
    }

    setDownloadingVideo(false);
    downloadAbortRef.current = null;
    if (!succeeded && !controller.signal.aborted) {
      setDownloadProgress(null);
      setDownloadError(
        `Could not download from available servers (${lastErr || 'connection failed'}). Please try again.`
      );
    }
  };

  const isTitleAvailable = Boolean(
    downloadableSources.length > 0 || item.tmdbId || item.malId || item.embedUrl
  );

  const displayTitle =
    isSeries && effectiveSeasons.length > 1
      ? `${item.title} S1-S${effectiveSeasons.length}`
      : item.title;

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="download-options-title"
      className="fixed inset-0 z-[115] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl my-auto rounded-2xl bg-[#10151D] border border-white/[0.1] shadow-2xl overflow-hidden animate-modal"
      >
        {/* Top Header */}
        <div className="px-5 py-4 border-b border-white/[0.07] flex items-center justify-between">
          <h2 id="download-options-title" className="text-base sm:text-lg font-extrabold text-[#F8FAFC]">
            Download Options
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close download options"
            className="min-w-[44px] min-h-[44px] -mr-2 rounded-full hover:bg-white/[0.08] text-[#94A3B8] hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-4 sm:p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          {/* Media Summary Card */}
          <div className="rounded-xl bg-[#171D27] border border-white/[0.07] p-3.5 sm:p-4 flex gap-4">
            <img
              src={item.poster}
              alt={item.title}
              className="w-20 sm:w-24 aspect-[2/3] rounded-lg object-cover bg-[#0B0D12] shrink-0"
            />
            <div className="min-w-0 flex-1 space-y-1.5">
              <h3 className="text-sm sm:text-base font-extrabold text-[#F8FAFC] leading-snug">
                {displayTitle}
              </h3>
              <p className="text-xs font-medium text-[#94A3B8] tabular-nums">
                {item.releaseDate || item.year}
              </p>
              <p className="text-xs text-[#CBD5E1]/90 line-clamp-2 leading-relaxed">
                {item.overview}
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {item.genres.slice(0, 4).map((g) => (
                  <span
                    key={g}
                    className="px-2.5 py-0.5 rounded bg-[#222A38] text-[11px] font-medium text-[#CBD5E1]"
                  >
                    {g}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Section 1: Select Episode (for Series) */}
          {isSeries && (
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-md bg-white/[0.08] text-[#E2E8F0] flex items-center justify-center">
                  <AlignLeft className="w-4 h-4" />
                </span>
                <span className="text-sm font-extrabold text-[#F8FAFC]">Select Episode</span>
              </div>

              <div className="space-y-2.5">
                <div className="text-xs font-semibold text-[#94A3B8]">Season</div>
                <div ref={seasonDropdownRef} className="relative inline-block w-44 z-30">
                  <button
                    type="button"
                    aria-haspopup="listbox"
                    aria-expanded={seasonMenuOpen}
                    aria-label="Select season"
                    onClick={() => setSeasonMenuOpen((o) => !o)}
                    className={`w-full min-h-[42px] px-3.5 rounded-lg bg-[#161D27] hover:bg-[#1B2431] border text-xs sm:text-[13px] font-semibold text-[#F8FAFC] flex items-center justify-between transition-colors ${
                      seasonMenuOpen ? 'border-white/25' : 'border-white/[0.1]'
                    }`}
                  >
                    <span>{activeSeasonObj?.name || `Season ${selectedSeasonNum}`}</span>
                    <ChevronDown
                      className={`w-4 h-4 text-[#94A3B8] transition-transform duration-150 ${
                        seasonMenuOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {seasonMenuOpen && (
                    <div
                      role="listbox"
                      aria-label="Seasons"
                      className="absolute left-0 top-full mt-1.5 w-full rounded-xl bg-[#0D131B] border border-white/[0.12] shadow-[0_18px_40px_rgba(0,0,0,0.75)] py-1.5 max-h-60 overflow-y-auto z-40"
                    >
                      {effectiveSeasons.map((s) => {
                        const isActive = s.seasonNumber === selectedSeasonNum;
                        return (
                          <button
                            key={s.seasonNumber}
                            type="button"
                            role="option"
                            aria-selected={isActive}
                            onClick={() => {
                              onSelectSeason(s.seasonNumber);
                              setSeasonMenuOpen(false);
                            }}
                            className={`w-full px-3.5 py-2.5 text-left text-xs sm:text-[13px] transition-colors flex items-center justify-between ${
                              isActive
                                ? 'bg-[#10B981]/15 text-[#10B981] font-semibold'
                                : 'text-[#E2E8F0] hover:bg-white/[0.06] hover:text-white'
                            }`}
                          >
                            <span>{s.name}</span>
                            {isActive && <Check className="w-3.5 h-3.5 text-[#10B981]" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs font-semibold text-[#94A3B8]">Episodes</span>
                  <button
                    type="button"
                    onClick={() => {
                      setBulkSelect((b) => {
                        if (b && selectedEpNums.length > 1) {
                          setSelectedEpNums([selectedEpNums[0]]);
                        }
                        return !b;
                      });
                    }}
                    className={`min-h-[32px] px-3 rounded-lg border text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${
                      bulkSelect
                        ? 'bg-[#10B981]/15 border-[#10B981]/50 text-[#10B981]'
                        : 'bg-[#171D27] border-white/[0.08] text-[#CBD5E1] hover:border-white/20'
                    }`}
                  >
                    <ListChecks className="w-3.5 h-3.5" />
                    Bulk Select
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {episodeSlots.map((epNum) => {
                    const isSelected = selectedEpNums.includes(epNum);
                    return (
                      <button
                        key={epNum}
                        type="button"
                        onClick={() => handleToggleEpisode(epNum)}
                        className={`w-10 h-10 rounded-lg border text-xs font-bold tabular-nums transition-colors ${
                          isSelected
                            ? 'bg-[#10B981]/15 border-[#10B981]/55 text-[#10B981]'
                            : 'bg-[#171D27] border-white/[0.07] text-[#CBD5E1] hover:border-white/25'
                        }`}
                      >
                        {epNum}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Section 2: Select Quality (1080P, 720P, 480P, 360P) */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-md bg-[#6EE7B7] text-[#052E16] flex items-center justify-center">
                  <Video className="w-4 h-4" />
                </span>
                <span className="text-sm font-extrabold text-[#F8FAFC]">Select Quality</span>
                {loadingLinks && (
                  <span className="text-xs font-semibold text-[#00E5FF] inline-flex items-center gap-1">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Syncing formats...
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => setDataSaver((d) => !d)}
                className={`min-h-[32px] px-3 rounded-lg border text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${
                  dataSaver
                    ? 'bg-[#10B981]/15 border-[#10B981]/50 text-[#10B981]'
                    : 'bg-[#171D27] border-white/[0.08] text-[#CBD5E1] hover:border-white/20'
                }`}
              >
                <Gauge className="w-3.5 h-3.5" />
                Data Saver
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {qualityOptions.map((q) => {
                const isSelected = selectedQuality === q.label;
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => {
                      setSelectedQuality(q.label);
                      if (q.label !== '360P') setDataSaver(false);
                    }}
                    className={`relative rounded-xl border p-3.5 text-left transition-colors ${
                      isSelected
                        ? 'bg-[#1B1D1A] border-[#D4A72C]/70'
                        : 'bg-[#171D27] border-white/[0.07] hover:border-white/20'
                    }`}
                  >
                    {q.recommended && (
                      <span className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-[#FFB800]/20 text-[#FFB800] flex items-center justify-center">
                        <Star className="w-3 h-3 fill-[#FFB800]" />
                      </span>
                    )}
                    <div className="text-sm font-extrabold text-[#F8FAFC] tabular-nums">
                      {q.label}
                    </div>
                    <div className="text-[11px] font-semibold text-[#CBD5E1] mt-0.5">
                      {q.format}
                    </div>
                    <div className="text-[11px] text-[#94A3B8] mt-0.5 tabular-nums">
                      {q.size}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 3: Select Subtitle */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-md bg-white/[0.08] text-[#E2E8F0] flex items-center justify-center">
                  <Captions className="w-4 h-4" />
                </span>
                <span className="text-sm font-extrabold text-[#F8FAFC]">Select Subtitle</span>
              </div>
              {activeSubObj?.url && activeSubObj.code !== 'none' && (
                <button
                  type="button"
                  disabled={downloadingSub}
                  onClick={(e) => handleDownloadSubtitleOnly(activeSubObj, e)}
                  className="min-h-[30px] px-3 rounded-lg bg-[#161D27] hover:bg-[#1E2736] disabled:opacity-60 border border-[#00E5FF]/40 text-[11px] font-bold text-[#00E5FF] inline-flex items-center gap-1.5 transition-colors"
                >
                  {downloadingSub ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Download className="w-3 h-3" />
                  )}
                  {downloadingSub ? 'Saving Subtitle...' : `Download ${activeSubObj.label} (.VTT)`}
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {subtitleOptions.map((sub) => {
                const isSelected = selectedSub === sub.code;
                return (
                  <button
                    key={sub.code}
                    type="button"
                    onClick={() => setSelectedSub(sub.code)}
                    className={`relative rounded-xl border p-3.5 text-left transition-colors ${
                      isSelected
                        ? 'bg-[#10B981]/12 border-[#10B981]/55'
                        : 'bg-[#161D27] border-white/[0.08] hover:border-white/25 hover:bg-[#1B2330]'
                    }`}
                  >
                    {isSelected && (
                      <span className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-[#10B981]/20 text-[#10B981] flex items-center justify-center">
                        <Check className="w-3 h-3" />
                      </span>
                    )}
                    <div className="text-sm font-bold text-[#F8FAFC] pr-6 truncate">
                      {sub.label}
                    </div>
                    <div className="text-[11px] text-[#94A3B8] mt-1 tabular-nums">
                      {sub.size}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {downloadingVideo && downloadProgress && (
            <div className="p-3.5 rounded-xl bg-[#161D27] border border-[#00E5FF]/35 space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-bold text-[#00E5FF] truncate">{downloadProgress.label}</span>
                <button
                  type="button"
                  onClick={handleCancelDownload}
                  className="px-2.5 py-1 rounded-md bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 font-bold text-[11px] shrink-0"
                >
                  Cancel
                </button>
              </div>
              <div className="h-2 w-full rounded-full bg-[#0B0D12] overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#00E5FF] to-[#10B981] transition-all duration-200"
                  style={{ width: `${Math.max(3, downloadProgress.percent)}%` }}
                />
              </div>
            </div>
          )}

          {downloadError && (
            <div className="px-3.5 py-2.5 rounded-xl bg-rose-500/15 border border-rose-500/35 text-xs font-bold text-rose-200">
              {downloadError}
            </div>
          )}

          {downloadStatus && !downloadError && (
            <div className="px-3.5 py-2.5 rounded-xl bg-[#10B981]/15 border border-[#10B981]/35 text-xs font-bold text-[#10B981]">
              {downloadStatus}
            </div>
          )}

          {/* Action Footer */}
          <div className="pt-2 border-t border-white/[0.07] flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-[#94A3B8]">
              {isTitleAvailable
                ? `${activeQualityObj.label} (${activeQualityObj.format}) • ${activeSubLabel}`
                : 'No downloadable mirror linked yet — submit a request so we prioritize this title.'}
            </span>

            {isTitleAvailable ? (
              <button
                type="button"
                disabled={downloadingVideo || (loadingLinks && downloadableSources.length === 0)}
                onClick={handleStartDownload}
                className="min-h-[44px] px-6 rounded-full bg-[#10B981] hover:brightness-110 disabled:opacity-60 text-[#041811] text-xs sm:text-sm font-extrabold inline-flex items-center gap-2 transition-all"
              >
                {downloadingVideo ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {downloadProgress ? `Downloading ${downloadProgress.percent}%...` : 'Downloading...'}
                  </>
                ) : loadingLinks && downloadableSources.length === 0 ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Preparing Download...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Download Selected ({selectedQuality})
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                disabled={requesting}
                onClick={onRequestTitle}
                className={`min-h-[44px] px-6 rounded-full text-xs sm:text-sm font-extrabold inline-flex items-center gap-2 transition-all ${
                  hasRequested
                    ? 'bg-[#10B981]/20 border border-[#10B981]/45 text-[#10B981]'
                    : 'bg-[#00E5FF] hover:bg-[#33ECFF] text-[#071018]'
                }`}
              >
                {hasRequested ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {requesting
                  ? 'Sending Request...'
                  : hasRequested
                  ? 'Requested'
                  : 'Request Download & Stream Link'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
