import React, { useEffect, useState } from 'react';
import {
  Home,
  Tv,
  Film,
  Clapperboard,
  Flame,
  Bookmark,
  Download,
  Globe,
  ChevronDown,
  Smartphone,
  Monitor,
  Tv2,
  X,
} from 'lucide-react';
import type { NavRoute } from '../types/media';
import { UI_LANGUAGES } from '../data/catalog';

interface SidebarProps {
  activeRoute: NavRoute;
  onNavigate: (route: NavRoute) => void;
  open: boolean;
  onClose: () => void;
  uiLanguage: string;
  onChangeLanguage: (code: string) => void;
  watchlistCount: number;
  onOpenAppModal: () => void;
}

const NAV_ITEMS: Array<{ id: NavRoute; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'series', label: 'Series', icon: Tv },
  { id: 'movies', label: 'Movies', icon: Film },
  { id: 'animation', label: 'Animation', icon: Clapperboard },
  { id: 'trending', label: 'Trending', icon: Flame },
  { id: 'watchlist', label: 'Watchlist', icon: Bookmark },
  { id: 'downloads', label: 'Downloads', icon: Download },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeRoute,
  onNavigate,
  open,
  onClose,
  uiLanguage,
  onChangeLanguage,
  watchlistCount,
  onOpenAppModal,
}) => {
  const [langOpen, setLangOpen] = useState(false);
  const activeLang = UI_LANGUAGES.find((l) => l.code === uiLanguage) || UI_LANGUAGES[0];

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  return (
    <div>
      {open && (
        <div
          onClick={onClose}
          aria-hidden="true"
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm transition-opacity"
        />
      )}

      <aside
        aria-hidden={!open}
        className={`fixed top-0 md:top-16 left-0 bottom-0 z-50 w-[270px] md:w-[240px] transition-transform duration-250 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full pointer-events-none'
        }`}
      >
        <div className="flex flex-col h-full bg-[#141821]/95 backdrop-blur-2xl border-r border-white/[0.08] shadow-2xl select-none">
          {/* Drawer Header + Close + Language Selector */}
          <div className="px-3 pt-3 pb-2 space-y-2 relative">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
                Navigation
              </span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close navigation drawer"
                className="w-8 h-8 rounded-lg hover:bg-white/[0.08] text-[#94A3B8] hover:text-[#F8FAFC] flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => setLangOpen((o) => !o)}
              title={`Language: ${activeLang.label}`}
              className="w-full min-h-[44px] rounded-xl bg-[#0B0D12]/80 hover:bg-[#1E2430] border border-white/[0.07] flex items-center justify-between px-3 text-xs font-semibold text-[#F8FAFC] transition-colors"
            >
              <span className="inline-flex items-center gap-2">
                <Globe className="w-4 h-4 text-[#00E5FF] shrink-0" />
                <span className="uppercase tracking-wide">{activeLang.label}</span>
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-[#94A3B8] transition-transform ${
                  langOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {langOpen && (
              <div className="absolute left-3 right-3 top-[96px] bg-[#1E2430] border border-white/[0.1] rounded-xl shadow-2xl py-1 z-40">
                {UI_LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => {
                      onChangeLanguage(lang.code);
                      setLangOpen(false);
                    }}
                    className={`w-full min-h-[40px] px-3 text-left text-xs font-medium flex items-center justify-between hover:bg-white/[0.06] ${
                      lang.code === uiLanguage ? 'text-[#00E5FF]' : 'text-[#F8FAFC]'
                    }`}
                  >
                    <span>{lang.label}</span>
                    <span className="text-[10px] text-[#94A3B8]">{lang.code}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Primary Navigation */}
          <nav aria-label="Desktop primary navigation" className="flex-1 px-2.5 py-2 space-y-1 overflow-y-auto scrollbar-hide">
            {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
              const isActive = activeRoute === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    onNavigate(id);
                    onClose();
                  }}
                  className={`relative w-full min-h-[44px] rounded-xl flex items-center active:scale-[0.98] px-3 gap-3 text-[13.5px] font-semibold transition-all group ${
                    isActive
                      ? 'bg-[#1E2430] text-[#F8FAFC] border border-[#00E5FF]/30'
                      : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1E2430]/60 border border-transparent'
                  }`}
                >
                  {isActive && (
                    <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-[#00E5FF]" />
                  )}
                  <Icon
                    className={`w-[18px] h-[18px] shrink-0 transition-colors ${
                      isActive ? 'text-[#00E5FF]' : 'text-[#94A3B8] group-hover:text-[#F8FAFC]'
                    }`}
                  />
                  <span className="flex-1 text-left truncate">{label}</span>
                  {id === 'watchlist' && watchlistCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#00E5FF]/15 text-[#00E5FF] tabular-nums">
                      {watchlistCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Bottom Compact Promo / App-Download Card */}
          <div className="p-2.5 border-t border-white/[0.06]">
            <div className="rounded-xl bg-[#0B0D12]/90 border border-white/[0.07] p-2.5 space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8] px-1">
                Get CeniPluse
              </div>
              <button
                type="button"
                onClick={() => {
                  onOpenAppModal();
                  onClose();
                }}
                className="w-full rounded-lg bg-gradient-to-r from-[#00E5FF] to-[#10B981] text-[#071018] px-2.5 py-2 flex items-center gap-2 text-left hover:brightness-110 transition-all"
              >
                <Smartphone className="w-4 h-4 shrink-0 stroke-[2.4]" />
                <div className="leading-tight min-w-0">
                  <div className="text-xs font-extrabold truncate">CeniPluse Mobile</div>
                  <div className="text-[10px] font-semibold opacity-80 truncate">iOS &amp; Android Offline</div>
                </div>
              </button>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onOpenAppModal();
                    onClose();
                  }}
                  className="rounded-lg bg-[#141821] hover:bg-[#1E2430] border border-white/[0.06] px-2 py-1.5 flex items-center gap-1.5 text-[11px] font-medium text-[#94A3B8] hover:text-[#F8FAFC] transition-colors"
                >
                  <Monitor className="w-3.5 h-3.5 text-[#00E5FF] shrink-0" />
                  <span className="truncate">Desktop</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onOpenAppModal();
                    onClose();
                  }}
                  className="rounded-lg bg-[#141821] hover:bg-[#1E2430] border border-white/[0.06] px-2 py-1.5 flex items-center gap-1.5 text-[11px] font-medium text-[#94A3B8] hover:text-[#F8FAFC] transition-colors"
                >
                  <Tv2 className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                  <span className="truncate">TV APK</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
};
