import React from 'react';
import { SlidersHorizontal } from 'lucide-react';
import type { CategoryCardItem } from '../types/media';

interface CategoryCardsProps {
  cards: CategoryCardItem[];
  activeCategoryId: string;
  onSelectCategory: (card: CategoryCardItem) => void;
}

export const CategoryCards: React.FC<CategoryCardsProps> = ({
  cards,
  activeCategoryId,
  onSelectCategory,
}) => {
  return (
    <section className="mb-5 md:mb-8">
      <div className="flex items-center justify-between px-4 md:px-0 mb-2.5 md:mb-3">
        <h2 className="text-[15px] md:text-lg font-extrabold tracking-[-0.015em] text-[#F8FAFC]">
          Categories
        </h2>
      </div>

      {/* ── MOBILE: Clean, text-only scrollable pill strip ── */}
      <div className="md:hidden relative">
        <div className="flex gap-2 overflow-x-auto pl-4 pr-10 scrollbar-hide pb-1 pt-0.5 snap-x">
          {cards.map((card) => {
            const isActive = activeCategoryId === card.id;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => onSelectCategory(card)}
                className={`shrink-0 snap-start min-h-[38px] px-4 py-1.5 rounded-full border text-xs whitespace-nowrap flex items-center gap-1.5 transition-all active:scale-[0.96] ${
                  isActive
                    ? 'bg-[#00E5FF] border-[#00E5FF] text-[#071018] font-extrabold shadow-md shadow-[#00E5FF]/20'
                    : 'bg-[#141821] border-white/[0.08] text-[#CBD5E1] font-medium active:bg-[#1E2430]'
                }`}
              >
                <span>{card.label}</span>
                {card.id === 'all' && (
                  <SlidersHorizontal className={`w-3 h-3 ${isActive ? 'text-[#071018]' : 'text-[#00E5FF]'}`} />
                )}
              </button>
            );
          })}
        </div>
        {/* Right fade-out */}
        <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[#0B0D12] via-[#0B0D12]/75 to-transparent z-10" />
      </div>

      {/* ── DESKTOP: Classic image cards, 4 columns then auto-wrapping ── */}
      <div className="hidden md:grid md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-3 md:gap-3.5">
        {cards.map((card) => {
          const isActive = activeCategoryId === card.id;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => onSelectCategory(card)}
              className={`relative aspect-video rounded-xl overflow-hidden border cinema-sheen transition-all duration-300 text-left group active:scale-[0.98] hover:-translate-y-1 ${
                isActive
                  ? 'border-[#00E5FF] shadow-lg shadow-[#00E5FF]/15'
                  : `border-white/[0.08] hover:shadow-[0_14px_30px_rgba(0,0,0,0.65)] ${card.accentBorder}`
              }`}
            >
              <img
                src={card.image}
                alt={card.label}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover opacity-55 group-hover:scale-110 transition-transform duration-500"
              />
              <div className={`absolute inset-0 bg-gradient-to-r ${card.gradient}`} />

              <div className="absolute inset-0 p-3 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-[#CBD5E1]/90 line-clamp-1">
                    {card.subtitle}
                  </span>
                  {card.id === 'all' && (
                    <SlidersHorizontal className="w-3.5 h-3.5 text-[#00E5FF] shrink-0" />
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm font-black text-[#F8FAFC] tracking-[-0.02em] drop-shadow-sm">
                    {card.label}
                  </span>
                  {isActive && (
                    <span className="w-2 h-2 rounded-full bg-[#00E5FF]" />
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
};
