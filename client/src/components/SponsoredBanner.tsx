import React, { useEffect, useRef } from 'react';
import { Crown, ExternalLink, Megaphone } from 'lucide-react';
import { trackEvent, type MonetizationConfig } from '../services/analytics';

interface SponsoredBannerProps {
  config: MonetizationConfig | null;
  premiumPlan: string | null;
  placement?: string;
  onOpenPremium: () => void;
}

export const SponsoredBanner: React.FC<SponsoredBannerProps> = ({
  config,
  premiumPlan,
  placement = 'home_mid',
  onOpenPremium,
}) => {
  const impressionSentRef = useRef(false);

  const shouldRender = Boolean(
    config &&
      config.adsEnabled &&
      config.bannerEnabled !== false &&
      !(config.adFreeForPremium && premiumPlan)
  );

  useEffect(() => {
    if (!shouldRender || impressionSentRef.current) return;
    impressionSentRef.current = true;
    trackEvent({
      eventType: 'ad_impression',
      pagePath: placement,
      metadata: { network: config?.adNetworkName || 'Sponsored', placement },
    });
  }, [shouldRender, placement, config?.adNetworkName]);

  if (!shouldRender || !config) return null;

  const hasExternalLink = Boolean(config.bannerLinkUrl && /^https?:\/\//i.test(config.bannerLinkUrl));

  const handleClick = () => {
    trackEvent({
      eventType: 'ad_click',
      pagePath: placement,
      metadata: {
        network: config.adNetworkName || 'Sponsored',
        placement,
        target: hasExternalLink ? config.bannerLinkUrl : 'premium_modal',
      },
    });
    if (hasExternalLink) {
      window.open(config.bannerLinkUrl, '_blank', 'noopener,noreferrer');
    } else {
      onOpenPremium();
    }
  };

  return (
    <div className="mx-4 md:mx-0 my-5 rounded-2xl bg-gradient-to-r from-[#1A1612] via-[#141821] to-[#0E1822] border border-[#FCE18E]/25 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
      <div className="flex items-start sm:items-center gap-3 min-w-0">
        <span className="w-10 h-10 rounded-xl bg-[#FCE18E]/15 border border-[#FCE18E]/35 text-[#FCE18E] flex items-center justify-center shrink-0">
          {hasExternalLink ? <Megaphone className="w-4 h-4" /> : <Crown className="w-4 h-4" />}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded bg-white/10 text-[9.5px] font-extrabold uppercase tracking-wider text-[#94A3B8]">
              {config.adNetworkName || 'Sponsored'}
            </span>
          </div>
          <h3 className="text-sm font-extrabold text-[#F8FAFC] leading-snug mt-0.5">
            {config.bannerTitle}
          </h3>
          {config.bannerSubtitle && (
            <p className="text-xs text-[#94A3B8] mt-0.5 line-clamp-2">{config.bannerSubtitle}</p>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={handleClick}
        className="w-full sm:w-auto shrink-0 min-h-[42px] px-5 rounded-xl sm:rounded-full bg-gradient-to-r from-[#FFF1BC] via-[#FCE18E] to-[#F5CD67] hover:brightness-105 active:scale-[0.98] text-[#2B1907] text-xs font-extrabold inline-flex items-center justify-center gap-1.5 transition-all"
      >
        <span>{config.bannerCtaText || 'Learn More'}</span>
        {hasExternalLink ? <ExternalLink className="w-3.5 h-3.5" /> : <Crown className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
};
