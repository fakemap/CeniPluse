import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Play,
  Plus,
  Check,
  Star,
  Film,
  Info,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { MediaItem } from '../types/media';
import { SnippetPlayer } from './SnippetPlayer';

interface HeroCarouselProps {
  items: MediaItem[];
  watchlistIds: Set<string>;
  onPlay: (item: MediaItem) => void;
  onSelect: (item: MediaItem) => void;
  onToggleWatchlist: (id: string) => void;
}

export const HeroCarousel: React.FC<HeroCarouselProps> = ({
  items,
  watchlistIds,
  onPlay,
  onSelect,
  onToggleWatchlist,
}) => {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const [muted, setMuted] = useState(true);
  const [snippetReady, setSnippetReady] = useState(false);
  const [hasSnippet, setHasSnippet] = useState(false);
  const [heroInView, setHeroInView] = useState(true);
  const [tabVisible, setTabVisible] = useState(() =>
    typeof document !== 'undefined' ? !document.hidden : true
  );
  const [hoverPreviewActive, setHoverPreviewActive] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const desktopRef = useRef<HTMLDivElement>(null);

  const count = items.length;
  const activeIndex = count > 0 ? index % count : 0;
  const active = items[activeIndex];

  useEffect(() => {
    setImgFailed(false);
    setSnippetReady(false);
    setHasSnippet(false);
  }, [active?.id]);

  // Pause hero snippet whenever scrolled off-screen, tab hidden, or hovering a card preview
  useEffect(() => {
    const el = desktopRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        setHeroInView(Boolean(entries[0]?.isIntersecting));
      },
      { threshold: 0.25 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onVisibility = () => setTabVisible(!document.hidden);
    const onHoverPreview = (e: Event) => {
      const detail = (e as CustomEvent<{ active: boolean }>).detail;
      setHoverPreviewActive(Boolean(detail?.active));
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('cinepulse:hover-preview', onHoverPreview);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('cinepulse:hover-preview', onHoverPreview);
    };
  }, []);

  useEffect(() => {
    if (count <= 1 || paused || !muted || !heroInView || !tabVisible) return;
    const intervalMs = hasSnippet ? 18000 : 6500;
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % count);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [count, paused, muted, heroInView, tabVisible, hasSnippet]);

  if (!active) return null;

  const inWatchlist = watchlistIds.has(active.id);
  const heroSnippetActive = heroInView && tabVisible && !hoverPreviewActive;
  const mobileTags = [String(active.year), ...active.genres.slice(0, 2)].slice(0, 3);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    setPaused(true);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current !== null && count > 1) {
      const dx = e.changedTouches[0].clientX - touchStartX.current;
      if (Math.abs(dx) > 42) {
        if (dx < 0) setIndex((prev) => (prev + 1) % count);
        else setIndex((prev) => (prev - 1 + count) % count);
      }
    }
    touchStartX.current = null;
    setPaused(false);
  };

  return (
    <section aria-label="Featured spotlight" className="relative px-4 md:px-0 mb-5 md:mb-6 select-none">
      {/* MOBILE HERO SPOTLIGHT (<768px): Tall rounded 4:5 card, multi-stop scrim, center-aligned title + 3 tags + 2 full-width thumb buttons */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="md:hidden relative w-full aspect-[4/5] max-h-[520px] rounded-2xl overflow-hidden bg-[#141821] border border-white/[0.12] cinema-sheen shadow-[0_24px_60px_rgba(0,0,0,0.78)]"
      >
        {!imgFailed && (active.poster || active.backdrop) ? (
          <img
            key={active.id}
            src={active.poster || active.backdrop}
            alt={active.title}
            fetchPriority="high"
            decoding="async"
            onError={() => setImgFailed(true)}
            onClick={() => onSelect(active)}
            className="w-full h-full object-cover object-top animate-hero-zoom"
          />
        ) : (
          <div
            onClick={() => onSelect(active)}
            className="w-full h-full bg-gradient-to-br from-[#141821] via-[#1E2430] to-[#0B0D12] flex flex-col items-center justify-center p-6 text-center"
          >
            <Film className="w-12 h-12 text-[#00E5FF]/50 mb-3" />
          </div>
        )}

        {/* Multi-stop contrast protection scrim */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B0D12] via-[#0B0D12]/65 to-black/25 pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-[#0B0D12] via-[#0B0D12]/88 to-transparent pointer-events-none" />

        {/* Top subtle quality + rating bar */}
        <div className="absolute top-3.5 left-3.5 right-3.5 flex items-center justify-between pointer-events-none tabular-nums">
          <span className="px-2.5 py-1 rounded-full bg-[#0B0D12]/80 backdrop-blur-md border border-white/10 text-[11px] font-extrabold text-[#10B981]">
            {active.quality}
          </span>
          <span className="px-2.5 py-1 rounded-full bg-[#0B0D12]/80 backdrop-blur-md border border-white/10 text-[11px] font-bold text-[#FFB800] inline-flex items-center gap-1">
            <Star className="w-3 h-3 fill-[#FFB800]" />
            {active.rating.toFixed(1)}
          </span>
        </div>

        {/* Center-Aligned Bottom Content & Side-by-Side Full-Width Thumb Buttons */}
        <div className="absolute inset-x-0 bottom-0 p-4 pb-3 flex flex-col items-center text-center">
          <button
            type="button"
            onClick={() => onSelect(active)}
            className="text-2xl font-extrabold tracking-[-0.025em] text-[#F8FAFC] leading-tight line-clamp-2 drop-shadow text-center"
          >
            {active.title}
          </button>

          {/* 3 Concise Genre / Year Tags */}
          <div className="mt-2 flex items-center justify-center flex-wrap gap-1.5 text-xs font-semibold text-[#CBD5E1] tabular-nums">
            {mobileTags.map((tag, i) => (
              <React.Fragment key={tag}>
                <span className={i === 0 ? 'text-[#10B981] font-bold' : ''}>{tag}</span>
                {i < mobileTags.length - 1 && <span className="text-white/35">&bull;</span>}
              </React.Fragment>
            ))}
          </div>

          {/* Two Full-Width Side-by-Side Thumb-Friendly Buttons (min-h-46px) */}
          <div className="mt-3.5 w-full grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => onPlay(active)}
              className="min-h-[46px] rounded-xl bg-[#00E5FF] active:scale-[0.97] active:brightness-90 text-[#071018] text-sm font-extrabold inline-flex items-center justify-center gap-2 transition-transform"
            >
              <Play className="w-4 h-4 fill-current" />
              Play
            </button>

            <button
              type="button"
              onClick={() => onToggleWatchlist(active.id)}
              className="min-h-[46px] rounded-xl bg-white/14 active:scale-[0.97] active:bg-white/20 border border-white/15 backdrop-blur-xl text-[#F8FAFC] text-sm font-bold inline-flex items-center justify-center gap-1.5 cinema-sheen transition-transform"
            >
              {inWatchlist ? (
                <>
                  <Check className="w-4 h-4 text-[#00E5FF]" />
                  In My List
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  My List
                </>
              )}
            </button>
          </div>

          {/* Touch-Friendly Slide Dots (44px tall hit targets with compact visual pill) */}
          {count > 1 && (
            <div className="mt-0.5 flex items-center justify-center">
              {items.map((item, idx) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setIndex(idx)}
                  aria-label={`Go to slide ${idx + 1}: ${item.title}`}
                  className="min-w-[28px] min-h-[44px] flex items-center justify-center px-1"
                >
                  <span
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      idx === activeIndex ? 'w-6 bg-[#00E5FF]' : 'w-1.5 bg-white/35'
                    }`}
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* DESKTOP HERO CAROUSEL (>=768px): True Edge-to-Edge Full-Bleed Cinema Backdrop */}
      <div
        ref={desktopRef}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        className="hidden md:block relative w-full h-[460px] lg:h-[540px] xl:h-[600px] overflow-hidden bg-[#0B0D12] group"
      >
        {!imgFailed && (active.backdrop || active.poster) ? (
          <img
            key={active.id}
            src={active.backdrop || active.poster}
            alt={active.title}
            fetchPriority="high"
            decoding="async"
            onError={() => setImgFailed(true)}
            className={`w-full h-full object-cover object-center transition-opacity duration-700 ${
              snippetReady ? 'opacity-0' : 'opacity-100 animate-hero-zoom'
            }`}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-[#141821] via-[#1E2430] to-[#0B0D12]" />
        )}

        <SnippetPlayer
          item={active}
          active={heroSnippetActive}
          muted={muted}
          variant="hero"
          startDelayMs={750}
          onReadyChange={setSnippetReady}
          onHasSnippetChange={setHasSnippet}
        />

        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[#0B0D12]/80 via-[#0B0D12]/30 to-transparent pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B0D12] via-[#0B0D12]/50 to-transparent pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0B0D12]/90 via-[#0B0D12]/45 to-transparent pointer-events-none" />

        {snippetReady && (
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? 'Unmute preview snippet' : 'Mute preview snippet'}
            className="absolute right-6 bottom-16 z-20 w-10 h-10 rounded-full bg-black/55 hover:bg-black/80 border border-white/25 backdrop-blur-xl text-[#F8FAFC] flex items-center justify-center transition-colors"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        )}

        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => setIndex((prev) => (prev - 1 + count) % count)}
              aria-label="Previous slide"
              className="absolute left-4 top-1/2 -translate-y-1/2 z-20 min-w-[44px] min-h-[44px] rounded-full bg-black/35 hover:bg-[#00E5FF] active:scale-[0.96] text-[#F8FAFC] hover:text-[#071018] border border-white/30 backdrop-blur-xl flex items-center justify-center transition-all opacity-70 group-hover:opacity-100 focus:opacity-100"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => setIndex((prev) => (prev + 1) % count)}
              aria-label="Next slide"
              className="absolute right-4 top-1/2 -translate-y-1/2 z-20 min-w-[44px] min-h-[44px] rounded-full bg-black/35 hover:bg-[#00E5FF] active:scale-[0.96] text-[#F8FAFC] hover:text-[#071018] border border-white/30 backdrop-blur-xl flex items-center justify-center transition-all opacity-70 group-hover:opacity-100 focus:opacity-100"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}

        <div className="absolute left-14 lg:left-16 right-16 bottom-8 lg:bottom-10 z-10 max-w-2xl">
          <div className="flex flex-wrap items-center gap-2 mb-3 tabular-nums">
            <span className="px-2.5 py-0.5 rounded-md bg-[#10B981]/20 border border-[#10B981]/40 text-[#10B981] text-[11px] font-extrabold tracking-wide">
              {active.quality}
            </span>
            {active.badge === 'VIP' && (
              <span className="px-2.5 py-0.5 rounded-md bg-[#FFB800]/20 border border-[#FFB800]/40 text-[#FFB800] text-[11px] font-bold">
                PRO EXCLUSIVE
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-xs font-bold text-[#FFB800]">
              <Star className="w-3.5 h-3.5 fill-[#FFB800]" />
              {active.rating.toFixed(1)}
            </span>
            <span className="text-xs text-[#94A3B8]">&bull;</span>
            <span className="text-xs font-semibold text-[#F8FAFC]">{active.year}</span>
            {active.runtime && (
              <>
                <span className="text-xs text-[#94A3B8]">&bull;</span>
                <span className="text-xs text-[#CBD5E1]">{active.runtime}</span>
              </>
            )}
            <span className="text-xs text-[#94A3B8]">&bull;</span>
            <span className="text-xs text-[#94A3B8]">{active.genres.join(' / ')}</span>
          </div>

          <button
            type="button"
            onClick={() => onSelect(active)}
            className="text-left text-3xl lg:text-[2.6rem] font-extrabold tracking-[-0.03em] text-[#F8FAFC] leading-[1.08] hover:text-[#00E5FF] transition-colors drop-shadow-[0_4px_24px_rgba(0,0,0,0.8)]"
          >
            {active.title}
          </button>

          <p className="mt-2.5 text-sm text-[#CBD5E1]/90 line-clamp-2 max-w-xl leading-relaxed">
            {active.overview}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => onPlay(active)}
              className="min-h-[44px] px-6 rounded-full bg-[#00E5FF] hover:bg-[#33ECFF] active:scale-[0.97] text-[#071018] text-sm font-extrabold inline-flex items-center gap-2 transition-all"
            >
              <Play className="w-4 h-4 fill-current" />
              Play Now
            </button>

            <button
              type="button"
              onClick={() => onToggleWatchlist(active.id)}
              className="min-h-[44px] px-5 rounded-full bg-[#141821]/85 hover:bg-[#1E2430] active:scale-[0.97] border border-white/15 backdrop-blur-xl text-[#F8FAFC] text-sm font-semibold inline-flex items-center gap-1.5 cinema-sheen transition-all"
            >
              {inWatchlist ? (
                <>
                  <Check className="w-4 h-4 text-[#00E5FF]" />
                  In My List
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  My List
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => onSelect(active)}
              className="min-h-[44px] px-4 rounded-full bg-white/[0.08] hover:bg-white/[0.15] active:scale-[0.97] border border-white/10 backdrop-blur-xl text-[#F8FAFC] text-sm font-semibold inline-flex items-center gap-1.5 transition-all"
            >
              <Info className="w-4 h-4 text-[#00E5FF]" />
              Details
            </button>
          </div>
        </div>

        {count > 1 && (
          <div className="absolute right-6 bottom-5 z-20 flex items-center">
            {items.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setIndex(idx)}
                aria-label={`Slide ${idx + 1}: ${item.title}`}
                className="min-w-[28px] min-h-[44px] flex items-center justify-center px-1"
              >
                <span
                  className={`h-1.5 rounded-full transition-all ${
                    idx === activeIndex
                      ? 'w-6 bg-[#00E5FF]'
                      : 'w-1.5 bg-white/35 hover:bg-white/60'
                  }`}
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
