const express = require('express');
const crypto = require('crypto');
const store = require('../db/store');
const supabaseClient = require('../db/supabaseClient');
const { requireAdminAuth, sanitizeString } = require('../middleware/security');

const router = express.Router();

const ALLOWED_EVENTS = new Set([
  'page_view',
  'title_view',
  'play_start',
  'watch_heartbeat',
  'download_video',
  'download_subtitle',
  'search',
  'watchlist_add',
  'review_post',
  'title_request',
  'signup',
  'ad_impression',
  'ad_click',
]);

const PLAN_PRICING_GHS = {
  monthly: { name: 'Monthly', amount: 25, days: 30, mrrFactor: 1 },
  quarterly: { name: 'Quarterly', amount: 65, days: 90, mrrFactor: 1 / 3 },
  yearly: { name: 'Yearly', amount: 210, days: 365, mrrFactor: 1 / 12 },
};

const DEFAULT_MONETIZATION_CONFIG = {
  accessMode: 'free', // 'free' | 'soft_paywall' | 'freemium' | 'strict_gate'
  adsEnabled: false,
  adFreeForPremium: true,
  bannerEnabled: true,
  adNetworkName: 'Sponsored',
  bannerTitle: 'Unlock Unlimited HD Movies, Series & Fast MP4 Downloads',
  bannerSubtitle: 'Subscribe with MTN MoMo, Telecel Cash, or Card from GHS 25/mo — 100% Ad-Free.',
  bannerCtaText: 'Subscribe Now',
  bannerLinkUrl: '',
  // Double-Ad Slot 2 (Media Detail / Player Banner)
  secondAdEnabled: false,
  secondAdNetworkName: 'Partner Offer',
  secondAdTitle: 'Watch Without Limits — Zero Ads, Instant HD Downloads',
  secondAdSubtitle: 'Upgrade to CeniPluse Premium for instant access to every movie, series & subtitle.',
  secondAdCtaText: 'Go Premium',
  secondAdLinkUrl: '',
  ecpmGhs: 18.0,
  paymentGateway: 'paystack',
  paystackPublicKey: '',
  monthlyPriceGhs: 25,
  quarterlyPriceGhs: 65,
  yearlyPriceGhs: 210,
};

// Local fallback ring buffers when Supabase is offline or unavailable
const localEventsFallback = [];
const localRevenueFallback = [];
const localSubscriptionsFallback = new Map();
const MAX_LOCAL_EVENTS = 2500;

