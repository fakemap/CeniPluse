import React, { useEffect, useRef, useState } from 'react';
import {
  Menu,
  Search,
  X,
  Crown,
  Smartphone,
  User,
  Star,
  Play,
  Film,
  Tv,
  Globe,
  Check,
} from 'lucide-react';
import type { MediaItem } from '../types/media';
import { UI_LANGUAGES } from '../data/catalog';
import { backendApi } from '../services/api';
import { trackEvent } from '../services/analytics';
import {
  PREMIUM_BENEFITS,
  PremiumHexBadge,
  PremiumHexCrown,
} from './PremiumBenefitIcons';

interface TopBarProps {
  onToggleSidebar: () => void;
  onGoHome: () => void;
  catalog: MediaItem[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSelectMedia: (item: MediaItem) => void;
  onOpenModal: (modal: 'pro' | 'app' | 'signin') => void;
  userEmail: string | null;
  premiumPlan?: string | null;
  uiLanguage: string;
  onChangeLanguage: (code: string) => void;
  transparentOnTop?: boolean;
  activeRoute?: string;
}

export const TopBar: React.FC<TopBarProps> = ({
  onToggleSidebar,
  onGoHome,
  catalog,
  searchQuery,
  onSearchChange,
  onSelectMedia,
  onOpenModal,
  userEmail,
  premiumPlan = null,
  uiLanguage,
  onChangeLanguage,
  transparentOnTop = false,
  activeRoute = '',
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [mobileLangOpen, setMobileLangOpen] = useState(false);
  const [premiumHoverOpen, setPremiumHoverOpen] = useState(false);
  const [liveResults, setLiveResults] = useState<MediaItem[]>([]);
  const [loadingLive, setLoadingLive] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const mobileSearchContainerRef = useRef<HTMLDivElement>(null);
  const langContainerRef = useRef<HTMLDivElement>(null);
  const hoverTimerRef = useRef<number | null>(null);

  const openPremiumHover = () => {
    if (hoverTimerRef.current) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setPremiumHoverOpen(true);
  };

  const scheduleClosePremiumHover = () => {
    if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = window.setTimeout(() => {
      setPremiumHoverOpen(false);
    }, 140);
  };

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!premiumHoverOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPremiumHoverOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [premiumHoverOpen]);

  // Scroll-aware header transition: transparent floating top bar -> frosted obsidian glass on scroll
  useEffect(() => {
    const onScroll = () => {
      setIsScrolled(window.scrollY > 18);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close dropdowns on outside click / touch
  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      const inDesktopSearch =
        searchContainerRef.current && searchContainerRef.current.contains(target);
      const inMobileSearch =
        mobileSearchContainerRef.current && mobileSearchContainerRef.current.contains(target);
      if (!inDesktopSearch && !inMobileSearch) {
        setIsFocused(false);
      }
      if (
        langContainerRef.current &&
        !langContainerRef.current.contains(target)
      ) {
        setMobileLangOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, []);

  // Debounced live search with AbortController request cancellation
  useEffect(() => {
    const term = searchQuery.trim();
    if (term.length < 2) {
      setLiveResults([]);
      setLoadingLive(false);
      return;
    }
    const controller = new AbortController();
    setLoadingLive(true);
    const t = setTimeout(async () => {
      const liveMatches = await backendApi.searchLiveTmdb(term, controller.signal);
      if (!controller.signal.aborted) {
        setLiveResults(liveMatches || []);
        setLoadingLive(false);
        trackEvent({ eventType: 'search', searchQuery: term, pagePath: 'topbar' });
      }
    }, 250);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [searchQuery]);

  const trimmed = searchQuery.trim().toLowerCase();
  const localMatches = trimmed
    ? catalog
        .filter(
          (m) =>
            (m.title && m.title.toLowerCase().includes(trimmed)) ||
            (Array.isArray(m.genres) && m.genres.some((g) => typeof g === 'string' && g.toLowerCase().includes(trimmed))) ||
            (m.country && m.country.toLowerCase().includes(trimmed)) ||
            (Array.isArray(m.cast) && m.cast.some((c) => typeof c === 'string' && c.toLowerCase().includes(trimmed)))
        )
        .slice(0, 6)
    : [];

  const existingTitles = new Set(localMatches.map((m) => m.title.toLowerCase()));
  const combinedSuggestions = [
    ...localMatches,
    ...liveResults.filter((m) => !existingTitles.has(m.title.toLowerCase())).slice(0, 5),
  ];

  const showDropdown = isFocused && trimmed.length > 0;

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 flex flex-col transition-all duration-300 ${
        isScrolled
          ? 'bg-[#0B0D12]/92 backdrop-blur-2xl border-b border-white/[0.08] shadow-[0_12px_36px_rgba(0,0,0,0.65)]'
          : transparentOnTop
          ? 'bg-gradient-to-b from-[#0B0D12]/85 via-[#0B0D12]/40 to-transparent border-b border-transparent'
          : 'bg-[#0B0D12]/90 md:bg-[#141821]/88 backdrop-blur-xl border-b border-white/[0.06]'
      }`}
    >
      {/* Top Header Bar Row (Mobile h-12, Desktop h-16) */}
      <div className="h-12 md:h-16 px-3 md:px-6 w-full flex items-center justify-between gap-2 md:gap-4">
        {/* Left: Hamburger + Compact Brand Logo + Desktop Search */}
        <div className="flex items-center gap-2.5 md:gap-4 flex-1 min-w-0">
          {/* Hamburger Menu Toggle (Mobile & Desktop) */}
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label="Toggle sidebar navigation"
            className="flex min-w-[36px] min-h-[36px] w-9 h-9 md:w-10 md:h-10 rounded-lg items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] active:text-[#00E5FF] transition-colors shrink-0"
          >
            <Menu className="w-5 h-5" />
          </button>

        {/* Compact Brand Logo */}
        <button
          type="button"
          onClick={onGoHome}
          className="flex items-center gap-1.5 md:gap-2 shrink-0 focus:outline-none py-1"
        >
          <div className="w-7 h-7 md:w-8 md:h-8 rounded-[7px] md:rounded-lg bg-gradient-to-br from-[#00E5FF] via-[#0EA5E9] to-[#10B981] p-[1.5px]">
            <div className="w-full h-full rounded-[5.5px] md:rounded-[7px] bg-[#0B0D12] flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 md:w-4 md:h-4 text-[#00E5FF]" fill="currentColor">
                <path d="M7.5 4.8a1.4 1.4 0 0 1 2.13-1.2l10.2 6.2a1.4 1.4 0 0 1 0 2.4l-10.2 6.2a1.4 1.4 0 0 1-2.13-1.2V4.8z" />
              </svg>
            </div>
          </div>
          <span className="text-[14.5px] md:text-[1.18rem] font-extrabold tracking-tight text-[#F8FAFC]">
            Ceni<span className="text-[#00E5FF]">Pluse</span>
          </span>
        </button>

        {/* Desktop-only Search Input (Mobile uses dedicated Search tab in Bottom Nav) */}
        <div
          ref={searchContainerRef}
          className="hidden md:block relative flex-1 max-w-[440px] ml-3"
        >
          <div
            className={`flex items-center h-11 rounded-full bg-[#0B0D12]/90 border transition-all pl-3.5 pr-1 gap-2 ${
              isFocused
                ? 'border-[#00E5FF]/70'
                : 'border-white/[0.08] hover:border-white/[0.16]'
            }`}
          >
            <Search className="w-4 h-4 text-[#94A3B8] shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onFocus={() => setIsFocused(true)}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search movies, series, cast..."
              className="w-full bg-transparent text-sm text-[#F8FAFC] placeholder-[#94A3B8]/80 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center text-[#94A3B8] hover:text-white rounded-full"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {showDropdown && (
            <div className="absolute left-0 right-0 top-[46px] bg-[#141821] border border-white/[0.1] rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.8)] overflow-hidden z-50 animate-modal">
              <div className="px-3.5 py-2 border-b border-white/[0.06] flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                <span>Instant Results</span>
                {loadingLive && <span className="text-[#00E5FF]">Syncing live...</span>}
              </div>

              {combinedSuggestions.length > 0 ? (
                <div className="max-h-[380px] overflow-y-auto divide-y divide-white/[0.04]">
                  {combinedSuggestions.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setIsFocused(false);
                        onSelectMedia(item);
                      }}
                      className="w-full px-3.5 py-2.5 flex items-center gap-3 hover:bg-[#1E2430] transition-colors text-left group"
                    >
                      <img
                        src={item.poster}
                        alt={item.title}
                        loading="lazy"
                        className="w-10 h-14 rounded-md object-cover bg-[#0B0D12] shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-[#F8FAFC] truncate group-hover:text-[#00E5FF] transition-colors">
                          {item.title}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-[#94A3B8] mt-0.5">
                          <span className="inline-flex items-center gap-1 text-[#FFB800] font-semibold">
                            <Star className="w-3 h-3 fill-[#FFB800]" />
                            {item.rating.toFixed(1)}
                          </span>
                          <span>&bull;</span>
                          <span className="text-[#10B981] font-medium">{item.year}</span>
                          <span>&bull;</span>
                          <span className="inline-flex items-center gap-1 capitalize">
                            {item.type === 'series' ? <Tv className="w-3 h-3" /> : <Film className="w-3 h-3" />}
                            {item.type}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#94A3B8]/80 truncate mt-0.5">
                          {item.cast.slice(0, 3).join(', ')}
                        </div>
                      </div>
                      <div className="w-7 h-7 rounded-full bg-[#00E5FF]/15 text-[#00E5FF] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center text-sm text-[#94A3B8]">
                  No titles matching &ldquo;<span className="text-[#F8FAFC]">{searchQuery}</span>&rdquo;
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right Controls: Mobile = App Download + Go Premium Crown + Language/Region Toggle + Profile Icon (Refined Compact Size) */}
      <div className="flex md:hidden items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => onOpenModal('app')}
          aria-label="Install App / Download"
          className="w-8 h-8 rounded-full bg-[#10B981]/15 active:bg-[#10B981]/30 border border-[#10B981]/40 text-[#10B981] flex items-center justify-center shrink-0"
        >
          <Smartphone className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => onOpenModal('pro')}
          aria-label="Go Premium"
          className="w-8 h-8 rounded-full bg-gradient-to-r from-[#FFF1BC] via-[#FCE18E] to-[#F5CD67] active:scale-[0.94] text-[#2B1907] flex items-center justify-center shadow-sm shrink-0"
        >
          <Crown className="w-3.5 h-3.5 fill-[#2B1907]" />
        </button>

        <div ref={langContainerRef} className="relative">
          <button
            type="button"
            onClick={() => setMobileLangOpen((o) => !o)}
            aria-label="Change language or region"
            className="h-8 px-2 rounded-full bg-[#141821] active:bg-[#1E2430] border border-white/[0.08] flex items-center justify-center gap-1 text-[11px] font-bold text-[#F8FAFC] shrink-0"
          >
            <Globe className="w-3.5 h-3.5 text-[#00E5FF]" />
            <span>{uiLanguage}</span>
          </button>

          {mobileLangOpen && (
            <div className="absolute right-0 top-[38px] w-40 rounded-2xl bg-[#141821] border border-white/[0.12] shadow-2xl py-1.5 z-50 animate-modal">
              {UI_LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => {
                    onChangeLanguage(lang.code);
                    setMobileLangOpen(false);
                  }}
                  className={`w-full min-h-[40px] px-3.5 text-left text-xs font-semibold flex items-center justify-between active:bg-[#1E2430] ${
                    lang.code === uiLanguage ? 'text-[#00E5FF]' : 'text-[#F8FAFC]'
                  }`}
                >
                  <span>{lang.label}</span>
                  {lang.code === uiLanguage && <Check className="w-3.5 h-3.5" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => onOpenModal('signin')}
          aria-label="Profile and Log in"
          className="w-8 h-8 rounded-full bg-[#141821] active:bg-[#1E2430] border border-white/[0.08] flex items-center justify-center text-[#F8FAFC] shrink-0"
        >
          <User className="w-3.5 h-3.5 text-[#00E5FF]" />
        </button>
      </div>

      {/* Desktop Right Pill Buttons: Go Premium (+ Hover Benefits Card), Download App, Log in */}
      <div className="hidden md:flex items-center gap-2.5 shrink-0">
        {/* Go Premium Pill with Smooth Hover Preview Card */}
        <div
          className="relative"
          onMouseEnter={openPremiumHover}
          onMouseLeave={scheduleClosePremiumHover}
        >
          <button
            type="button"
            onFocus={openPremiumHover}
            onClick={() => {
              setPremiumHoverOpen(false);
              onOpenModal('pro');
            }}
            aria-expanded={premiumHoverOpen}
            className="min-h-[40px] px-4 rounded-full bg-gradient-to-r from-[#FFF1BC] via-[#FCE18E] to-[#F5CD67] hover:brightness-105 active:scale-[0.98] text-[#2B1907] text-xs font-extrabold inline-flex items-center gap-1.5 shadow-sm transition-all"
          >
            <Crown className="w-3.5 h-3.5 fill-[#2B1907]" />
            <span>{premiumPlan ? 'Premium' : 'Go Premium'}</span>
          </button>

          {premiumHoverOpen && (
            <div
              onMouseEnter={openPremiumHover}
              onMouseLeave={scheduleClosePremiumHover}
              className="absolute top-[48px] right-0 lg:right-auto lg:left-1/2 lg:-translate-x-1/2 w-[336px] rounded-2xl overflow-hidden bg-[#3B2516] border border-[#FCE293]/25 shadow-[0_24px_60px_rgba(0,0,0,0.82)] z-[60] animate-modal"
            >
              {/* Warm Bronze Header Bar */}
              <div className="bg-[#5E412A] px-4 py-3 flex items-center gap-2.5 border-b border-white/[0.06]">
                <PremiumHexCrown size="sm" />
                <span className="text-sm font-extrabold text-[#FFF0C2] tracking-tight">
                  Unlock Premium Benefits
                </span>
              </div>

              {/* 3x2 Hexagonal Benefits Grid + Unlock Now Pill */}
              <div className="px-4 pt-4 pb-4">
                <div className="grid grid-cols-3 gap-x-2 gap-y-4 mb-4">
                  {PREMIUM_BENEFITS.map((benefit) => (
                    <div
                      key={benefit.id}
                      className="flex flex-col items-center text-center gap-1.5"
                    >
                      <PremiumHexBadge benefit={benefit} variant="dark" />
                      <span className="text-[11px] font-medium text-[#EFE0C4] leading-tight">
                        {benefit.label}
                      </span>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setPremiumHoverOpen(false);
                    onOpenModal('pro');
                  }}
                  className="w-full min-h-[42px] rounded-full bg-gradient-to-r from-[#FFF1BE] via-[#F7DC8A] to-[#EBC461] hover:brightness-105 active:scale-[0.98] text-[#2B1907] text-sm font-extrabold shadow-sm transition-all"
                >
                  Unlock Now
                </button>
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => onOpenModal('app')}
          className="min-h-[40px] px-4 rounded-full bg-gradient-to-r from-[#61C9FA] via-[#6DE1C9] to-[#7BE88E] hover:brightness-105 active:scale-[0.98] text-[#071B17] text-xs font-extrabold inline-flex items-center gap-1.5 shadow-sm transition-all"
        >
          <Smartphone className="w-3.5 h-3.5 stroke-[2.3]" />
          <span>Download App</span>
        </button>

        <button
          type="button"
          onClick={() => onOpenModal('signin')}
          className="min-h-[40px] px-4 rounded-full bg-white/15 hover:bg-white/22 active:scale-[0.98] border border-white/15 text-[#F8FAFC] text-xs font-semibold inline-flex items-center gap-1.5 transition-all"
        >
          <User className="w-3.5 h-3.5 text-[#F8FAFC]" />
          <span>{userEmail ? userEmail.split('@')[0] : 'Log in'}</span>
        </button>
      </div>
      </div>

      {/* Mobile-Only Row 2: Search Bar — hidden on the Search page (which has its own full search input) */}
      <div
        ref={mobileSearchContainerRef}
        className={`md:hidden px-3.5 pb-2.5 pt-0.5 w-full relative ${activeRoute === 'search' ? 'hidden' : ''}`}
      >
        <div
          className={`flex items-center h-10 rounded-xl bg-[#141821]/80 backdrop-blur-md border transition-all pl-3.5 pr-2 gap-2 ${
            isFocused
              ? 'border-[#00E5FF]/70 shadow-lg shadow-[#00E5FF]/10'
              : 'border-white/[0.1] hover:border-white/[0.18]'
          }`}
        >
          <Search className="w-4 h-4 text-[#94A3B8] shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onFocus={() => setIsFocused(true)}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search movies/ TV Shows"
            className="w-full bg-transparent text-xs text-[#F8FAFC] placeholder-[#94A3B8]/80 focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="w-6 h-6 flex items-center justify-center text-[#94A3B8] hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Mobile Dropdown Suggestions */}
        {showDropdown && (
          <div className="absolute left-3.5 right-3.5 top-[44px] bg-[#141821] border border-white/[0.12] rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.9)] overflow-hidden z-50 animate-modal">
            <div className="px-3.5 py-2 border-b border-white/[0.06] flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
              <span>Instant Results</span>
              {loadingLive && <span className="text-[#00E5FF]">Syncing live...</span>}
            </div>
            {combinedSuggestions.length > 0 ? (
              <div className="max-h-[320px] overflow-y-auto divide-y divide-white/[0.04]">
                {combinedSuggestions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setIsFocused(false);
                      onSelectMedia(item);
                    }}
                    className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-[#1E2430] active:bg-[#1E2430] text-left"
                  >
                    <img
                      src={item.poster}
                      alt={item.title}
                      className="w-9 h-12 rounded object-cover bg-[#0B0D12] shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-[#F8FAFC] truncate">
                        {item.title}
                      </div>
                      <div className="text-[10px] text-[#94A3B8] mt-0.5 flex items-center gap-1.5">
                        <span className="text-[#10B981] font-bold">{item.year}</span>
                        <span>&bull;</span>
                        <span className="text-[#FFB800] font-semibold flex items-center gap-0.5">
                          <Star className="w-2.5 h-2.5 fill-[#FFB800]" />
                          {item.rating.toFixed(1)}
                        </span>
                        <span>&bull;</span>
                        <span className="truncate">{item.genres[0]}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-xs text-[#94A3B8]">
                No matching movies or series found
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
