import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import type { FilterState } from '../types/media';
import {
  GENRE_OPTIONS,
  COUNTRY_OPTIONS,
  YEAR_OPTIONS,
  LANGUAGE_OPTIONS,
  SORT_OPTIONS,
} from '../data/catalog';

interface FilterMatrixProps {
  filters: FilterState;
  onChange: (patch: Partial<FilterState>) => void;
  onReset: () => void;
}

type SheetKey = 'genre' | 'country' | 'year' | 'language' | 'sortBy';

const SHEET_TABS: Array<{ key: SheetKey; label: string; options: string[] }> = [
  { key: 'genre', label: 'Genre', options: GENRE_OPTIONS },
  { key: 'country', label: 'Country', options: COUNTRY_OPTIONS },
  { key: 'year', label: 'Year', options: YEAR_OPTIONS },
  { key: 'language', label: 'Language', options: LANGUAGE_OPTIONS },
  { key: 'sortBy', label: 'Sort', options: SORT_OPTIONS },
];

interface DesktopRowProps {
  label: string;
  options: string[];
  value: string;
  onSelect: (val: string) => void;
}

const DesktopFilterRow: React.FC<DesktopRowProps> = ({
  label,
  options,
  value,
  onSelect,
}) => (
  <div className="flex items-center gap-3">
    <span className="w-20 shrink-0 text-xs font-semibold text-[#94A3B8]">{label}</span>
    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide py-0.5 flex-1">
      {options.map((opt) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onSelect(opt)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
              active
                ? 'bg-[#00E5FF] text-[#071018] font-bold'
                : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1E2430]'
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  </div>
);

export const FilterMatrix: React.FC<FilterMatrixProps> = ({
  filters,
  onChange,
  onReset,
}) => {
  const [openSheet, setOpenSheet] = useState<SheetKey | null>(null);
  const [draft, setDraft] = useState<FilterState>(filters);
  const [dragY, setDragY] = useState(0);
  const touchStartY = useRef<number | null>(null);

  // Sync draft whenever sheet opens
  useEffect(() => {
    if (openSheet) {
      setDraft(filters);
      setDragY(0);
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [openSheet, filters]);

  const activeFilterCount =
    (filters.genre !== 'All' ? 1 : 0) +
    (filters.country !== 'All' ? 1 : 0) +
    (filters.year !== 'All' ? 1 : 0) +
    (filters.language !== 'All' ? 1 : 0) +
    (filters.sortBy !== 'For You' ? 1 : 0);

  const hasActiveFilter = activeFilterCount > 0;

  const activeTabConfig = SHEET_TABS.find((t) => t.key === openSheet) || SHEET_TABS[0];

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const delta = e.touches[0].clientY - touchStartY.current;
    if (delta > 0) setDragY(delta);
  };

  const handleTouchEnd = () => {
    if (dragY > 90) {
      setOpenSheet(null);
    }
    setDragY(0);
    touchStartY.current = null;
  };

  const applyDraft = () => {
    onChange(draft);
    setOpenSheet(null);
  };

  const resetDraftAndApply = () => {
    onReset();
    setOpenSheet(null);
  };

  const getChipDisplay = (key: SheetKey, label: string) => {
    const val = filters[key];
    const isDefault = (key === 'sortBy' && val === 'For You') || val === 'All';
    return {
      text: isDefault ? label : val,
      active: !isDefault,
    };
  };

  return (
    <>
      {/* MOBILE (<768px): Single Horizontal Scrollable Row of Compact Filter Chips with Right-Edge Fade */}
      <div className="md:hidden mb-4 relative">
        <div className="flex items-center gap-1.5 overflow-x-auto pl-4 pr-10 scrollbar-hide py-0.5">
          <button
            type="button"
            onClick={() => setOpenSheet('genre')}
            aria-label="Open all filters"
            className={`shrink-0 min-w-[44px] min-h-[44px] px-3 rounded-full border flex items-center justify-center gap-1.5 text-xs font-bold transition-colors ${
              hasActiveFilter
                ? 'bg-[#00E5FF]/15 border-[#00E5FF]/50 text-[#00E5FF]'
                : 'bg-[#141821] border-white/10 text-[#F8FAFC]'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            {activeFilterCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-[#00E5FF] text-[#071018] text-[10px] font-black tabular-nums">
                {activeFilterCount}
              </span>
            )}
          </button>

          {SHEET_TABS.map(({ key, label }) => {
            const chip = getChipDisplay(key, label);
            return (
              <button
                key={key}
                type="button"
                onClick={() => setOpenSheet(key)}
                className={`shrink-0 min-h-[44px] px-3 rounded-full border text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap transition-all ${
                  chip.active
                    ? 'bg-[#00E5FF] border-[#00E5FF] text-[#071018] font-bold'
                    : 'bg-[#141821] border-white/10 text-[#CBD5E1] active:bg-[#1E2430]'
                }`}
              >
                <span>{chip.text}</span>
                <ChevronDown className="w-3.5 h-3.5 opacity-80" />
              </button>
            );
          })}

          {hasActiveFilter && (
            <button
              type="button"
              onClick={onReset}
              className="shrink-0 min-h-[44px] px-3 rounded-full bg-[#1E2430] border border-white/10 text-xs font-semibold text-[#94A3B8] active:text-white inline-flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
          )}
        </div>
        <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[#0B0D12] via-[#0B0D12]/80 to-transparent" />
      </div>

      {/* MOBILE SWIPE-TO-CLOSE BOTTOM SHEET MODAL */}
      {openSheet && (
        <div
          onClick={() => setOpenSheet(null)}
          className="md:hidden fixed inset-0 z-[100] bg-black/75 backdrop-blur-sm flex items-end"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
              transition: dragY > 0 ? 'none' : 'transform 0.22s ease',
            }}
            className="w-full max-h-[82vh] bg-[#141821] border-t border-white/15 rounded-t-2xl flex flex-col overflow-hidden animate-sheet-up shadow-[0_-20px_60px_rgba(0,0,0,0.85)]"
          >
            {/* Swipe Handle + Header */}
            <div
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              className="pt-2.5 pb-2 px-4 border-b border-white/[0.07] touch-none"
            >
              <div className="w-10 h-1.5 rounded-full bg-white/25 mx-auto mb-3" />
              <div className="flex items-center justify-between">
                <h3 className="text-base font-extrabold text-[#F8FAFC]">
                  Filter &amp; Sort
                </h3>
                <button
                  type="button"
                  onClick={() => setOpenSheet(null)}
                  aria-label="Close filter sheet"
                  className="min-w-[44px] min-h-[44px] -mr-2 rounded-full flex items-center justify-center text-[#94A3B8] active:bg-[#1E2430] active:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Sheet Category Tabs */}
              <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pt-2 pb-1">
                {SHEET_TABS.map((tab) => {
                  const isCurrent = tab.key === openSheet;
                  const val = draft[tab.key];
                  const changed = (tab.key === 'sortBy' && val !== 'For You') || (tab.key !== 'sortBy' && val !== 'All');
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setOpenSheet(tab.key)}
                      className={`shrink-0 min-h-[40px] px-3.5 rounded-full text-xs font-bold transition-colors ${
                        isCurrent
                          ? 'bg-[#1E2430] text-[#00E5FF] border border-[#00E5FF]/40'
                          : 'text-[#94A3B8] border border-transparent'
                      }`}
                    >
                      {tab.label}
                      {changed && (
                        <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-[#00E5FF]" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Large Easy-to-Tap Pill Options (min-h-40px+) */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="flex flex-wrap gap-2">
                {activeTabConfig.options.map((opt) => {
                  const selected = draft[activeTabConfig.key] === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() =>
                        setDraft((prev) => ({ ...prev, [activeTabConfig.key]: opt }))
                      }
                      className={`min-h-[42px] px-4 rounded-xl text-xs font-bold border transition-all ${
                        selected
                          ? 'bg-[#00E5FF] border-[#00E5FF] text-[#071018]'
                          : 'bg-[#0B0D12] border-white/[0.08] text-[#CBD5E1] active:bg-[#1E2430]'
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sticky Bottom Apply Filters Bar */}
            <div className="p-4 pt-3 bg-[#141821] border-t border-white/10 pb-[calc(16px+env(safe-area-inset-bottom))] flex items-center gap-2.5">
              <button
                type="button"
                onClick={resetDraftAndApply}
                className="min-h-[48px] px-4 rounded-xl bg-[#1E2430] active:bg-[#273041] text-xs font-bold text-[#CBD5E1]"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={applyDraft}
                className="flex-1 min-h-[48px] rounded-xl bg-[#00E5FF] active:brightness-90 text-[#071018] text-sm font-extrabold"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DESKTOP (>=768px): Multi-Row Horizontal Tag Filter Matrix */}
      <section className="hidden md:block rounded-2xl bg-[#141821]/90 backdrop-blur-xl border border-white/[0.08] cinema-sheen px-4 py-3.5 mb-6 space-y-2.5">
        <DesktopFilterRow
          label="Genre"
          options={GENRE_OPTIONS}
          value={filters.genre}
          onSelect={(genre) => onChange({ genre })}
        />
        <DesktopFilterRow
          label="Country"
          options={COUNTRY_OPTIONS}
          value={filters.country}
          onSelect={(country) => onChange({ country })}
        />
        <DesktopFilterRow
          label="Year"
          options={YEAR_OPTIONS}
          value={filters.year}
          onSelect={(year) => onChange({ year })}
        />
        <DesktopFilterRow
          label="Language"
          options={LANGUAGE_OPTIONS}
          value={filters.language}
          onSelect={(language) => onChange({ language })}
        />

        <div className="flex items-center justify-between gap-3 pt-1 border-t border-white/[0.05]">
          <DesktopFilterRow
            label="Sort by"
            options={SORT_OPTIONS}
            value={filters.sortBy}
            onSelect={(sortBy) =>
              onChange({ sortBy: sortBy as FilterState['sortBy'] })
            }
          />

          {hasActiveFilter && (
            <button
              type="button"
              onClick={onReset}
              className="shrink-0 px-2.5 py-1 rounded-full bg-[#1E2430] hover:bg-white/10 text-[11px] font-semibold text-[#94A3B8] hover:text-[#F8FAFC] inline-flex items-center gap-1 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Reset ({activeFilterCount})
            </button>
          )}
        </div>
      </section>
    </>
  );
};