function computeExpiryIso(planId) {
  const days = PLAN_PRICING_GHS[planId]?.days || 30;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function getMonetizationConfig() {
  const saved = store.data?.monetizationConfig || {};
  return { ...DEFAULT_MONETIZATION_CONFIG, ...saved };
}

function saveMonetizationConfig(patch) {
  const next = { ...getMonetizationConfig(), ...patch, updatedAt: new Date().toISOString() };
  store.data.monetizationConfig = next;
  store.markStateDirty('monetization_config');
  store.save();
  return next;
}

function normalizeDevice(raw, userAgent = '') {
  const val = String(raw || '').toLowerCase();
  if (val === 'mobile' || val === 'tablet' || val === 'desktop') return val;
  const ua = String(userAgent || '').toLowerCase();
  if (/ipad|tablet|playbook|silk/.test(ua)) return 'tablet';
  if (/mobi|android|iphone|ipod/.test(ua)) return 'mobile';
  return 'desktop';
}

// ============================================================================
// 1. PUBLIC EVENT INGESTION: POST /api/analytics/event
// ============================================================================
router.post('/event', async (req, res) => {
  const b = req.body || {};
  const eventType = sanitizeString(b.eventType || b.event_type || '', 40);
  if (!ALLOWED_EVENTS.has(eventType)) {
    return res.status(400).json({ error: 'Unsupported event type' });
  }

  const sessionId =
    sanitizeString(b.sessionId || b.session_id || '', 80) ||
    `anon_${crypto.randomBytes(6).toString('hex')}`;

  const row = {
    event_type: eventType,
    session_id: sessionId,
    user_email: sanitizeString(b.userEmail || b.user_email || '', 120) || null,
    media_id: sanitizeString(b.mediaId || b.media_id || '', 100) || null,
    media_title: sanitizeString(b.mediaTitle || b.media_title || '', 160) || null,
    media_type: sanitizeString(b.mediaType || b.media_type || '', 30) || null,
    media_poster: sanitizeString(b.mediaPoster || b.media_poster || '', 400) || null,
    page_path: sanitizeString(b.pagePath || b.page_path || '', 120) || null,
    search_query: sanitizeString(b.searchQuery || b.search_query || '', 120) || null,
    device_type: normalizeDevice(b.deviceType || b.device_type, req.headers['user-agent']),
    metadata:
      b.metadata && typeof b.metadata === 'object' && !Array.isArray(b.metadata)
        ? b.metadata
        : {},
  };

  // Always keep a local copy for instant local/offline reads
  localEventsFallback.unshift({ ...row, id: Date.now(), created_at: new Date().toISOString() });
  if (localEventsFallback.length > MAX_LOCAL_EVENTS) {
    localEventsFallback.length = MAX_LOCAL_EVENTS;
  }

  if (supabaseClient.isEnabled()) {
    supabaseClient.insertRows('analytics_events', row).catch((err) => {
      console.warn('[Analytics] Supabase event insert warning:', err.message);
    });
  }

  return res.status(202).json({ ok: true });
});

// ============================================================================
// 2. PUBLIC SUBSCRIPTION CHECKOUT RECORDING: POST /api/analytics/subscription
// ============================================================================
router.post('/subscription', async (req, res) => {
  const b = req.body || {};
  const planId = sanitizeString(b.planId || 'monthly', 30).toLowerCase();
  const planInfo = PLAN_PRICING_GHS[planId] || PLAN_PRICING_GHS.monthly;
  const paymentMethod = sanitizeString(b.paymentMethod || 'momo', 30).toLowerCase();
  const userEmail = sanitizeString(b.userEmail || '', 120) || 'guest@cenipluse.xyz';
  const amount = Number(b.amount) > 0 ? Number(b.amount) : planInfo.amount;
  const currency = sanitizeString(b.currency || 'GHS', 10).toUpperCase();
  const reference =
    sanitizeString(b.reference || '', 80) ||
    `CP-${planId.slice(0, 3).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

  const txRow = {
    source: 'subscription',
    plan_id: planId,
    plan_name: planInfo.name,
    payment_method: paymentMethod,
    currency,
    amount,
    status: 'completed',
    user_email: userEmail,
    reference,
    notes: sanitizeString(b.notes || `CeniPluse ${planInfo.name} Premium`, 200),
  };

  localRevenueFallback.unshift({ ...txRow, id: Date.now(), created_at: new Date().toISOString() });

  if (supabaseClient.isEnabled()) {
    try {
      await supabaseClient.insertRows('revenue_transactions', txRow);
    } catch (err) {
      console.warn('[Analytics] Supabase revenue insert warning:', err.message);
    }
  }

  return res.status(201).json({ ok: true, reference, amount, currency });
});

// ============================================================================
// 2B. PAYSTACK TRANSACTION VERIFICATION: POST /api/analytics/paystack/verify
// ============================================================================
router.post('/paystack/verify', async (req, res) => {
  const b = req.body || {};
  const reference = sanitizeString(b.reference || '', 120);
  const planId = sanitizeString(b.planId || 'monthly', 30).toLowerCase();
  const planInfo = PLAN_PRICING_GHS[planId] || PLAN_PRICING_GHS.monthly;
  const userEmail = sanitizeString(b.userEmail || '', 120).toLowerCase();

  if (!reference || !userEmail) {
    return res.status(400).json({ error: 'Payment reference and account email are required.' });
  }

  const secretKey = String(process.env.PAYSTACK_SECRET_KEY || '').trim();
  let verifiedAmountGhs = planInfo.amount;
  let paymentChannel = sanitizeString(b.paymentMethod || 'momo', 30);

  if (secretKey) {
    try {
      const psRes = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
        {
          headers: {
            Authorization: `Bearer ${secretKey}`,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(10000),
        }
      );
      const psData = await psRes.json();
      if (!psRes.ok || !psData?.status || psData?.data?.status !== 'success') {
        return res.status(402).json({
          error: psData?.message || 'Paystack could not confirm this payment yet.',
        });
      }
      const paidGhs = Number(psData.data.amount || 0) / 100;
      if (paidGhs < planInfo.amount * 0.95) {
        return res.status(402).json({ error: 'Paid amount does not match selected plan.' });
      }
      verifiedAmountGhs = paidGhs;
      paymentChannel = psData.data.channel === 'mobile_money' ? 'momo' : psData.data.channel || 'card';
    } catch (err) {
      return res.status(502).json({ error: `Paystack verification error: ${err.message}` });
    }
  } else if (!b.previewFallback) {
    return res.status(503).json({
      error: 'Paystack live keys are not configured yet on the server. Add PAYSTACK_SECRET_KEY in Vercel/Bot-Hosting env vars.',
    });
  }

  const expiresAt = computeExpiryIso(planId);
  const subRow = {
    user_email: userEmail,
    plan_id: planId,
    plan_name: planInfo.name,
    status: 'active',
    payment_provider: secretKey ? 'paystack' : 'paystack_preview',
    reference,
    amount: verifiedAmountGhs,
    currency: 'GHS',
    starts_at: new Date().toISOString(),
    expires_at: expiresAt,
  };

  localSubscriptionsFallback.set(userEmail, subRow);

  const txRow = {
    source: 'subscription',
    plan_id: planId,
    plan_name: planInfo.name,
    payment_method: paymentChannel,
    currency: 'GHS',
    amount: verifiedAmountGhs,
    status: 'completed',
    user_email: userEmail,
    reference,
    notes: `Paystack ${planInfo.name} Premium`,
  };
  localRevenueFallback.unshift({ ...txRow, id: Date.now(), created_at: new Date().toISOString() });

  if (supabaseClient.isEnabled()) {
    await Promise.allSettled([
      supabaseClient.insertRows('user_subscriptions', subRow),
      supabaseClient.insertRows('revenue_transactions', txRow),
    ]);
  }

  return res.json({
    ok: true,
    active: true,
    planId,
    planName: planInfo.name,
    expiresAt,
    reference,
  });
});

// ============================================================================
// 2C. SERVER-VERIFIED SUBSCRIPTION STATUS: GET /api/analytics/subscription-status
// ============================================================================
router.get('/subscription-status', async (req, res) => {
  const authHeader = String(req.headers.authorization || '');
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!bearer) {
    return res.json({ active: false, isAdmin: false });
  }

  const user = await supabaseClient.verifySupabaseUser(bearer);
  if (!user || !user.email) {
    return res.json({ active: false, isAdmin: false });
  }

  // Admins always have full unrestricted access
  if (supabaseClient.isSupabaseAdminUser(user)) {
    return res.json({
      active: true,
      isAdmin: true,
      planId: 'yearly',
      planName: 'Admin Unlimited',
      expiresAt: null,
    });
  }

  const email = user.email.toLowerCase();
  const nowIso = new Date().toISOString();

  if (supabaseClient.isEnabled()) {
    try {
      const rows = await supabaseClient.queryRows(
        'user_subscriptions',
        `select=*&user_email=eq.${encodeURIComponent(email)}&status=eq.active&expires_at=gt.${encodeURIComponent(nowIso)}&order=expires_at.desc&limit=1`
      );
      if (rows.length > 0) {
        return res.json({
          active: true,
          isAdmin: false,
          planId: rows[0].plan_id,
          planName: rows[0].plan_name,
          expiresAt: rows[0].expires_at,
        });
      }
    } catch {
      // fall through to local cache
    }
  }

  const localSub = localSubscriptionsFallback.get(email);
  if (localSub && new Date(localSub.expires_at).getTime() > Date.now()) {
    return res.json({
      active: true,
      isAdmin: false,
      planId: localSub.plan_id,
      planName: localSub.plan_name,
      expiresAt: localSub.expires_at,
    });
  }

  return res.json({ active: false, isAdmin: false });
});

// ============================================================================
// 3. PUBLIC MONETIZATION CONFIG: GET /api/analytics/monetization-config
// ============================================================================
router.get('/monetization-config', (req, res) => {
  const cfg = getMonetizationConfig();
  const publicPaystackKey = String(
    cfg.paystackPublicKey || process.env.PAYSTACK_PUBLIC_KEY || ''
  ).trim();
  return res.json({
    accessMode: cfg.accessMode || 'free',
    adsEnabled: Boolean(cfg.adsEnabled),
    adFreeForPremium: cfg.adFreeForPremium !== false,
    bannerEnabled: cfg.bannerEnabled !== false,
    adNetworkName: cfg.adNetworkName || 'Sponsored',
    bannerTitle: cfg.bannerTitle || DEFAULT_MONETIZATION_CONFIG.bannerTitle,
    bannerSubtitle: cfg.bannerSubtitle || DEFAULT_MONETIZATION_CONFIG.bannerSubtitle,
    bannerCtaText: cfg.bannerCtaText || 'Subscribe Now',
    bannerLinkUrl: cfg.bannerLinkUrl || '',
    secondAdEnabled: cfg.secondAdEnabled === true,
    secondAdNetworkName: cfg.secondAdNetworkName || 'Partner Offer',
    secondAdTitle: cfg.secondAdTitle || DEFAULT_MONETIZATION_CONFIG.secondAdTitle,
    secondAdSubtitle: cfg.secondAdSubtitle || DEFAULT_MONETIZATION_CONFIG.secondAdSubtitle,
    secondAdCtaText: cfg.secondAdCtaText || 'Go Premium',
    secondAdLinkUrl: cfg.secondAdLinkUrl || '',
    paymentGateway: cfg.paymentGateway || 'paystack',
    paystackPublicKey: publicPaystackKey,
    hasPaystackKey: Boolean(publicPaystackKey),
    hasPaystackSecret: Boolean(process.env.PAYSTACK_SECRET_KEY),
  });
});

// ============================================================================
// 4. ADMIN ANALYTICS & REVENUE DASHBOARD: GET /api/analytics/admin/dashboard
// ============================================================================
router.get('/admin/dashboard', requireAdminAuth, async (req, res) => {
  const days = Math.min(90, Math.max(7, Number(req.query.days) || 14));
  const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const sinceIso = sinceDate.toISOString();

  let events = [];
  let transactions = [];

  if (supabaseClient.isEnabled()) {
    try {
      const [evRows, txRows] = await Promise.all([
        supabaseClient.queryRows(
          'analytics_events',
          `select=*&created_at=gte.${encodeURIComponent(sinceIso)}&order=created_at.desc&limit=5000`
        ),
        supabaseClient.queryRows(
          'revenue_transactions',
          `select=*&order=created_at.desc&limit=500`
        ),
      ]);
      events = evRows;
      transactions = txRows;
    } catch (err) {
      console.warn('[Analytics] Supabase query fallback:', err.message);
      events = localEventsFallback.filter((e) => new Date(e.created_at) >= sinceDate);
      transactions = localRevenueFallback;
    }
  } else {
    events = localEventsFallback.filter((e) => new Date(e.created_at) >= sinceDate);
    transactions = localRevenueFallback;
  }

  const monetizationConfig = getMonetizationConfig();
  const ecpmGhs = Number(monetizationConfig.ecpmGhs) || 18.0;

  // Prepare daily buckets for the requested date range
  const dailyMap = new Map();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    dailyMap.set(key, {
      date: key,
      label,
      pageViews: 0,
      uniqueSessions: new Set(),
      plays: 0,
      downloads: 0,
      searches: 0,
      adImpressions: 0,
      subscriptionRevenue: 0,
      adRevenue: 0,
      totalRevenue: 0,
    });
  }

  const hourlyDistribution = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, '0')}:00`,
    events: 0,
    plays: 0,
  }));

  const deviceCounts = { mobile: 0, desktop: 0, tablet: 0 };
  const uniqueSessionsAll = new Set();
  const activeNowSessions = new Set();
  const signedInUsers = new Set();
  const fifteenMinsAgo = Date.now() - 15 * 60 * 1000;
  const todayKey = new Date().toISOString().slice(0, 10);

  let totalPageViews = 0;
  let todayPageViews = 0;
  let totalTitleViews = 0;
  let totalPlays = 0;
  let totalWatchSeconds = 0;
  let totalVideoDownloads = 0;
  let totalSubtitleDownloads = 0;
  let totalSearches = 0;
  let totalWatchlistAdds = 0;
  let totalReviews = 0;
  let totalRequests = 0;
  let totalSignups = 0;
  let totalAdImpressions = 0;
  let totalAdClicks = 0;

  const mediaStatsMap = new Map();
  const searchStatsMap = new Map();
  const pageStatsMap = new Map();

  for (const ev of events) {
    const createdAt = ev.created_at ? new Date(ev.created_at) : new Date();
    const dayKey = createdAt.toISOString().slice(0, 10);
    const hour = createdAt.getHours();
    const bucket = dailyMap.get(dayKey);

    if (ev.session_id) {
      uniqueSessionsAll.add(ev.session_id);
      if (createdAt.getTime() >= fifteenMinsAgo) {
        activeNowSessions.add(ev.session_id);
      }
      if (bucket) bucket.uniqueSessions.add(ev.session_id);
    }
    if (ev.user_email) {
      signedInUsers.add(ev.user_email.toLowerCase());
    }

    const dev = ev.device_type === 'mobile' || ev.device_type === 'tablet' ? ev.device_type : 'desktop';
    if (ev.event_type === 'page_view' || ev.event_type === 'title_view' || ev.event_type === 'play_start') {
      deviceCounts[dev] += 1;
    }

    if (hourlyDistribution[hour]) {
      hourlyDistribution[hour].events += 1;
      if (ev.event_type === 'play_start' || ev.event_type === 'watch_heartbeat') {
        hourlyDistribution[hour].plays += 1;
      }
    }

    const ensureMedia = () => {
      if (!ev.media_id && !ev.media_title) return null;
      const key = ev.media_id || ev.media_title;
      if (!mediaStatsMap.has(key)) {
        mediaStatsMap.set(key, {
          mediaId: ev.media_id || key,
          title: ev.media_title || 'Unknown Title',
          type: ev.media_type || 'movie',
          poster: ev.media_poster || '',
          views: 0,
          plays: 0,
          watchSeconds: 0,
          videoDownloads: 0,
          subtitleDownloads: 0,
          lastActivityAt: ev.created_at,
        });
      }
      const entry = mediaStatsMap.get(key);
      if (!entry.poster && ev.media_poster) entry.poster = ev.media_poster;
      if (ev.media_title && entry.title === 'Unknown Title') entry.title = ev.media_title;
      return entry;
    };

    switch (ev.event_type) {
      case 'page_view': {
        totalPageViews++;
        if (dayKey === todayKey) todayPageViews++;
        if (bucket) bucket.pageViews++;
        const p = ev.page_path || 'home';
        pageStatsMap.set(p, (pageStatsMap.get(p) || 0) + 1);
        break;
      }
      case 'title_view': {
        totalTitleViews++;
        totalPageViews++;
        if (dayKey === todayKey) todayPageViews++;
        if (bucket) bucket.pageViews++;
        const m = ensureMedia();
        if (m) m.views++;
        break;
      }
      case 'play_start': {
        totalPlays++;
        if (bucket) bucket.plays++;
        const m = ensureMedia();
        if (m) {
          m.plays++;
          m.watchSeconds += 30;
        }
        totalWatchSeconds += 30;
        break;
      }
      case 'watch_heartbeat': {
        const secs = Math.min(120, Math.max(10, Number(ev.metadata?.watchSeconds) || 30));
        totalWatchSeconds += secs;
        const m = ensureMedia();
        if (m) m.watchSeconds += secs;
        break;
      }
      case 'download_video': {
        totalVideoDownloads++;
        if (bucket) bucket.downloads++;
        const m = ensureMedia();
        if (m) m.videoDownloads++;
        break;
      }
      case 'download_subtitle': {
        totalSubtitleDownloads++;
        const m = ensureMedia();
        if (m) m.subtitleDownloads++;
        break;
      }
      case 'search': {
        totalSearches++;
        if (bucket) bucket.searches++;
        const q = String(ev.search_query || '').trim().toLowerCase();
        if (q.length >= 2) {
          searchStatsMap.set(q, (searchStatsMap.get(q) || 0) + 1);
        }
        break;
      }
      case 'watchlist_add':
        totalWatchlistAdds++;
        break;
      case 'review_post':
        totalReviews++;
        break;
      case 'title_request':
        totalRequests++;
        break;
      case 'signup':
        totalSignups++;
        break;
      case 'ad_impression':
        totalAdImpressions++;
        if (bucket) bucket.adImpressions++;
        break;
      case 'ad_click':
        totalAdClicks++;
        break;
      default:
        break;
    }
  }

  // Revenue aggregation
  let totalSubscriptionRevenue = 0;
  let totalLoggedAdRevenue = 0;
  let rangeSubscriptionRevenue = 0;
  let mrrGhs = 0;
  const activeSubscriberEmails = new Set();
  const revenueByPlanMap = new Map();
  const revenueByMethodMap = new Map();

  for (const tx of transactions) {
    if (tx.status && tx.status !== 'completed') continue;
    const amt = Number(tx.amount) || 0;
    const txDate = tx.created_at ? new Date(tx.created_at) : new Date();
    const dayKey = txDate.toISOString().slice(0, 10);
    const bucket = dailyMap.get(dayKey);

    if (tx.source === 'ads') {
      totalLoggedAdRevenue += amt;
      if (bucket) bucket.adRevenue += amt;
    } else {
      totalSubscriptionRevenue += amt;
      if (txDate >= sinceDate) rangeSubscriptionRevenue += amt;
      if (bucket) bucket.subscriptionRevenue += amt;

      const planKey = tx.plan_name || tx.plan_id || 'Other';
      revenueByPlanMap.set(planKey, (revenueByPlanMap.get(planKey) || 0) + amt);

      if (tx.user_email) activeSubscriberEmails.add(tx.user_email.toLowerCase());
      const planMeta = PLAN_PRICING_GHS[String(tx.plan_id || '').toLowerCase()];
      if (planMeta) {
        mrrGhs += amt * planMeta.mrrFactor;
      }
    }

    const methodKey =
      tx.payment_method === 'momo'
        ? 'Mobile Money'
        : tx.payment_method === 'card'
        ? 'Card (Visa/MC)'
        : tx.source === 'ads'
        ? 'Ad Network'
        : tx.payment_method || 'Other';
    revenueByMethodMap.set(methodKey, (revenueByMethodMap.get(methodKey) || 0) + amt);
  }

  const estimatedAdRevenue = Number(((totalAdImpressions / 1000) * ecpmGhs).toFixed(2));
  const combinedAdRevenue = Number((totalLoggedAdRevenue + estimatedAdRevenue).toFixed(2));
  const totalRevenueGhs = Number((totalSubscriptionRevenue + combinedAdRevenue).toFixed(2));

  const dailySeries = Array.from(dailyMap.values()).map((b) => {
    const estDayAdRev = Number(((b.adImpressions / 1000) * ecpmGhs).toFixed(2));
    const dayAdTotal = Number((b.adRevenue + estDayAdRev).toFixed(2));
    return {
      date: b.date,
      label: b.label,
      pageViews: b.pageViews,
      uniqueVisitors: b.uniqueSessions.size,
      plays: b.plays,
      downloads: b.downloads,
      searches: b.searches,
      adImpressions: b.adImpressions,
      subscriptionRevenue: Number(b.subscriptionRevenue.toFixed(2)),
      adRevenue: dayAdTotal,
      totalRevenue: Number((b.subscriptionRevenue + dayAdTotal).toFixed(2)),
    };
  });

  const allMedia = Array.from(mediaStatsMap.values());
  const topWatched = [...allMedia]
    .filter((m) => m.plays > 0 || m.views > 0)
    .sort((a, b) => b.plays - a.plays || b.watchSeconds - a.watchSeconds || b.views - a.views)
    .slice(0, 10)
    .map((m) => ({
      ...m,
      watchMinutes: Math.max(1, Math.round(m.watchSeconds / 60)),
    }));

  const topDownloaded = [...allMedia]
    .filter((m) => m.videoDownloads > 0 || m.subtitleDownloads > 0)
    .sort((a, b) => b.videoDownloads - a.videoDownloads || b.subtitleDownloads - a.subtitleDownloads)
    .slice(0, 8);

  const topSearches = Array.from(searchStatsMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([query, count]) => ({ query, count }));

  const topPages = Array.from(pageStatsMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([page, views]) => ({ page, views }));

  const totalDeviceSamples = deviceCounts.mobile + deviceCounts.desktop + deviceCounts.tablet;
  const deviceBreakdown = [
    {
      device: 'Mobile',
      count: deviceCounts.mobile,
      percent: totalDeviceSamples ? Math.round((deviceCounts.mobile / totalDeviceSamples) * 100) : 0,
    },
    {
      device: 'Desktop',
      count: deviceCounts.desktop,
      percent: totalDeviceSamples ? Math.round((deviceCounts.desktop / totalDeviceSamples) * 100) : 0,
    },
    {
      device: 'Tablet',
      count: deviceCounts.tablet,
      percent: totalDeviceSamples ? Math.round((deviceCounts.tablet / totalDeviceSamples) * 100) : 0,
    },
  ];

  const recentActivity = events.slice(0, 30).map((ev) => ({
    id: ev.id,
    eventType: ev.event_type,
    sessionId: ev.session_id ? String(ev.session_id).slice(0, 10) : 'anon',
    userEmail: ev.user_email || null,
    mediaTitle: ev.media_title || null,
    mediaType: ev.media_type || null,
    pagePath: ev.page_path || null,
    searchQuery: ev.search_query || null,
    deviceType: ev.device_type || 'desktop',
    metadata: ev.metadata || {},
    createdAt: ev.created_at,
  }));

  const recentTransactions = transactions.slice(0, 20).map((tx) => ({
    id: tx.id,
    source: tx.source,
    planName: tx.plan_name || tx.plan_id || 'Ad Payout',
    paymentMethod: tx.payment_method || 'momo',
    currency: tx.currency || 'GHS',
    amount: Number(tx.amount) || 0,
    status: tx.status || 'completed',
    userEmail: tx.user_email || '—',
    reference: tx.reference || '',
    notes: tx.notes || '',
    createdAt: tx.created_at,
  }));

  return res.json({
    rangeDays: days,
    generatedAt: new Date().toISOString(),
    kpis: {
      activeNow: activeNowSessions.size,
      totalPageViews,
      todayPageViews,
      uniqueVisitors: uniqueSessionsAll.size,
      signedInUsers: signedInUsers.size,
      totalTitleViews,
      totalPlays,
      totalWatchMinutes: Math.round(totalWatchSeconds / 60),
      totalVideoDownloads,
      totalSubtitleDownloads,
      totalSearches,
      totalWatchlistAdds,
      totalReviews,
      totalRequests,
      totalSignups,
      totalAdImpressions,
      totalAdClicks,
      adCtrPercent:
        totalAdImpressions > 0 ? Number(((totalAdClicks / totalAdImpressions) * 100).toFixed(2)) : 0,
      totalRevenueGhs,
      subscriptionRevenueGhs: Number(totalSubscriptionRevenue.toFixed(2)),
      rangeSubscriptionRevenueGhs: Number(rangeSubscriptionRevenue.toFixed(2)),
      adRevenueGhs: combinedAdRevenue,
      mrrGhs: Number(mrrGhs.toFixed(2)),
      activeSubscribers: activeSubscriberEmails.size,
      conversionRatePercent:
        uniqueSessionsAll.size > 0
          ? Number(((activeSubscriberEmails.size / uniqueSessionsAll.size) * 100).toFixed(2))
          : 0,
    },
    dailySeries,
    hourlyDistribution,
    deviceBreakdown,
    topWatched,
    topDownloaded,
    topSearches,
    topPages,
    revenueByPlan: Array.from(revenueByPlanMap.entries()).map(([plan, amount]) => ({
      plan,
      amount: Number(amount.toFixed(2)),
    })),
    revenueByMethod: Array.from(revenueByMethodMap.entries()).map(([method, amount]) => ({
      method,
      amount: Number(amount.toFixed(2)),
    })),
    recentTransactions,
    recentActivity,
    monetizationConfig,
  });
});

