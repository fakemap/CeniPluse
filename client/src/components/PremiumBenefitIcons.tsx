import React from 'react';

export type PremiumPlanId = 'monthly' | 'quarterly' | 'yearly';

export interface PremiumPlan {
  id: PremiumPlanId;
  name: string;
  currency: string;
  price: string;
  perMonth: string;
}

export const PREMIUM_PLANS: PremiumPlan[] = [
  {
    id: 'monthly',
    name: 'Monthly',
    currency: 'GH₵',
    price: '24',
    perMonth: 'GH₵24 / Month',
  },
  {
    id: 'quarterly',
    name: 'Quarterly',
    currency: 'GH₵',
    price: '61',
    perMonth: 'GH₵20.33 / Month',
  },
  {
    id: 'yearly',
    name: 'Yearly',
    currency: 'GH₵',
    price: '183',
    perMonth: 'GH₵15.25 / Month',
  },
];

export interface PremiumBenefit {
  id:
    | 'all-contents'
    | 'high-quality'
    | 'no-ads'
    | 'web-logins'
    | 'tv-logins'
    | 'phone-logins';
  label: string;
  badge?: string;
}

export const PREMIUM_BENEFITS: PremiumBenefit[] = [
  { id: 'all-contents', label: 'All contents' },
  { id: 'high-quality', label: 'High Quality' },
  { id: 'no-ads', label: 'No Ads' },
  { id: 'web-logins', label: 'Web Logins', badge: 'x3' },
  { id: 'tv-logins', label: 'TV Logins', badge: 'x3' },
  { id: 'phone-logins', label: 'Phone Logins', badge: 'x3' },
];

interface BenefitGlyphProps {
  id: PremiumBenefit['id'];
  className?: string;
}

const BenefitGlyph: React.FC<BenefitGlyphProps> = ({ id, className = 'w-4 h-4' }) => {
  switch (id) {
    case 'all-contents':
      // Classic cinema film reel icon
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="7.5" />
          <circle cx="12" cy="8.2" r="1.3" fill="currentColor" stroke="none" />
          <circle cx="12" cy="15.8" r="1.3" fill="currentColor" stroke="none" />
          <circle cx="8.2" cy="12" r="1.3" fill="currentColor" stroke="none" />
          <circle cx="15.8" cy="12" r="1.3" fill="currentColor" stroke="none" />
          <path d="M12 19.5h7.5" />
        </svg>
      );
    case 'high-quality':
      // Crisp HD vector lettering
      return (
        <svg viewBox="0 0 28 20" className={className} fill="none" aria-hidden="true">
          <text
            x="14"
            y="14.5"
            textAnchor="middle"
            fill="currentColor"
            fontSize="11.5"
            fontWeight="900"
            fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
            letterSpacing="-0.4"
          >
            HD
          </text>
        </svg>
      );
    case 'no-ads':
      // Crisp AD lettering with diagonal slash
      return (
        <svg viewBox="0 0 28 20" className={className} fill="none" aria-hidden="true">
          <text
            x="14"
            y="14"
            textAnchor="middle"
            fill="currentColor"
            fontSize="10.5"
            fontWeight="900"
            fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
            letterSpacing="-0.3"
          >
            AD
          </text>
          <path
            d="M5.5 16L22.5 4"
            stroke="currentColor"
            strokeWidth="2.1"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'web-logins':
      // Laptop / web browser icon
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="4" y="5.5" width="16" height="10.5" rx="1.6" />
          <path d="M2.5 18.5h19" />
          <path d="M8 9.5h8" />
        </svg>
      );
    case 'tv-logins':
      // Smart TV display icon
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3.5" y="5" width="17" height="11.5" rx="2" />
          <path d="M8.5 19.5h7" />
          <path d="M12 16.5v3" />
        </svg>
      );
    case 'phone-logins':
      // Mobile phone icon
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="7" y="3.5" width="10" height="17" rx="2" />
          <circle cx="12" cy="17.2" r="0.9" fill="currentColor" stroke="none" />
        </svg>
      );
  }
};

