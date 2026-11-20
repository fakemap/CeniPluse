import React from 'react';
import { Play } from 'lucide-react';
import type { MediaItem } from '../types/media';

interface SpotlightMiniRailProps {
  items: MediaItem[];
  onPlay: (item: MediaItem) => void;
  onSelect: (item: MediaItem) => void;
}

export const SpotlightMiniRail: React.FC<SpotlightMiniRailProps> = ({
  items,
  onPlay,
  onSelect,
}) => {
  if (!items || items.length === 0) return null;

  return (
    <section className="mb-4 md:mb-6">
      <div className="flex gap-2.5 overflow-x-auto px-5 sm:px-6 md:px-0 scroll-px-5 sm:scroll-px-6 scrollbar-hide pb-1 snap-x">
        {items.map((item) => (
          <div
            key={`mini-${item.id}`}
            onClick={() => onSelect(item)}
            className="shrink-0 snap-start w-[235px] sm:w-[260px] h-[68px] rounded-2xl bg-[#141821]/90 backdrop-blur-sm border border-white/[0.08] hover:border-[#00E5FF]/40 p-2 flex items-center gap-2.5 cursor-pointer active:scale-[0.98] transition-all shadow-md group"
          >
            <img
              src={item.poster || item.backdrop}
              alt={item.title}
              loading="lazy"
              decoding="async"
              className="w-10 h-full rounded-xl object-cover bg-[#0B0D12] shrink-0"
            />
            <div className="flex-1 min-w-0 pr-1">
              <h3 className="text-xs font-bold text-[#F8FAFC] truncate group-hover:text-[#00E5FF] transition-colors leading-tight">
                {item.title}
              </h3>
              <div className="flex items-center gap-1.5 text-[10.5px] text-[#94A3B8] mt-1 tabular-nums">
                <span className="text-[#10B981] font-bold">{item.year}</span>
                <span className="text-white/25">&bull;</span>
                <span className="truncate">{item.genres[0] || 'Movie'}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPlay(item);
              }}
              aria-label={`Play ${item.title}`}
              className="w-8 h-8 rounded-full bg-[#10B981] hover:brightness-110 active:scale-90 text-[#041811] flex items-center justify-center shrink-0 shadow-sm transition-transform"
            >
              <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
};