// ============================================================================
// 5. ADMIN MONETIZATION SETTINGS: PUT /api/analytics/admin/monetization-config
// ============================================================================
router.put('/admin/monetization-config', requireAdminAuth, (req, res) => {
  const b = req.body || {};
  const patch = {};
  if (['free', 'soft_paywall', 'freemium', 'strict_gate'].includes(b.accessMode)) {
    patch.accessMode = b.accessMode;
  }
  if (typeof b.adsEnabled === 'boolean') patch.adsEnabled = b.adsEnabled;
  if (typeof b.adFreeForPremium === 'boolean') patch.adFreeForPremium = b.adFreeForPremium;
  if (typeof b.bannerEnabled === 'boolean') patch.bannerEnabled = b.bannerEnabled;
  if (typeof b.adNetworkName === 'string') patch.adNetworkName = sanitizeString(b.adNetworkName, 60);
  if (typeof b.bannerTitle === 'string') patch.bannerTitle = sanitizeString(b.bannerTitle, 120);
  if (typeof b.bannerSubtitle === 'string') patch.bannerSubtitle = sanitizeString(b.bannerSubtitle, 200);
  if (typeof b.bannerCtaText === 'string') patch.bannerCtaText = sanitizeString(b.bannerCtaText, 40);
  if (typeof b.bannerLinkUrl === 'string') patch.bannerLinkUrl = sanitizeString(b.bannerLinkUrl, 300);
  if (typeof b.secondAdEnabled === 'boolean') patch.secondAdEnabled = b.secondAdEnabled;
  if (typeof b.secondAdNetworkName === 'string') {
    patch.secondAdNetworkName = sanitizeString(b.secondAdNetworkName, 60);
  }
  if (typeof b.secondAdTitle === 'string') patch.secondAdTitle = sanitizeString(b.secondAdTitle, 120);
  if (typeof b.secondAdSubtitle === 'string') {
    patch.secondAdSubtitle = sanitizeString(b.secondAdSubtitle, 200);
  }
  if (typeof b.secondAdCtaText === 'string') {
    patch.secondAdCtaText = sanitizeString(b.secondAdCtaText, 40);
  }
  if (typeof b.secondAdLinkUrl === 'string') {
    patch.secondAdLinkUrl = sanitizeString(b.secondAdLinkUrl, 300);
  }
  if (b.ecpmGhs !== undefined && !Number.isNaN(Number(b.ecpmGhs))) {
    patch.ecpmGhs = Math.max(0, Number(b.ecpmGhs));
  }
  if (typeof b.paymentGateway === 'string') {
    patch.paymentGateway = sanitizeString(b.paymentGateway, 40);
  }
  if (typeof b.paystackPublicKey === 'string') {
    patch.paystackPublicKey = sanitizeString(b.paystackPublicKey, 120);
  }

  const updated = saveMonetizationConfig(patch);
  return res.json({ ok: true, monetizationConfig: updated });
});

