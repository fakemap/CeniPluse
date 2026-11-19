import React from 'react';

export const HeroSkeleton: React.FC = () => (
  <div className="px-4 md:px-0 mb-6">
    <div className="w-full aspect-[4/5] max-h-[520px] md:aspect-auto md:h-[380px] lg:h-[440px] rounded-2xl skeleton-shimmer border border-white/[0.06]" />
  </div>
);

export const RailSkeleton: React.FC<{ count?: number }> = ({ count = 7 }) => (
  <div className="mb-7">
    <div className="flex items-center justify-between px-4 md:px-0 mb-3">
      <div className="h-5 w-36 rounded-md skeleton-shimmer" />
      <div className="h-4 w-12 rounded-md skeleton-shimmer" />
    </div>
    <div className="flex overflow-x-hidden gap-3 px-4 md:px-0">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="shrink-0 w-[31%] min-w-[115px] md:w-[calc((100%-48px)/4.3)] lg:w-[calc((100%-70px)/6)] xl:w-[calc((100%-84px)/7)] 2xl:w-[calc((100%-98px)/8)]"
        >
          <div className="aspect-[2/3] rounded-xl skeleton-shimmer border border-white/[0.05]" />
          <div className="mt-2 h-3.5 w-4/5 rounded skeleton-shimmer" />
          <div className="mt-1.5 h-2.5 w-3/5 rounded skeleton-shimmer" />
        </div>
      ))}
    </div>
  </div>
);

export const GridSkeleton: React.FC<{ count?: number }> = ({ count = 12 }) => (
  <div className="grid grid-cols-3 gap-2.5 px-4 md:px-0 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 md:gap-4">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i}>
        <div className="aspect-[2/3] rounded-xl skeleton-shimmer border border-white/[0.05]" />
        <div className="mt-2 h-3.5 w-4/5 rounded skeleton-shimmer" />
        <div className="hidden md:block mt-1.5 h-2.5 w-3/5 rounded skeleton-shimmer" />
      </div>
    ))}
  </div>
);
