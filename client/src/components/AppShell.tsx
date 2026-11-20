import React from 'react';
import { Home, Film, Tv, Search, Bookmark } from 'lucide-react';
import type { MediaItem, NavRoute } from '../types/media';
import { TopBar } from './TopBar';
import { Sidebar } from './Sidebar';

interface AppShellProps {
  activeRoute: NavRoute;
  onNavigate: (route: NavRoute) => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onCloseSidebar: () => void;
  uiLanguage: string;
  onChangeLanguage: (code: string) => void;
  catalog: MediaItem[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSelectMedia: (item: MediaItem) => void;
  watchlistCount: number;
  onOpenModal: (modal: 'pro' | 'app' | 'signin') => void;
  userEmail: string | null;
  premiumPlan?: string | null;
  detailOpen?: boolean;
  children: React.ReactNode;
}

const MOBILE_TABS: Array<{
  id: NavRoute;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'movies', label: 'Movies', icon: Film },
  { id: 'series', label: 'Series', icon: Tv },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'watchlist', label: 'My List', icon: Bookmark },
];

export const AppShell: React.FC<AppShellProps> = ({
  activeRoute,
  onNavigate,
  sidebarOpen,
  onToggleSidebar,
  onCloseSidebar,
  uiLanguage,
  onChangeLanguage,
  catalog,
  searchQuery,
  onSearchChange,
  onSelectMedia,
  watchlistCount,
  onOpenModal,
  userEmail,
  premiumPlan = null,
  detailOpen = false,
  children,
}) => {
  const hasFullBleedHero = !detailOpen && (activeRoute === 'home' || activeRoute === 'movies');

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-clip bg-[#0B0D12] text-[#F8FAFC]">
      <TopBar
        onToggleSidebar={onToggleSidebar}
        onGoHome={() => onNavigate('home')}
        catalog={catalog}
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        onSelectMedia={onSelectMedia}
        onOpenModal={onOpenModal}
        userEmail={userEmail}
        premiumPlan={premiumPlan}
        uiLanguage={uiLanguage}
        onChangeLanguage={onChangeLanguage}
        transparentOnTop={hasFullBleedHero}
      />

      <Sidebar
        activeRoute={activeRoute}
        onNavigate={onNavigate}
        open={sidebarOpen}
        onClose={onCloseSidebar}
        uiLanguage={uiLanguage}
        onChangeLanguage={onChangeLanguage}
        watchlistCount={watchlistCount}
        onOpenAppModal={() => onOpenModal('app')}
      />

      {/* Full-width edge-to-edge Main Content Area — 0px desktop gutters */}
      <main
        className={`pt-12 pb-[calc(76px+env(safe-area-inset-bottom))] md:pb-12 min-h-screen w-full overflow-x-clip ${
          hasFullBleedHero ? 'md:pt-0' : 'md:pt-16'
        }`}
      >
        <div
          className={
            hasFullBleedHero
              ? 'w-full pt-3 md:pt-0'
              : 'w-full px-0 md:px-6 lg:px-8 pt-3 md:pt-5'
          }
        >
          {children}
        </div>
      </main>

      {/* Fixed Bottom Navigation Bar (60px height + safe-area-inset-bottom) */}
      <nav
        aria-label="Primary mobile navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0B0D12]/90 backdrop-blur-md border-t border-white/10 pb-[env(safe-area-inset-bottom)]"
      >
        <div className="h-[60px] px-1 grid grid-cols-5 items-center">
          {MOBILE_TABS.map(({ id, label, icon: Icon }) => {
            const isActive = activeRoute === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onNavigate(id)}
                className={`relative min-w-[44px] min-h-[44px] h-full flex flex-col items-center justify-center gap-0.5 transition-colors ${
                  isActive ? 'text-[#00E5FF]' : 'text-[#94A3B8] active:text-[#F8FAFC]'
                }`}
              >
                {isActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2px] rounded-full bg-[#00E5FF]" />
                )}
                <div className="relative">
                  <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.4]' : 'stroke-[1.9]'}`} />
                  {id === 'watchlist' && watchlistCount > 0 && (
                    <span className="absolute -top-1 -right-2 min-w-[14px] h-[14px] px-1 rounded-full bg-[#00E5FF] text-[#071018] text-[9px] font-extrabold flex items-center justify-center leading-none">
                      {watchlistCount > 9 ? '9+' : watchlistCount}
                    </span>
                  )}
                </div>
                <span className={`text-[10px] leading-tight ${isActive ? 'font-bold' : 'font-medium'}`}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
