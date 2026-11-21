import React, { useEffect } from 'react';
import type { MonetizationConfig } from '../services/analytics';

interface GlobalAdLoaderProps {
  config: MonetizationConfig | null;
  hasActiveSubscription: boolean;
  isAdminRoute: boolean;
}

const SCRIPT_ELEMENT_ID = 'cenipluse-global-ad-script';

/**
 * Injects an optional global ad network script (e.g., Adsterra Social Bar or Monetag In-Page Push)
 * strictly for free visitors outside /admin. Automatically cleans up if the user upgrades to Premium.
 */
export const GlobalAdLoader: React.FC<GlobalAdLoaderProps> = ({
  config,
  hasActiveSubscription,
  isAdminRoute,
}) => {
  useEffect(() => {
    const existing = document.getElementById(SCRIPT_ELEMENT_ID);

    const scriptUrl = String(config?.globalAdScriptUrl || '').trim();
    const shouldLoad = Boolean(
      config?.adsEnabled &&
        !isAdminRoute &&
        !(config.adFreeForPremium && hasActiveSubscription) &&
        scriptUrl &&
        /^https:\/\//i.test(scriptUrl)
    );

    if (!shouldLoad) {
      if (existing) existing.remove();
      return;
    }

    if (existing && existing.getAttribute('src') === scriptUrl) {
      return;
    }
    if (existing) existing.remove();

    const script = document.createElement('script');
    script.id = SCRIPT_ELEMENT_ID;
    script.src = scriptUrl;
    script.async = true;
    script.setAttribute('data-cfasync', 'false');
    document.body.appendChild(script);

    return () => {
      const el = document.getElementById(SCRIPT_ELEMENT_ID);
      if (el) el.remove();
    };
  }, [
    config?.adsEnabled,
    config?.adFreeForPremium,
    config?.globalAdScriptUrl,
    hasActiveSubscription,
    isAdminRoute,
  ]);

  return null;
};