// ============================================================================
// 5B. ADMIN GRANT SUBSCRIPTION TO ANY EMAIL: POST /api/analytics/admin/grant-subscription
// ============================================================================
router.post('/admin/grant-subscription', requireAdminAuth, async (req, res) => {
  const b = req.body || {};
  const userEmail = sanitizeString(b.userEmail || '', 120).toLowerCase();
  const planId = sanitizeString(b.planId || 'monthly', 30).toLowerCase();
  const planInfo = PLAN_PRICING_GHS[planId] || PLAN_PRICING_GHS.monthly;
  if (!userEmail || !userEmail.includes('@')) {
    return res.status(400).json({ error: 'Valid user email is required.' });
  }

  const reference = `ADMIN-${Date.now().toString(36).toUpperCase()}`;
  const expiresAt = computeExpiryIso(planId);
  const subRow = {
    user_email: userEmail,
    plan_id: planId,
    plan_name: planInfo.name,
    status: 'active',
    payment_provider: 'admin_grant',
    reference,
    amount: Number(b.amount) >= 0 ? Number(b.amount) : planInfo.amount,
    currency: 'GHS',
    starts_at: new Date().toISOString(),
    expires_at: expiresAt,
  };
  localSubscriptionsFallback.set(userEmail, subRow);

  if (supabaseClient.isEnabled()) {
    await supabaseClient.insertRows('user_subscriptions', subRow).catch(() => {});
  }

  return res.status(201).json({ ok: true, subscription: subRow });
});

