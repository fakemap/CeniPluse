import React, { useEffect, useState } from 'react';
import { Search, X, TrendingUp } from 'lucide-react';
import type { MediaItem } from '../types/media';
import { backendApi } from '../services/api';
import { trackEvent } from '../services/analytics';
import { PosterCard } from './PosterCard';
import { GridSkeleton } from './SkeletonLoaders';

interface MobileSearchViewProps {
  catalog: MediaItem[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  watchlistIds: Set<string>;
  onPlay: (item: MediaItem) => void;
  onSelect: (item: MediaItem) => void;
  onToggleWatchlist: (id: string) => void;
}

const QUICK_SEARCH_TAGS = [
  'Action',
  'Sci-Fi',
  'Nollywood',
  'K-Drama',
  'Animation',
  'Horror',
  'Thriller',
  '2026',
];

export const MobileSearchView: React.FC<MobileSearchViewProps> = ({
  catalog,
  searchQuery,
  onSearchChange,
  watchlistIds,
  onPlay,
  onSelect,
  onToggleWatchlist,
}) => {
  const [liveItems, setLiveItems] = useState<MediaItem[]>([]);
  const [isSearchingLive, setIsSearchingLive] = useState(false);

  useEffect(() => {
    const term = searchQuery.trim();
    if (term.length < 2) {
      setLiveItems([]);
      setIsSearchingLive(false);
      return;
    }
    const controller = new AbortController();
    setIsSearchingLive(true);
    const timer = setTimeout(async () => {
      const liveMatches = await backendApi.searchLiveTmdb(term, controller.signal);
      if (!controller.signal.aborted) {
        setLiveItems(liveMatches || []);
        setIsSearchingLive(false);
        trackEvent({ eventType: 'search', searchQuery: term, pagePath: 'search' });
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery]);

  const term = searchQuery.trim().toLowerCase();
  const localResults = term
    ? catalog.filter(
        (m) =>
          m.title.toLowerCase().includes(term) ||
          m.country.toLowerCase().includes(term) ||
          m.regionTag.toLowerCase().includes(term) ||
          String(m.year).includes(term) ||
          m.genres.some((g) => g.toLowerCase().includes(term)) ||
          m.cast.some((c) => c.toLowerCase().includes(term))
      )
    : [];

  const seen = new Set(localResults.map((m) => m.title.toLowerCase()));
  const merged = [
    ...localResults,
    ...liveItems.filter((m) => !seen.has(m.title.toLowerCase())),
  ];

  const trendingDefault = catalog.filter((m) => m.trending).slice(0, 12);

  return (
    <div className="space-y-4">
      {/* Sticky Touch-Friendly Search Input */}
      <div className="px-4 md:px-0">
        <div className="flex items-center min-h-[48px] rounded-2xl bg-[#141821] border border-white/10 focus-within:border-[#00E5FF] px-3.5 gap-2.5 shadow-lg">
          <Search className="w-5 h-5 text-[#00E5FF] shrink-0" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search movies, series, cast, genres..."
            autoFocus
            className="w-full bg-transparent text-sm text-[#F8FAFC] placeholder-[#94A3B8] focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="Clear search"
              className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center text-[#94A3B8] active:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Quick Discovery Chips */}
      {!term && (
        <div className="space-y-4">
          <div className="px-4 md:px-0">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#94A3B8] mb-2.5">
              <TrendingUp className="w-3.5 h-3.5 text-[#00E5FF]" />
              Popular Searches
            </div>
            <div className="flex flex-wrap gap-2">
              {QUICK_SEARCH_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => onSearchChange(tag)}
                  className="min-h-[44px] px-4 rounded-full bg-[#141821] active:scale-[0.98] active:bg-[#00E5FF] active:text-[#071018] border border-white/[0.08] text-xs font-semibold text-[#CBD5E1] transition-all"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h2 className="px-4 md:px-0 text-sm font-extrabold text-[#F8FAFC] mb-2.5">
              Trending Searches
            </h2>
            <div className="grid grid-cols-2 gap-3 px-4 sm:grid-cols-3 md:px-0 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7">
              {trendingDefault.map((item) => (
                <PosterCard
                  key={item.id}
                  item={item}
                  inWatchlist={watchlistIds.has(item.id)}
                  onPlay={onPlay}
                  onSelect={onSelect}
                  onToggleWatchlist={onToggleWatchlist}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Live Search Results */}
      {term && (
        <div>
          <div className="flex items-center justify-between px-4 md:px-0 mb-2.5">
            <h2 className="text-sm font-extrabold text-[#F8FAFC]">
              Results for &ldquo;{searchQuery}&rdquo;
            </h2>
            <span className="text-xs font-semibold text-[#94A3B8]">
              {isSearchingLive ? 'Searching...' : `${merged.length} found`}
            </span>
          </div>

          {isSearchingLive && merged.length === 0 ? (
            <GridSkeleton count={9} />
          ) : merged.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 px-4 sm:grid-cols-3 md:px-0 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7">
              {merged.map((item) => (
                <PosterCard
                  key={item.id}
                  item={item}
                  inWatchlist={watchlistIds.has(item.id)}
                  onPlay={onPlay}
                  onSelect={onSelect}
                  onToggleWatchlist={onToggleWatchlist}
                />
              ))}
            </div>
          ) : (
            <div className="mx-4 md:mx-0 rounded-2xl bg-[#141821] border border-white/[0.06] py-14 px-6 text-center">
              <p className="text-sm font-bold text-[#F8FAFC]">No titles matched your search</p>
              <p className="text-xs text-[#94A3B8] mt-1">
                Try searching by genre, country, actor, or movie title.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
