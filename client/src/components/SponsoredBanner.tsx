import React, { useEffect, useRef } from 'react';
import { Crown, ExternalLink, Megaphone } from 'lucide-react';
import { trackEvent, type MonetizationConfig } from '../services/analytics';

interface SponsoredBannerProps {
  config: MonetizationConfig | null;
  premiumPlan: string | null;
  slot?: 'primary' | 'secondary';
  placement?: string;
  onOpenPremium: () => void;
}

export const SponsoredBanner: React.FC<SponsoredBannerProps> = ({
  config,
  premiumPlan,
  slot = 'primary',
  placement = 'home_mid',
  onOpenPremium,
}) => {
  const impressionSentRef = useRef(false);

  const isSecondary = slot === 'secondary';
  const slotEnabled = isSecondary
    ? config?.secondAdEnabled !== false
    : config?.bannerEnabled !== false;

  const shouldRender = Boolean(
    config &&
      config.adsEnabled &&
      slotEnabled &&
      !(config.adFreeForPremium && premiumPlan)
  );

  const networkLabel = isSecondary
    ? config?.secondAdNetworkName || 'Partner Offer'
    : config?.adNetworkName || 'Sponsored';
  const titleText = isSecondary
    ? config?.secondAdTitle || config?.bannerTitle || 'Go Ad-Free with CinePulse Premium'
    : config?.bannerTitle || 'Unlock Unlimited HD Movies & Downloads';
  const subtitleText = isSecondary
    ? config?.secondAdSubtitle || config?.bannerSubtitle || ''
    : config?.bannerSubtitle || '';
  const ctaText = isSecondary
    ? config?.secondAdCtaText || 'Go Premium'
    : config?.bannerCtaText || 'Subscribe Now';
  const linkUrl = isSecondary
    ? config?.secondAdLinkUrl || ''
    : config?.bannerLinkUrl || '';

  useEffect(() => {
    if (!shouldRender || impressionSentRef.current) return;
    impressionSentRef.current = true;
    trackEvent({
      eventType: 'ad_impression',
      pagePath: placement,
      metadata: { network: networkLabel, placement, slot },
    });
  }, [shouldRender, placement, networkLabel, slot]);

  if (!shouldRender || !config) return null;

  const hasExternalLink = Boolean(linkUrl && /^https?:\/\//i.test(linkUrl));

  const handleClick = () => {
    trackEvent({
      eventType: 'ad_click',
      pagePath: placement,
      metadata: {
        network: networkLabel,
        placement,
        slot,
        target: hasExternalLink ? linkUrl : 'premium_modal',
      },
    });
    if (hasExternalLink) {
      window.open(linkUrl, '_blank', 'noopener,noreferrer');
    } else {
      onOpenPremium();
    }
  };

  return (
    <div
      className={`mx-4 md:mx-0 my-5 rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg ${
        isSecondary
          ? 'bg-gradient-to-r from-[#0E1924] via-[#141821] to-[#1A1424] border-[#00E5FF]/25'
          : 'bg-gradient-to-r from-[#1A1612] via-[#141821] to-[#0E1822] border-[#FCE18E]/25'
      }`}
    >
      <div className="flex items-start sm:items-center gap-3 min-w-0">
        <span
          className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
            isSecondary
              ? 'bg-[#00E5FF]/15 border-[#00E5FF]/35 text-[#00E5FF]'
              : 'bg-[#FCE18E]/15 border-[#FCE18E]/35 text-[#FCE18E]'
          }`}
        >
          {hasExternalLink ? <Megaphone className="w-4 h-4" /> : <Crown className="w-4 h-4" />}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded bg-white/10 text-[9.5px] font-extrabold uppercase tracking-wider text-[#94A3B8]">
              Ad &bull; {networkLabel}
            </span>
          </div>
          <h3 className="text-sm font-extrabold text-[#F8FAFC] leading-snug mt-0.5">
            {titleText}
          </h3>
          {subtitleText && (
            <p className="text-xs text-[#94A3B8] mt-0.5 line-clamp-2">{subtitleText}</p>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={handleClick}
        className={`w-full sm:w-auto shrink-0 min-h-[42px] px-5 rounded-xl sm:rounded-full hover:brightness-105 active:scale-[0.98] text-xs font-extrabold inline-flex items-center justify-center gap-1.5 transition-all ${
          isSecondary
            ? 'bg-[#00E5FF] text-[#071018]'
            : 'bg-gradient-to-r from-[#FFF1BC] via-[#FCE18E] to-[#F5CD67] text-[#2B1907]'
        }`}
      >
        <span>{ctaText}</span>
        {hasExternalLink ? <ExternalLink className="w-3.5 h-3.5" /> : <Crown className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
};
