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
    <section className="mb-6 md:mb-8">
      <div className="flex items-center justify-between px-4 md:px-0 mb-2.5 md:mb-3">
        <h2 className="text-[15px] md:text-lg font-extrabold tracking-[-0.015em] text-[#F8FAFC]">
          Categories
        </h2>
      </div>

      <div className="flex gap-2.5 overflow-x-auto px-4 scroll-px-4 md:scroll-px-0 snap-x snap-mandatory scrollbar-hide pb-1.5 pt-0.5 md:grid md:grid-cols-3 lg:grid-cols-6 md:gap-3.5 md:overflow-visible md:px-0 md:pb-0">
        {cards.map((card) => {
          const isActive = activeCategoryId === card.id;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => onSelectCategory(card)}
              className={`relative shrink-0 snap-start w-[42%] min-w-[152px] md:w-full md:min-w-0 aspect-video rounded-xl md:rounded-2xl overflow-hidden border cinema-sheen transition-all duration-300 text-left group active:scale-[0.98] lg:hover:-translate-y-1 ${
                isActive
                  ? 'border-[#00E5FF]'
                  : `border-white/[0.08] hover:shadow-[0_14px_30px_rgba(0,0,0,0.65)] ${card.accentBorder}`
              }`}
            >
              <img
                src={card.image}
                alt={card.label}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover opacity-55 lg:group-hover:scale-110 transition-transform duration-500"
              />
              <div className={`absolute inset-0 bg-gradient-to-r ${card.gradient}`} />

              <div className="absolute inset-0 p-3 md:p-3.5 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#CBD5E1]/90 line-clamp-1">
                    {card.subtitle}
                  </span>
                  {card.id === 'all' && (
                    <SlidersHorizontal className="w-3.5 h-3.5 text-[#00E5FF] shrink-0" />
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm md:text-[16px] font-black text-[#F8FAFC] tracking-[-0.02em] drop-shadow-sm">
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
