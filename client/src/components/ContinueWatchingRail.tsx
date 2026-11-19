import React from 'react';
import { Play, X, Clock, Info } from 'lucide-react';
import type { MediaItem } from '../types/media';

export interface WatchProgressEntry {
  mediaId: string;
  positionSec: number;
  durationSec: number;
  seasonNumber?: number;
  episodeNumber?: number;
  updatedAt?: string;
}

interface ContinueWatchingRailProps {
  entries: Array<{ item: MediaItem; progress: WatchProgressEntry }>;
  onResume: (item: MediaItem) => void;
  onSelect: (item: MediaItem) => void;
  onRemove: (mediaId: string) => void;
}

function formatRemaining(positionSec: number, durationSec: number): string {
  const safeDuration = durationSec > 0 ? durationSec : 5400;
  const remainingSec = Math.max(0, safeDuration - positionSec);
  const minsLeft = Math.max(1, Math.round(remainingSec / 60));
  if (minsLeft >= 60) {
    const h = Math.floor(minsLeft / 60);
    const m = minsLeft % 60;
    return `${h}h ${m}m left`;
  }
  return `${minsLeft}m left`;
}

export const ContinueWatchingRail: React.FC<ContinueWatchingRailProps> = ({
  entries,
  onResume,
  onSelect,
  onRemove,
}) => {
  if (!entries.length) return null;

  return (
    <section className="mb-6 md:mb-8">
      <div className="flex items-center justify-between px-4 md:px-0 mb-2.5 md:mb-3">
        <div className="flex items-center gap-2">
          <span className="w-1 h-4 md:h-5 rounded-full bg-[#00E5FF]" />
          <h2 className="text-[15px] md:text-lg font-extrabold tracking-tight text-[#F8FAFC]">
            Continue Watching
          </h2>
          <span className="px-2 py-0.5 rounded-full bg-[#141821] border border-white/10 text-[10px] font-bold text-[#00E5FF] tabular-nums">
            {entries.length}
          </span>
        </div>
      </div>

      <div className="flex overflow-x-auto gap-3 md:gap-4 px-4 md:px-0 scroll-px-4 md:scroll-px-0 snap-x snap-mandatory scrollbar-hide pb-1">
        {entries.map(({ item, progress }) => {
          const safeDuration = progress.durationSec > 0 ? progress.durationSec : 5400;
          const pct = Math.min(
            96,
            Math.max(6, Math.round((progress.positionSec / safeDuration) * 100))
          );

          return (
            <article
              key={`cw-${item.id}`}
              className="group relative shrink-0 snap-start w-[74%] min-w-[240px] sm:w-[270px] md:w-[295px] rounded-2xl overflow-hidden bg-[#141821] border border-white/[0.08] hover:border-[#00E5FF]/45 cinema-sheen transition-all"
            >
              {/* 16:9 Widescreen Backdrop Thumbnail */}
              <div
                onClick={() => onResume(item)}
                className="relative aspect-video bg-[#0B0D12] overflow-hidden cursor-pointer"
              >
                <img
                  src={item.backdrop || item.poster}
                  alt={item.title}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0B0D12] via-[#0B0D12]/35 to-black/30" />

                {/* Top-left Episode or Resume Pill */}
                <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-[#0B0D12]/80 backdrop-blur-md border border-white/10 text-[10px] font-bold text-[#F8FAFC] tabular-nums">
                  {progress.seasonNumber && progress.episodeNumber
                    ? `S${progress.seasonNumber}:E${progress.episodeNumber}`
                    : item.type === 'series'
                    ? 'S1:E1'
                    : 'RESUME'}
                </span>

                {/* Top-right Remove from Continue Watching (44x44 touch hit target) */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(item.id);
                  }}
                  title="Remove from Continue Watching"
                  aria-label={`Remove ${item.title} from Continue Watching`}
                  className="absolute top-1 right-1 min-w-[40px] min-h-[40px] rounded-full flex items-center justify-center text-white/80 hover:text-white"
                >
                  <span className="w-7 h-7 rounded-full bg-[#0B0D12]/80 hover:bg-rose-500/90 border border-white/15 backdrop-blur-md flex items-center justify-center transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </span>
                </button>

                {/* Center Glass Play Button */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="w-11 h-11 rounded-full bg-[#00E5FF]/95 text-[#071018] flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
                    <Play className="w-5 h-5 fill-current ml-0.5" />
                  </span>
                </div>

                {/* Bottom Time Remaining Label */}
                <div className="absolute bottom-2.5 inset-x-3 flex items-center justify-between text-[11px] font-semibold text-[#CBD5E1] tabular-nums">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3 h-3 text-[#00E5FF]" />
                    {formatRemaining(progress.positionSec, safeDuration)}
                  </span>
                  <span className="text-[10px] font-bold text-[#00E5FF]">{pct}%</span>
                </div>

                {/* Crisp Electric Cyan Playback Progress Bar */}
                <div className="absolute inset-x-0 bottom-0 h-1 bg-white/15">
                  <div
                    style={{ width: `${pct}%` }}
                    className="h-full bg-[#00E5FF]"
                  />
                </div>
              </div>

              {/* Card Footer with Title + Details Trigger */}
              <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
                <div
                  onClick={() => onResume(item)}
                  className="min-w-0 flex-1 cursor-pointer"
                >
                  <h3 className="text-xs md:text-[13px] font-bold text-[#F8FAFC] truncate group-hover:text-[#00E5FF] transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-[10.5px] text-[#94A3B8] truncate tabular-nums">
                    {item.year} &bull; {item.genres[0] || 'Cinema'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => onSelect(item)}
                  aria-label={`Details for ${item.title}`}
                  title="Details & Episodes"
                  className="shrink-0 w-8 h-8 rounded-full bg-[#1E2430] hover:bg-white/15 border border-white/10 text-[#CBD5E1] hover:text-white flex items-center justify-center transition-colors"
                >
                  <Info className="w-3.5 h-3.5" />
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