interface PremiumHexBadgeProps {
  benefit: PremiumBenefit;
  variant: 'dark' | 'light';
}

export const PremiumHexBadge: React.FC<PremiumHexBadgeProps> = ({
  benefit,
  variant,
}) => {
  const isDark = variant === 'dark';

  return (
    <div className="relative inline-flex items-center justify-center w-11 h-11">
      <svg viewBox="0 0 40 44" className="w-10 h-11" aria-hidden="true">
        <polygon
          points="20,2 37,11.5 37,32.5 20,42 3,32.5 3,11.5"
          fill={isDark ? '#69472C' : '#EFE0B3'}
          stroke={isDark ? 'rgba(249, 224, 160, 0.28)' : 'rgba(130, 88, 36, 0.25)'}
          strokeWidth="1.3"
        />
      </svg>

      <span
        className={`absolute inset-0 flex items-center justify-center ${
          isDark ? 'text-[#FFECC0]' : 'text-[#543417]'
        }`}
      >
        <BenefitGlyph
          id={benefit.id}
          className={benefit.id === 'high-quality' || benefit.id === 'no-ads' ? 'w-6 h-5' : 'w-[18px] h-[18px]'}
        />
      </span>

      {benefit.badge && (
        <span
          className={`absolute -top-1 left-1/2 -translate-x-1/2 px-1.5 py-[1px] rounded text-[9px] font-black leading-none tracking-tight shadow-sm tabular-nums ${
            isDark
              ? 'bg-[#362010] border border-[#F5CD67]/40 text-[#FFE9B0]'
              : 'bg-[#4D2E15] text-[#FFF3CA]'
          }`}
        >
          {benefit.badge}
        </span>
      )}
    </div>
  );
};

interface PremiumHexCrownProps {
  size?: 'sm' | 'lg';
  className?: string;
}

export const PremiumHexCrown: React.FC<PremiumHexCrownProps> = ({
  size = 'sm',
  className = '',
}) => {
  const isLg = size === 'lg';
  const dim = isLg ? 'w-[84px] h-[92px] sm:w-[100px] sm:h-[110px]' : 'w-7 h-8';

  return (
    <div
      className={`inline-flex items-center justify-center shrink-0 select-none ${dim} ${className}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 80 88" className="w-full h-full drop-shadow-[0_6px_14px_rgba(0,0,0,0.4)]">
        <defs>
          <linearGradient id={`crownBorder-${size}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFF7D1" />
            <stop offset="50%" stopColor="#E9BE62" />
            <stop offset="100%" stopColor="#C99235" />
          </linearGradient>
          <linearGradient id={`crownInner-${size}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#5C3B1F" />
            <stop offset="100%" stopColor="#3B2310" />
          </linearGradient>
          <linearGradient id={`crownMetal-${size}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FFF6D2" />
            <stop offset="55%" stopColor="#F5CE75" />
            <stop offset="100%" stopColor="#C89238" />
          </linearGradient>
        </defs>

        {/* Outer metallic bevel hexagon */}
        <polygon
          points="40,3 74,22 74,66 40,85 6,66 6,22"
          fill={`url(#crownBorder-${size})`}
        />
        {/* Inner espresso-bronze core */}
        <polygon
          points="40,9 69,25 69,63 40,79 11,63 11,25"
          fill={`url(#crownInner-${size})`}
        />
        {/* Sculpted solid cinema crown inside */}
        <path
          d="M23 54L19 32L31 41L40 27L49 41L61 32L57 54H23ZM24 58H56V62H24V58Z"
          fill={`url(#crownMetal-${size})`}
        />
        {/* Subtle check/chevron accent inside crown matching emblem */}
        <path
          d="M34 45.5L40 50.5L46 45.5"
          fill="none"
          stroke="#4A2D15"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};
