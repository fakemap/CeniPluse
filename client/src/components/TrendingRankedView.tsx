import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Play, Star, Loader2 } from 'lucide-react';
import type { MediaItem } from '../types/media';
import { HoverPreviewCard } from './HoverPreviewCard';

interface TrendingRankedViewProps {
  catalog: MediaItem[];
  watchlistIds: Set<string>;
  onBackHome: () => void;
  onPlay: (item: MediaItem) => void;
  onSelect: (item: MediaItem) => void;
  onToggleWatchlist: (id: string) => void;
}

const RANKING_FILTERS = [
  'All',
  'Hollywood',
  'Nollywood',
  'Bollywood',
  'K-Drama',
  'Animation',
  'Cartoon',
  'Anime',
  'Action',
  'Romance',
  'Horror',
  'Sci-Fi',
];

function isFineDesktopPointer(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.innerWidth >= 1024 &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches
  );
}

interface RankedCardProps {
  item: MediaItem;
  rank: number;
  inWatchlist: boolean;
  onPlay: (item: MediaItem) => void;
  onSelect: (item: MediaItem) => void;
  onToggleWatchlist: (id: string) => void;
}

const RankedCard: React.FC<RankedCardProps> = ({
  item,
  rank,
  inWatchlist,
  onPlay,
  onSelect,
  onToggleWatchlist,
}) => {
  const posterRef = useRef<HTMLDivElement>(null);
  const enterTimer = useRef<number | null>(null);
  const leaveTimer = useRef<number | null>(null);
  const [previewRect, setPreviewRect] = useState<DOMRect | null>(null);

  const rankBadgeClass =
    rank === 1
      ? 'bg-[#E11D48] text-white'
      : rank === 2
      ? 'bg-[#EA580C] text-white'
      : rank === 3
      ? 'bg-[#D97706] text-white'
      : 'bg-[#1E2430]/95 border border-white/15 text-[#F8FAFC]';

  const handleMouseEnter = () => {
    if (!isFineDesktopPointer()) return;
    if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
    enterTimer.current = window.setTimeout(() => {
      if (posterRef.current) {
        setPreviewRect(posterRef.current.getBoundingClientRect());
      }
    }, 280);
  };

  const handleMouseLeave = () => {
    if (enterTimer.current) window.clearTimeout(enterTimer.current);
    leaveTimer.current = window.setTimeout(() => {
      setPreviewRect(null);
    }, 120);
  };

  return (
    <>
      <article
        onClick={() => onSelect(item)}
        className="group flex gap-3.5 rounded-2xl p-2 -m-2 hover:bg-[#141821]/70 cursor-pointer transition-colors"
      >
        {/* Left 2:3 Poster + Rank Number Badge */}
        <div
          ref={posterRef}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          className="relative w-[104px] sm:w-[114px] aspect-[2/3] rounded-xl overflow-hidden bg-[#141821] border border-white/[0.08] shrink-0"
        >
          <img
            src={item.poster}
            alt={item.title}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
          <span
            className={`absolute top-0 left-0 px-2 py-0.5 rounded-br-lg text-xs font-black tabular-nums ${rankBadgeClass}`}
          >
            {rank}
          </span>
        </div>

        {/* Right Details + Synopsis + Play Button */}
        <div className="min-w-0 flex-1 flex flex-col justify-between py-0.5">
          <div>
            <h3 className="text-sm sm:text-[15px] font-extrabold text-[#F8FAFC] line-clamp-1 group-hover:text-[#00E5FF] transition-colors">
              {item.title}
            </h3>

            <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] font-semibold text-[#94A3B8] tabular-nums">
              <span className="inline-flex items-center gap-0.5 text-[#FFB800] font-bold">
                <Star className="w-3 h-3 fill-[#FFB800]" />
                {item.rating.toFixed(1)}
              </span>
              <span>{item.year}</span>
              {item.genres.slice(0, 3).map((g) => (
                <React.Fragment key={g}>
                  <span className="text-white/25">&bull;</span>
                  <span>{g}</span>
                </React.Fragment>
              ))}
            </div>

            <p className="mt-1.5 text-[11.5px] text-[#94A3B8] line-clamp-3 leading-relaxed">
              {item.overview}
            </p>
          </div>

          <div className="mt-2.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPlay(item);
              }}
              className="h-8 px-3.5 rounded-md bg-[#F8FAFC] hover:bg-[#00E5FF] text-[#071018] text-xs font-extrabold inline-flex items-center gap-1.5 transition-colors"
            >
              <Play className="w-3 h-3 fill-current" />
              Play
            </button>
          </div>
        </div>
      </article>

      {previewRect && (
        <HoverPreviewCard
          item={item}
          anchorRect={previewRect}
          inWatchlist={inWatchlist}
          onMouseEnter={() => {
            if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
          }}
          onMouseLeave={() => setPreviewRect(null)}
          onPlay={(m) => {
            setPreviewRect(null);
            onPlay(m);
          }}
          onSelect={(m) => {
            setPreviewRect(null);
            onSelect(m);
          }}
          onToggleWatchlist={onToggleWatchlist}
        />
      )}
    </>
  );
};

