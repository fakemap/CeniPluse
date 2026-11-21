import React, { useEffect, useRef, useState } from 'react';
import { Crown, ExternalLink, Megaphone } from 'lucide-react';
import { trackEvent, type MonetizationConfig } from '../services/analytics';

interface AdSlotProps {
  config: MonetizationConfig | null;
  premiumPlan: string | null;
  hasActiveSubscription?: boolean;
  slot: 'home' | 'player' | 'download';
  placement?: string;
  onOpenPremium: () => void;
}

/**
 * Universal AdSlot component supporting:
 * 1) Live Third-Party Ad Network HTML/Script zones (Adsterra, Monetag, HilltopAds, ExoClick) inside an isolated srcDoc iframe
 * 2) Direct Sponsor Image Banner (custom image URL + external link)
 * 3) Fallback Native Promo / Partner Card (links to Smartlink / Partner URL or Premium modal)
 *
 * Automatically hidden when user has an active Premium subscription and `adFreeForPremium` is enabled.
 */
export const AdSlot: React.FC<AdSlotProps> = ({
  config,
  premiumPlan,
  hasActiveSubscription = false,
  slot,
  placement,
  onOpenPremium,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const impressionSentRef = useRef(false);
  const [inView, setInView] = useState(false);
  const defaultFrameHeight = slot === 'download' ? 50 : slot === 'home' ? 90 : 120;
  const [frameHeight, setFrameHeight] = useState<number>(defaultFrameHeight);
  const frameIdRef = useRef<string>(`cp_ad_${slot}_${Math.random().toString(36).slice(2, 8)}`);

  const isPremiumUser = Boolean(hasActiveSubscription || premiumPlan);
  const isSecondary = slot === 'player' || slot === 'download';

  const htmlCode =
    slot === 'home'
      ? (config?.homeBannerCode || '').trim()
      : slot === 'player'
      ? (config?.playerBannerCode || '').trim()
      : (config?.downloadBannerCode || '').trim();

  const imageUrl =
    slot === 'home'
      ? (config?.bannerImageUrl || '').trim()
      : (config?.secondAdImageUrl || config?.bannerImageUrl || '').trim();

  const linkUrl =
    slot === 'home'
      ? (config?.bannerLinkUrl || config?.smartlinkUrl || '').trim()
      : (config?.secondAdLinkUrl || config?.smartlinkUrl || config?.bannerLinkUrl || '').trim();

  const slotEnabled =
    slot === 'home'
      ? config?.bannerEnabled !== false || Boolean(htmlCode)
      : slot === 'player'
      ? config?.secondAdEnabled !== false || Boolean(htmlCode)
      : Boolean(htmlCode) || config?.secondAdEnabled === true;

  const shouldRender = Boolean(
    config &&
      config.adsEnabled &&
      slotEnabled &&
      !(config.adFreeForPremium && isPremiumUser)
  );

  const resolvedPlacement =
    placement ||
    (slot === 'home'
      ? 'home_mid'
      : slot === 'player'
      ? 'media_detail_player'
      : 'download_modal');

  const networkLabel =
    slot === 'home'
      ? config?.adNetworkName || 'Sponsored'
      : config?.secondAdNetworkName || config?.adNetworkName || 'Sponsored';

  // Track viewability impression via IntersectionObserver
  useEffect(() => {
    if (!shouldRender || !containerRef.current) return;
    const el = containerRef.current;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          obs.disconnect();
        }
      },
      { threshold: 0.25 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [shouldRender]);

  useEffect(() => {
    if (!shouldRender || !inView || impressionSentRef.current) return;
    impressionSentRef.current = true;
    trackEvent({
      eventType: 'ad_impression',
      pagePath: resolvedPlacement,
      metadata: {
        network: networkLabel,
        placement: resolvedPlacement,
        slot,
        mode: htmlCode ? 'network_script' : imageUrl ? 'sponsor_image' : 'native_card',
      },
    });
  }, [shouldRender, inView, resolvedPlacement, networkLabel, slot, htmlCode, imageUrl]);

  useEffect(() => {
    if (!shouldRender || !htmlCode) return;
    const onMessage = (e: MessageEvent) => {
      if (!e.data || e.data.type !== 'cp-ad-resize' || e.data.id !== frameIdRef.current) return;
      const h = Number(e.data.height);
      if (Number.isFinite(h) && h >= 40 && h <= 300) {
        setFrameHeight(Math.ceil(h));
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [shouldRender, htmlCode]);

  if (!shouldRender || !config) return null;

  const hasExternalLink = Boolean(linkUrl && /^https?:\/\//i.test(linkUrl));

  const handleTrackAndOpen = () => {
    trackEvent({
      eventType: 'ad_click',
      pagePath: resolvedPlacement,
      metadata: {
        network: networkLabel,
        placement: resolvedPlacement,
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

  // Mode 1: Live Third-Party Ad Network Code inside a borderless, tightly fitted srcDoc iframe
  if (htmlCode) {
    const frameId = frameIdRef.current;
    const srcDoc = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  html, body {
    margin: 0;
    padding: 0;
    background: transparent;
    overflow: hidden;
    width: 100%;
  }
  #cp-ad-wrap {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 0;
  }
</style>
</head>
<body>
  <div id="cp-ad-wrap">${htmlCode}</div>
  <script>
    (function(){
      var id = ${JSON.stringify(frameId)};
      function report() {
        var el = document.getElementById('cp-ad-wrap');
        if (!el) return;
        var rect = el.getBoundingClientRect();
        var h = Math.max(rect.height || 0, el.scrollHeight || 0);
        if (h >= 40) {
          try { window.parent.postMessage({ type: 'cp-ad-resize', id: id, height: h }, '*'); } catch (e) {}
        }
      }
      if (typeof ResizeObserver !== 'undefined') {
        try { new ResizeObserver(report).observe(document.getElementById('cp-ad-wrap')); } catch (e) {}
      }
      window.addEventListener('load', report);
      setTimeout(report, 600);
      setTimeout(report, 1800);
    })();
  </script>
</body>
</html>`;

    const maxWidthClass =
      slot === 'download'
        ? 'max-w-[320px]'
        : slot === 'home'
        ? 'max-w-[728px]'
        : 'max-w-full';

    return (
      <div
        ref={containerRef}
        className={`${
          slot === 'download' ? 'my-1' : 'my-3'
        } w-full flex items-center justify-center bg-transparent overflow-hidden`}
      >
        <iframe
          title={`Advertisement ${slot}`}
          srcDoc={srcDoc}
          sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-forms allow-top-navigation-by-user-activation"
          loading="lazy"
          scrolling="no"
          style={{ height: `${frameHeight}px` }}
          className={`w-full ${maxWidthClass} border-0 bg-transparent block`}
        />
      </div>
    );
  }

  // Mode 2: Direct Sponsor Banner Image (borderless & tightly fitted)
  if (imageUrl && /^https?:\/\//i.test(imageUrl)) {
    return (
      <div
        ref={containerRef}
        className={`${
          slot === 'download' ? 'my-1' : 'my-3'
        } w-full flex items-center justify-center bg-transparent overflow-hidden`}
      >
        <button
          type="button"
          onClick={handleTrackAndOpen}
          className="block focus:outline-none group"
        >
          <img
            src={imageUrl}
            alt={config.bannerTitle || 'Sponsored Banner'}
            loading="lazy"
            className={`max-w-full rounded-lg object-contain group-hover:brightness-105 transition-all ${
              slot === 'download' ? 'max-h-[60px]' : 'max-h-[110px] sm:max-h-[130px]'
            }`}
          />
        </button>
      </div>
    );
  }

  // Mode 3: Native Promo / Partner Card Fallback
  const titleText = isSecondary
    ? config.secondAdTitle || config.bannerTitle || 'Go Ad-Free with CeniPluse Premium'
    : config.bannerTitle || 'Unlock Unlimited HD Movies & Downloads';
  const subtitleText = isSecondary
    ? config.secondAdSubtitle || config.bannerSubtitle || ''
    : config.bannerSubtitle || '';
  const ctaText = isSecondary
    ? config.secondAdCtaText || 'Go Premium'
    : config.bannerCtaText || 'Subscribe Now';

  return (
    <div
      ref={containerRef}
      className={`${
        slot === 'download' ? 'my-1 p-3' : 'mx-4 md:mx-0 my-5 p-4'
      } rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg ${
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
        onClick={handleTrackAndOpen}
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
