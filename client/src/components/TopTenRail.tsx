import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight, TrendingUp } from 'lucide-react';
import type { MediaItem } from '../types/media';
import { PosterCard } from './PosterCard';

interface TopTenRailProps {
  title?: string;
  subtitle?: string;
  items: MediaItem[];
  watchlistIds: Set<string>;
  onPlay: (item: MediaItem) => void;
  onSelect: (item: MediaItem) => void;
  onToggleWatchlist: (id: string) => void;
}

export const TopTenRail: React.FC<TopTenRailProps> = ({
  title = 'Top 10 on CeniPluse Today',
  subtitle = 'Most streamed films & series across the platform',
  items,
  watchlistIds,
  onPlay,
  onSelect,
  onToggleWatchlist,
}) => {
  const railRef = useRef<HTMLDivElement>(null);
  const topItems = items.slice(0, 10);

  if (!topItems.length) return null;

  const scrollByAmount = (direction: 'left' | 'right') => {
    if (!railRef.current) return;
    const delta = railRef.current.clientWidth * 0.75;
    railRef.current.scrollBy({
      left: direction === 'right' ? delta : -delta,
      behavior: 'smooth',
    });
  };

  return (
    <section className="mb-7 md:mb-9 relative group/rail">
      {/* Editorial Section Header */}
      <div className="flex items-end justify-between px-4 md:px-0 mb-3 md:mb-4">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-xl bg-[#00E5FF]/15 border border-[#00E5FF]/35 flex items-center justify-center text-[#00E5FF]">
            <TrendingUp className="w-4 h-4" />
          </span>
          <div>
            <h2 className="text-[16px] md:text-[19px] font-black tracking-[-0.02em] text-[#F8FAFC] leading-tight">
              {title}
            </h2>
            <p className="text-[11px] md:text-xs text-[#94A3B8] font-medium">
              {subtitle}
            </p>
          </div>
        </div>
      </div>

      {/* Horizontal Touch Rail with Oversized Outlined Rank Numerals (1–10) */}
      <div className="relative">
        {/* Left / Right Subtle Edge Fade Masks on Desktop */}
        <div className="hidden lg:block pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-[#0B0D12] to-transparent z-10 opacity-0 group-hover/rail:opacity-100 transition-opacity" />
        <div className="hidden lg:block pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-[#0B0D12] to-transparent z-10" />

        <button
          type="button"
          onClick={() => scrollByAmount('left')}
          aria-label="Scroll Top 10 left"
          className="hidden lg:flex absolute -left-3 top-[40%] -translate-y-1/2 z-20 min-w-[44px] min-h-[44px] rounded-full bg-[#141821]/90 hover:bg-[#00E5FF] text-[#F8FAFC] hover:text-[#071018] border border-white/15 backdrop-blur-xl items-center justify-center shadow-2xl opacity-0 group-hover/rail:opacity-100 transition-all"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div
          ref={railRef}
          className="flex overflow-x-auto gap-3 md:gap-5 px-4 md:px-0 scroll-px-4 md:scroll-px-0 snap-x snap-mandatory scrollbar-hide pb-2 pt-1 scroll-smooth"
        >
          {topItems.map((item, idx) => {
            const rank = idx + 1;
            return (
              <div
                key={`top10-${item.id}`}
                className="relative shrink-0 snap-start flex items-start pl-8 md:pl-11 w-[48%] min-w-[172px] md:w-[220px] lg:w-[240px]"
              >
                {/* Oversized Outlined Rank Numeral Tucked Strictly Behind Poster (Never Overlaps Title/Genre Below) */}
                <span
                  aria-hidden="true"
                  className={`rank-numeral select-none pointer-events-none absolute top-[118px] sm:top-[132px] md:top-[148px] z-0 font-black tabular-nums leading-[0.8] tracking-[-0.08em] transition-transform duration-300 lg:group-hover:scale-105 ${
                    rank === 10
                      ? '-left-1 md:-left-1.5 text-[62px] md:text-[98px]'
                      : 'left-0 md:left-0.5 text-[76px] md:text-[116px]'
                  }`}
                >
                  {rank}
                </span>

                {/* Foreground 2:3 Poster Card */}
                <div className="relative z-10 w-full">
                  <PosterCard
                    item={item}
                    inWatchlist={watchlistIds.has(item.id)}
                    onPlay={onPlay}
                    onSelect={onSelect}
                    onToggleWatchlist={onToggleWatchlist}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => scrollByAmount('right')}
          aria-label="Scroll Top 10 right"
          className="hidden lg:flex absolute -right-3 top-[40%] -translate-y-1/2 z-20 min-w-[44px] min-h-[44px] rounded-full bg-[#141821]/90 hover:bg-[#00E5FF] text-[#F8FAFC] hover:text-[#071018] border border-white/15 backdrop-blur-xl items-center justify-center shadow-2xl opacity-0 group-hover/rail:opacity-100 transition-all"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </section>
  );
};