export const TrendingRankedView: React.FC<TrendingRankedViewProps> = ({
  catalog,
  watchlistIds,
  onBackHome,
  onPlay,
  onSelect,
  onToggleWatchlist,
}) => {
  const [activeFilter, setActiveFilter] = useState<string>('All');
  const [limit, setLimit] = useState(40);

  const rankedItems = useMemo(() => {
    const filtered = catalog.filter((m) => {
      if (activeFilter === 'All') return true;
      if (m.regionTag.toLowerCase() === activeFilter.toLowerCase()) return true;
      return m.genres.some((g) => g.toLowerCase() === activeFilter.toLowerCase());
    });

    return [...filtered].sort((a, b) => {
      const aPlay = a.sources.length > 0 ? 1 : 0;
      const bPlay = b.sources.length > 0 ? 1 : 0;
      if (aPlay !== bPlay) return bPlay - aPlay;
      return b.rating - a.rating || b.year - a.year;
    });
  }, [catalog, activeFilter]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setLimit((n) => Math.min(n + 36, rankedItems.length));
        }
      },
      { rootMargin: '450px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [rankedItems.length, limit]);

  return (
    <div className="px-4 md:px-0 space-y-4 pb-8">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-[#94A3B8]">
        <button
          type="button"
          onClick={onBackHome}
          className="hover:text-[#F8FAFC] font-medium transition-colors"
        >
          Home
        </button>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-[#CBD5E1] font-semibold">Trending Movies</span>
      </nav>

      <h1 className="text-xl sm:text-2xl font-extrabold text-[#F8FAFC] tracking-tight">
        Trending Movies
      </h1>

      {/* Horizontal Filter Pill Bar */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {RANKING_FILTERS.map((tag) => {
          const isSelected = activeFilter === tag;
          return (
            <button
              key={tag}
              type="button"
              onClick={() => {
                setActiveFilter(tag);
                setLimit(40);
              }}
              className={`shrink-0 min-h-[36px] px-4 rounded-lg text-xs font-bold border transition-colors ${
                isSelected
                  ? 'bg-[#F8FAFC] border-[#F8FAFC] text-[#071018]'
                  : 'bg-[#141821] border-white/[0.08] text-[#CBD5E1] hover:border-white/25'
              }`}
            >
              {tag}
            </button>
          );
        })}
      </div>

      {/* 4-Column Desktop Ranked Horizontal Card Grid */}
      {rankedItems.length > 0 ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-x-5 gap-y-6 pt-1">
            {rankedItems.slice(0, limit).map((item, idx) => (
              <RankedCard
                key={item.id}
                item={item}
                rank={idx + 1}
                inWatchlist={watchlistIds.has(item.id)}
                onPlay={onPlay}
                onSelect={onSelect}
                onToggleWatchlist={onToggleWatchlist}
              />
            ))}
          </div>

          {rankedItems.length > limit && (
            <div ref={sentinelRef} className="pt-6 pb-12 flex justify-center">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#141821] border border-[#00E5FF]/40 text-xs font-bold text-[#00E5FF] shadow-lg animate-pulse">
                <Loader2 className="w-4 h-4 animate-spin text-[#00E5FF]" />
                <span>Loading more titles ({limit} of {rankedItems.length})...</span>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="rounded-2xl bg-[#141821] border border-white/[0.06] py-14 px-6 text-center">
          <p className="text-sm font-bold text-[#F8FAFC]">
            No titles found for &ldquo;{activeFilter}&rdquo;
          </p>
          <button
            type="button"
            onClick={() => setActiveFilter('All')}
            className="mt-3 min-h-[40px] px-5 rounded-full bg-[#00E5FF] text-[#071018] text-xs font-extrabold"
          >
            Show All Titles
          </button>
        </div>
      )}
    </div>
  );
};