// ============================================================================
// 6. ADMIN LOG MANUAL / AD NETWORK REVENUE: POST /api/analytics/admin/revenue
// ============================================================================
router.post('/admin/revenue', requireAdminAuth, async (req, res) => {
  const b = req.body || {};
  const amount = Number(b.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Valid positive amount is required' });
  }

  const source = ['subscription', 'ads', 'manual'].includes(b.source) ? b.source : 'ads';
  const txRow = {
    source,
    plan_id: sanitizeString(b.planId || (source === 'ads' ? 'ad_payout' : 'manual'), 40),
    plan_name: sanitizeString(b.planName || (source === 'ads' ? 'Ad Network Payout' : 'Manual Entry'), 80),
    payment_method: sanitizeString(b.paymentMethod || (source === 'ads' ? 'ad_network' : 'momo'), 40),
    currency: sanitizeString(b.currency || 'GHS', 10).toUpperCase(),
    amount,
    status: 'completed',
    user_email: sanitizeString(b.userEmail || req.adminUser?.email || 'admin', 120),
    reference:
      sanitizeString(b.reference || '', 80) ||
      `REV-${Date.now().toString(36).toUpperCase()}`,
    notes: sanitizeString(b.notes || '', 200),
  };

  localRevenueFallback.unshift({ ...txRow, id: Date.now(), created_at: new Date().toISOString() });

  if (supabaseClient.isEnabled()) {
    try {
      await supabaseClient.insertRows('revenue_transactions', txRow);
    } catch (err) {
      console.warn('[Analytics] Supabase manual revenue insert error:', err.message);
    }
  }

  return res.status(201).json({ ok: true, transaction: txRow });
});

module.exports = router;
