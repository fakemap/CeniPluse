import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Play, Volume2, VolumeX, Star, Plus, Check, Info } from 'lucide-react';
import type { MediaItem } from '../types/media';
import { SnippetPlayer } from './SnippetPlayer';

interface HoverPreviewCardProps {
  item: MediaItem;
  anchorRect: DOMRect;
  inWatchlist: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onPlay: (item: MediaItem) => void;
  onSelect: (item: MediaItem) => void;
  onToggleWatchlist: (id: string) => void;
}

export const HoverPreviewCard: React.FC<HoverPreviewCardProps> = ({
  item,
  anchorRect,
  inWatchlist,
  onMouseEnter,
  onMouseLeave,
  onPlay,
  onSelect,
  onToggleWatchlist,
}) => {
  const [muted, setMuted] = useState(true);
  const [snippetReady, setSnippetReady] = useState(false);
  const [hasSnippet, setHasSnippet] = useState(false);

  // Pause hero snippet while hover preview card is active so only one snippet plays at a time
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('cinepulse:hover-preview', { detail: { active: true } }));
    return () => {
      window.dispatchEvent(new CustomEvent('cinepulse:hover-preview', { detail: { active: false } }));
    };
  }, []);

  useEffect(() => {
    setSnippetReady(false);
    setHasSnippet(false);
  }, [item.id]);

  // Compute clamped viewport coordinates and edge-aware transformOrigin
  const cardWidth = 312;
  const estimatedHeight = 332;
  const centerX = anchorRect.left + anchorRect.width / 2;
  const centerY = anchorRect.top + anchorRect.height / 2;

  const padding = 20;
  const minX = cardWidth / 2 + padding;
  const maxX = window.innerWidth - cardWidth / 2 - padding;
  const clampedX = Math.max(minX, Math.min(maxX, centerX));
  const clampedY = Math.max(
    estimatedHeight / 2 + 72,
    Math.min(window.innerHeight - estimatedHeight / 2 - padding, centerY)
  );

  const transformOrigin =
    centerX <= minX + 24
      ? 'left center'
      : centerX >= maxX - 24
      ? 'right center'
      : 'center center';

  return createPortal(
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: 'fixed',
        left: `${clampedX}px`,
        top: `${clampedY}px`,
        width: `${cardWidth}px`,
        transformOrigin,
      }}
      className="z-[90] animate-hover-card rounded-2xl overflow-hidden bg-[#141821]/95 backdrop-blur-2xl border border-[#00E5FF]/40 cinema-sheen shadow-[0_28px_70px_rgba(0,0,0,0.9)]"
    >
      {/* Top 16:9 Trailer Video Preview Area */}
      <div
        onClick={() => onSelect(item)}
        className="relative aspect-video bg-[#0B0D12] overflow-hidden cursor-pointer"
      >
        <img
          src={item.backdrop || item.poster}
          alt={item.title}
          className={`w-full h-full object-cover transition-opacity duration-500 ${
            snippetReady ? 'opacity-0' : 'opacity-100 animate-hero-zoom'
          }`}
        />

        <SnippetPlayer
          item={item}
          active={true}
          muted={muted}
          variant="card"
          startDelayMs={220}
          onReadyChange={setSnippetReady}
          onHasSnippetChange={setHasSnippet}
        />

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#141821] via-transparent to-black/35" />

        {/* Top-left Status Tag */}
        <span
          className={`absolute top-2.5 left-2.5 z-10 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#0B0D12]/80 backdrop-blur-md border border-white/10 text-[10px] font-bold ${
            item.sources.length > 0 ? 'text-[#10B981]' : 'text-[#FFB800]'
          }`}
        >
          {snippetReady && (
            <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />
          )}
          {item.sources.length > 0
            ? `${item.quality} • FULL VIDEO`
            : snippetReady
            ? 'PREVIEW'
            : item.trailerYoutubeId
            ? 'Request • Trailer'
            : 'Request Movie'}
        </span>

        {/* Top-right Mute / Unmute Button (for any MP4, HLS, or YouTube snippet) */}
        {hasSnippet && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMuted((m) => !m);
            }}
            aria-label={muted ? 'Unmute preview' : 'Mute preview'}
            className="absolute top-2.5 right-2.5 z-20 w-8 h-8 rounded-full bg-[#0B0D12]/80 hover:bg-[#00E5FF] text-[#F8FAFC] hover:text-[#071018] border border-white/15 backdrop-blur-md flex items-center justify-center transition-colors"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Bottom Metadata + Actions */}
      <div className="p-3.5 space-y-2.5">
        <div>
          <h4
            onClick={() => onSelect(item)}
            className="text-[15px] font-extrabold text-[#F8FAFC] leading-snug truncate cursor-pointer hover:text-[#00E5FF] transition-colors"
          >
            {item.title}
          </h4>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-[#94A3B8] tabular-nums">
            <span className="inline-flex items-center gap-0.5 font-bold text-[#FFB800]">
              <Star className="w-3 h-3 fill-[#FFB800]" />
              {item.rating.toFixed(1)}
            </span>
            <span className="text-[#10B981] font-semibold">{item.year}</span>
            <span>&bull;</span>
            <span className="truncate max-w-[95px]">{item.country}</span>
          </div>

          <div className="mt-1.5 flex flex-wrap gap-1">
            {item.genres.slice(0, 3).map((g) => (
              <span
                key={g}
                className="px-2 py-0.5 rounded-md bg-[#1E2430] border border-white/[0.06] text-[10.5px] font-medium text-[#CBD5E1]"
              >
                {g}
              </span>
            ))}
          </div>
        </div>

        {/* High-contrast Electric Cyan Pill Play / Request Button + Secondary Actions */}
        <div className="flex items-center gap-2 pt-0.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (item.sources.length > 0 || item.trailerYoutubeId) {
                onPlay(item);
              } else {
                onSelect(item);
              }
            }}
            className="flex-1 h-9 rounded-full bg-[#00E5FF] hover:bg-[#33ECFF] text-[#071018] text-xs font-extrabold inline-flex items-center justify-center gap-1.5 transition-all"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            {item.sources.length > 0
              ? 'Play Now'
              : item.trailerYoutubeId
              ? 'Trailer & Request'
              : 'Request Title'}
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleWatchlist(item.id);
            }}
            title={inWatchlist ? 'Remove from Watchlist' : 'Add to Watchlist'}
            className={`w-9 h-9 rounded-full border flex items-center justify-center transition-colors ${
              inWatchlist
                ? 'bg-[#00E5FF]/15 border-[#00E5FF]/50 text-[#00E5FF]'
                : 'bg-[#1E2430] border-white/10 text-[#F8FAFC] hover:border-[#00E5FF]/50'
            }`}
          >
            {inWatchlist ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(item);
            }}
            title="Full Details & Mirrors"
            className="w-9 h-9 rounded-full bg-[#1E2430] border border-white/10 text-[#94A3B8] hover:text-[#F8FAFC] hover:border-white/25 flex items-center justify-center transition-colors"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
