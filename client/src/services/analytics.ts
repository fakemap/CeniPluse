export type AnalyticsEventType =
  | 'page_view'
  | 'title_view'
  | 'play_start'
  | 'watch_heartbeat'
  | 'download_video'
  | 'download_subtitle'
  | 'search'
  | 'watchlist_add'
  | 'review_post'
  | 'title_request'
  | 'signup'
  | 'ad_impression'
  | 'ad_click';

export interface AnalyticsEventPayload {
  eventType: AnalyticsEventType;
  mediaId?: string;
  mediaTitle?: string;
  mediaType?: string;
  mediaPoster?: string;
  pagePath?: string;
  searchQuery?: string;
  metadata?: Record<string, unknown>;
}

export interface MonetizationConfig {
  adsEnabled: boolean;
  adFreeForPremium: boolean;
  bannerEnabled: boolean;
  adNetworkName: string;
  bannerTitle: string;
  bannerSubtitle: string;
  bannerCtaText: string;
  bannerLinkUrl: string;
  ecpmGhs?: number;
  paymentGateway?: string;
  paystackPublicKey?: string;
  hasPaystackKey?: boolean;
}

export interface AdminAnalyticsDashboardData {
  rangeDays: number;
  generatedAt: string;
  kpis: {
    activeNow: number;
    totalPageViews: number;
    todayPageViews: number;
    uniqueVisitors: number;
    signedInUsers: number;
    totalTitleViews: number;
    totalPlays: number;
    totalWatchMinutes: number;
    totalVideoDownloads: number;
    totalSubtitleDownloads: number;
    totalSearches: number;
    totalWatchlistAdds: number;
    totalReviews: number;
    totalRequests: number;
    totalSignups: number;
    totalAdImpressions: number;
    totalAdClicks: number;
    adCtrPercent: number;
    totalRevenueGhs: number;
    subscriptionRevenueGhs: number;
    rangeSubscriptionRevenueGhs: number;
    adRevenueGhs: number;
    mrrGhs: number;
    activeSubscribers: number;
    conversionRatePercent: number;
  };
  dailySeries: Array<{
    date: string;
    label: string;
    pageViews: number;
    uniqueVisitors: number;
    plays: number;
    downloads: number;
    searches: number;
    adImpressions: number;
    subscriptionRevenue: number;
    adRevenue: number;
    totalRevenue: number;
  }>;
  hourlyDistribution: Array<{
    hour: number;
    label: string;
    events: number;
    plays: number;
  }>;
  deviceBreakdown: Array<{
    device: string;
    count: number;
    percent: number;
  }>;
  topWatched: Array<{
    mediaId: string;
    title: string;
    type: string;
    poster: string;
    views: number;
    plays: number;
    watchSeconds: number;
    watchMinutes: number;
    videoDownloads: number;
    subtitleDownloads: number;
  }>;
  topDownloaded: Array<{
    mediaId: string;
    title: string;
    type: string;
    poster: string;
    videoDownloads: number;
    subtitleDownloads: number;
  }>;
  topSearches: Array<{ query: string; count: number }>;
  topPages: Array<{ page: string; views: number }>;
  revenueByPlan: Array<{ plan: string; amount: number }>;
  revenueByMethod: Array<{ method: string; amount: number }>;
  recentTransactions: Array<{
    id: number;
    source: string;
    planName: string;
    paymentMethod: string;
    currency: string;
    amount: number;
    status: string;
    userEmail: string;
    reference: string;
    notes: string;
    createdAt: string;
  }>;
  recentActivity: Array<{
    id: number;
    eventType: AnalyticsEventType;
    sessionId: string;
    userEmail: string | null;
    mediaTitle: string | null;
    mediaType: string | null;
    pagePath: string | null;
    searchQuery: string | null;
    deviceType: string;
    metadata: Record<string, unknown>;
    createdAt: string;
  }>;
  monetizationConfig: MonetizationConfig;
}

function getSessionId(): string {
  try {
    let sid = sessionStorage.getItem('cinepulse_session_id');
    if (!sid) {
      sid = `cp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem('cinepulse_session_id', sid);
    }
    return sid;
  } catch {
    return `cp_${Date.now().toString(36)}`;
  }
}

function detectDeviceType(): 'mobile' | 'tablet' | 'desktop' {
  if (typeof window === 'undefined') return 'desktop';
  const w = window.innerWidth;
  if (w < 768) return 'mobile';
  if (w < 1024) return 'tablet';
  return 'desktop';
}

function getCurrentUserEmail(): string | null {
  try {
    return localStorage.getItem('cinepulse_user') || null;
  } catch {
    return null;
  }
}

function getAdminAuthHeaders(): Record<string, string> {
  try {
    const token = localStorage.getItem('cinepulse_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

/**
 * Fire-and-forget event tracker. Never throws or blocks user interactions.
 */
export function trackEvent(payload: AnalyticsEventPayload): void {
  try {
    const body = JSON.stringify({
      ...payload,
      sessionId: getSessionId(),
      userEmail: getCurrentUserEmail(),
      deviceType: detectDeviceType(),
    });

    fetch('/api/analytics/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // never block UX on analytics error
  }
}

export async function recordSubscriptionCheckout(params: {
  planId: 'monthly' | 'quarterly' | 'yearly';
  paymentMethod: 'momo' | 'card';
  userEmail?: string | null;
  amount: number;
  currency?: string;
}): Promise<void> {
  try {
    await fetch('/api/analytics/subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...params,
        userEmail: params.userEmail || getCurrentUserEmail() || 'guest@cenipluse.xyz',
        currency: params.currency || 'GHS',
      }),
    });
  } catch {
    // non-fatal
  }
}

export async function fetchPublicMonetizationConfig(): Promise<MonetizationConfig | null> {
  try {
    const res = await fetch('/api/analytics/monetization-config');
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchAdminAnalyticsDashboard(
  days = 14
): Promise<AdminAnalyticsDashboardData> {
  const res = await fetch(`/api/analytics/admin/dashboard?days=${days}`, {
    headers: {
      ...getAdminAuthHeaders(),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to load analytics (${res.status})`);
  }
  return res.json();
}

export async function saveAdminMonetizationConfig(
  patch: Partial<MonetizationConfig>
): Promise<MonetizationConfig> {
  const res = await fetch('/api/analytics/admin/monetization-config', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...getAdminAuthHeaders(),
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to save monetization settings');
  }
  const data = await res.json();
  return data.monetizationConfig;
}

export async function logAdminManualRevenue(payload: {
  source: 'ads' | 'subscription' | 'manual';
  planName: string;
  paymentMethod: string;
  amount: number;
  currency?: string;
  userEmail?: string;
  notes?: string;
}): Promise<void> {
  const res = await fetch('/api/analytics/admin/revenue', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAdminAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to log revenue entry');
  }
}
