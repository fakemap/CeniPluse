import React, { useEffect, useRef, useState } from 'react';
import { Star, Film } from 'lucide-react';
import type { MediaItem } from '../types/media';
import { HoverPreviewCard } from './HoverPreviewCard';

interface PosterCardProps {
  item: MediaItem;
  showCast?: boolean;
  showDirectoryBadges?: boolean;
  inWatchlist: boolean;
  onPlay: (item: MediaItem) => void;
  onSelect: (item: MediaItem) => void;
  onToggleWatchlist: (id: string) => void;
}

function isFineDesktopPointer(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.innerWidth >= 1024 &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches
  );
}

export const PosterCard: React.FC<PosterCardProps> = ({
  item,
  showCast = false,
  showDirectoryBadges = true,
  inWatchlist,
  onPlay,
  onSelect,
  onToggleWatchlist,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const posterFrameRef = useRef<HTMLDivElement>(null);
  const enterTimer = useRef<number | null>(null);
  const leaveTimer = useRef<number | null>(null);
  const [previewRect, setPreviewRect] = useState<DOMRect | null>(null);
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  const clearTimers = () => {
    if (enterTimer.current) window.clearTimeout(enterTimer.current);
    if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
  };

  useEffect(() => () => clearTimers(), []);

  useEffect(() => {
    if (!previewRect) return;
    const onScroll = () => setPreviewRect(null);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [previewRect]);

  const handleMouseEnter = () => {
    // Strictly disabled on mobile / touch devices — desktop lg+ fine pointer only
    if (!isFineDesktopPointer()) return;
    if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
    enterTimer.current = window.setTimeout(() => {
      const anchorEl = posterFrameRef.current || cardRef.current;
      if (anchorEl) {
        setPreviewRect(anchorEl.getBoundingClientRect());
      }
    }, 280);
  };

  const handleMouseLeave = () => {
    if (enterTimer.current) window.clearTimeout(enterTimer.current);
    leaveTimer.current = window.setTimeout(() => {
      setPreviewRect(null);
    }, 120);
  };

  const handlePreviewEnter = () => {
    if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
  };

  const handlePreviewLeave = () => {
    setPreviewRect(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(item);
    }
  };

  const isVip = item.badge === 'VIP';
  const isAvailable = Boolean(
    item.sources.length > 0 || item.tmdbId || item.malId || item.embedUrl || item.hasStreamLinks
  );
  const isRequestable = !isAvailable;
  const cleanBadge = item.badge === 'Request' && isAvailable ? item.quality || 'HD' : item.badge;
  const topRightLabel = isRequestable ? 'Request' : cleanBadge || item.quality;

  return (
    <>
      <article
        ref={cardRef}
        role="button"
        tabIndex={0}
        aria-label={`${item.title} (${item.year}), rated ${item.rating.toFixed(1)}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={() => onSelect(item)}
        onKeyDown={handleKeyDown}
        className="group cursor-pointer select-none flex flex-col rounded-xl active:scale-[0.97] transition-transform duration-150"
      >
        {/* Strict Vertical 2:3 Poster Frame with Shimmer Reveal & Cinema Sheen */}
        <div ref={posterFrameRef} className="relative aspect-[2/3] rounded-xl overflow-hidden bg-[#141821] border border-white/[0.08] cinema-sheen lg:group-hover:border-[#00E5FF]/50 lg:group-hover:shadow-[0_12px_32px_rgba(0,0,0,0.65)] transition-all duration-300">
          {!imgError && item.poster ? (
            <>
              {!imgLoaded && (
                <div className="absolute inset-0 skeleton-shimmer pointer-events-none" />
              )}
              <img
                src={item.poster}
                alt={item.title}
                loading="lazy"
                decoding="async"
                onLoad={() => setImgLoaded(true)}
                onError={() => setImgError(true)}
                className={`w-full h-full object-cover lg:group-hover:scale-[1.05] transition-all duration-500 ${
                  imgLoaded ? 'opacity-100' : 'opacity-0'
                }`}
              />
            </>
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#141821] via-[#1E2430] to-[#0B0D12] p-3 flex flex-col items-center justify-center text-center gap-2">
              <Film className="w-7 h-7 text-[#00E5FF]/60" />
              <span className="text-[11px] font-bold text-[#CBD5E1] line-clamp-3 leading-snug">
                {item.title}
              </span>
            </div>
          )}

          {/* Bottom legibility gradient */}
          <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-[#0B0D12]/95 via-[#0B0D12]/35 to-transparent pointer-events-none" />

          {/* Top-Left Compact Emerald Release Year Badge */}
          {showDirectoryBadges && (
            <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-[#10B981]/95 text-[#041811] text-[9.5px] md:text-[10px] font-extrabold tabular-nums leading-none shadow-sm">
              {item.year}
            </span>
          )}

          {/* Top-Right Quality / Request Status Tag */}
          {showDirectoryBadges && (isRequestable || item.badge || item.quality) && (
            <span
              className={`absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[9.5px] md:text-[10px] font-extrabold leading-none backdrop-blur-md ${
                isRequestable
                  ? 'bg-[#0B0D12]/85 border border-[#FFB800]/50 text-[#FFB800]'
                  : isVip
                  ? 'bg-[#FFB800] text-[#1A1200]'
                  : 'bg-[#0B0D12]/80 border border-white/15 text-[#00E5FF]'
              }`}
            >
              {topRightLabel}
            </span>
          )}

          {/* Bottom-Right Warm Amber Rating Badge */}
          <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-[#0B0D12]/85 backdrop-blur-sm border border-white/[0.06] text-[10px] md:text-[11px] font-bold tabular-nums text-[#FFB800] inline-flex items-center gap-0.5">
            <Star className="w-2.5 h-2.5 fill-[#FFB800]" />
            {item.rating.toFixed(1)}
          </span>
        </div>

        {/* Crisp 2-Line Mobile / 1-Line Desktop Title & Genre */}
        <div className="pt-1.5 md:pt-2 px-0.5">
          <h3 className="text-[12.5px] md:text-[13px] font-semibold text-[#F8FAFC] leading-snug line-clamp-2 md:line-clamp-1 lg:group-hover:text-[#00E5FF] transition-colors">
            {item.title}
          </h3>
          {showCast ? (
            <p className="hidden md:block text-[11px] text-[#94A3B8] line-clamp-1 mt-0.5">
              {item.cast.join(', ')}
            </p>
          ) : (
            <p className="text-[10.5px] md:text-[11px] text-[#94A3B8] line-clamp-1 mt-0.5">
              {item.genres[0]}
            </p>
          )}
        </div>
      </article>

      {/* Desktop-Only Floating Hover Preview Card */}
      {previewRect && (
        <HoverPreviewCard
          item={item}
          anchorRect={previewRect}
          inWatchlist={inWatchlist}
          onMouseEnter={handlePreviewEnter}
          onMouseLeave={handlePreviewLeave}
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
