import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { MediaItem } from '../types/media';
import { PosterCard } from './PosterCard';

interface ContentRailProps {
  title: string;
  items: MediaItem[];
  watchlistIds: Set<string>;
  onMore?: () => void;
  onPlay: (item: MediaItem) => void;
  onSelect: (item: MediaItem) => void;
  onToggleWatchlist: (id: string) => void;
}

export const ContentRail: React.FC<ContentRailProps> = ({
  title,
  items,
  watchlistIds,
  onMore,
  onPlay,
  onSelect,
  onToggleWatchlist,
}) => {
  const railRef = useRef<HTMLDivElement>(null);

  if (!items.length) return null;

  const scrollByAmount = (direction: 'left' | 'right') => {
    if (!railRef.current) return;
    const delta = railRef.current.clientWidth * 0.78;
    railRef.current.scrollBy({
      left: direction === 'right' ? delta : -delta,
      behavior: 'smooth',
    });
  };

  return (
    <section className="mb-6 md:mb-8 relative group/rail">
      {/* Bold Section Header + Touch-Friendly More > Action */}
      <div className="flex items-center justify-between px-4 md:px-0 mb-2.5 md:mb-3">
        <div className="flex items-center gap-2">
          <span className="w-1 h-4 md:h-5 rounded-full bg-[#00E5FF]" />
          <h2 className="text-[15px] md:text-lg font-extrabold tracking-[-0.015em] text-[#F8FAFC]">
            {title}
          </h2>
        </div>

        {onMore && (
          <button
            type="button"
            onClick={onMore}
            className="min-h-[44px] px-1.5 text-xs font-bold text-[#94A3B8] hover:text-[#00E5FF] active:text-[#00E5FF] inline-flex items-center gap-0.5 transition-colors"
          >
            Explore All
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Horizontal Touch Rail with Mobile "Peek" Effect & Desktop Edge Masks */}
      <div className="relative">
        {/* Desktop subtle left/right edge fade masks */}
        <div className="hidden lg:block pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-[#0B0D12]/90 to-transparent z-10 opacity-0 group-hover/rail:opacity-100 transition-opacity" />
        <div className="hidden lg:block pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-[#0B0D12]/90 to-transparent z-10" />

        <button
          type="button"
          onClick={() => scrollByAmount('left')}
          aria-label={`Scroll ${title} left`}
          className="hidden lg:flex absolute -left-3 top-[38%] -translate-y-1/2 z-20 min-w-[44px] min-h-[44px] rounded-full bg-[#141821]/90 hover:bg-[#00E5FF] text-[#F8FAFC] hover:text-[#071018] border border-white/15 backdrop-blur-xl items-center justify-center shadow-2xl opacity-0 group-hover/rail:opacity-100 transition-all"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div
          ref={railRef}
          className="flex overflow-x-auto gap-3 px-4 md:px-0 md:gap-3.5 snap-x snap-mandatory scrollbar-hide pb-1.5 scroll-smooth"
        >
          {items.map((item) => (
            <div
              key={item.id}
              className="shrink-0 snap-start w-[31%] min-w-[115px] md:w-[calc((100%-48px)/4.4)] lg:w-[calc((100%-70px)/6)] xl:w-[calc((100%-84px)/7)] 2xl:w-[calc((100%-98px)/8)] min-[1800px]:w-[calc((100%-112px)/9)] min-[2200px]:w-[calc((100%-126px)/10)]"
            >
              <PosterCard
                item={item}
                inWatchlist={watchlistIds.has(item.id)}
                onPlay={onPlay}
                onSelect={onSelect}
                onToggleWatchlist={onToggleWatchlist}
              />
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => scrollByAmount('right')}
          aria-label={`Scroll ${title} right`}
          className="hidden lg:flex absolute -right-3 top-[38%] -translate-y-1/2 z-20 min-w-[44px] min-h-[44px] rounded-full bg-[#141821]/90 hover:bg-[#00E5FF] text-[#F8FAFC] hover:text-[#071018] border border-white/15 backdrop-blur-xl items-center justify-center shadow-2xl opacity-0 group-hover/rail:opacity-100 transition-all"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </section>
  );
};
