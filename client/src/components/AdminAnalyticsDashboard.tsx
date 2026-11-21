import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  Crown,
  DollarSign,
  Download,
  Eye,
  Film,
  Loader2,
  Megaphone,
  Monitor,
  Play,
  PlusCircle,
  RefreshCw,
  Save,
  Search,
  Smartphone,
  Sparkles,
  Tablet,
  TrendingUp,
  Tv,
  Users,
  Clock,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import {
  fetchAdminAnalyticsDashboard,
  grantAdminSubscription,
  logAdminManualRevenue,
  saveAdminMonetizationConfig,
  type AccessMode,
  type AdminAnalyticsDashboardData,
  type MonetizationConfig,
} from '../services/analytics';

interface AdminAnalyticsDashboardProps {
  onNotify?: (msg: string) => void;
}

type SubView = 'overview' | 'content' | 'revenue' | 'live';

function formatRelativeTime(iso: string): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

function formatGhs(amount: number): string {
  return `GHS ${Number(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatWatchTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ============================================================================
// Interactive SVG Multi-Series Area & Line Chart (Traffic & Engagement)
// ============================================================================
const TrafficAreaChart: React.FC<{
  series: AdminAnalyticsDashboardData['dailySeries'];
}> = ({ series }) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [visible, setVisible] = useState({
    pageViews: true,
    plays: true,
    downloads: true,
    uniqueVisitors: false,
  });

  const width = 760;
  const height = 240;
  const padL = 42;
  const padR = 16;
  const padT = 18;
  const padB = 34;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const maxVal = useMemo(() => {
    let m = 4;
    for (const d of series) {
      if (visible.pageViews) m = Math.max(m, d.pageViews);
      if (visible.plays) m = Math.max(m, d.plays);
      if (visible.downloads) m = Math.max(m, d.downloads);
      if (visible.uniqueVisitors) m = Math.max(m, d.uniqueVisitors);
    }
    return Math.ceil(m * 1.15);
  }, [series, visible]);

  const getX = (i: number) =>
    series.length <= 1 ? padL : padL + (i / (series.length - 1)) * plotW;
  const getY = (val: number) => padT + plotH - (val / maxVal) * plotH;

  const buildPath = (key: 'pageViews' | 'plays' | 'downloads' | 'uniqueVisitors') =>
    series.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(d[key]).toFixed(1)}`).join(' ');

  const buildArea = (key: 'pageViews' | 'plays' | 'downloads' | 'uniqueVisitors') => {
    if (!series.length) return '';
    const line = buildPath(key);
    const lastX = getX(series.length - 1).toFixed(1);
    const firstX = getX(0).toFixed(1);
    const baseY = (padT + plotH).toFixed(1);
    return `${line} L ${lastX} ${baseY} L ${firstX} ${baseY} Z`;
  };

  const hovered = hoverIdx !== null ? series[hoverIdx] : null;
  const labelStep = series.length > 16 ? 4 : series.length > 10 ? 2 : 1;

  return (
    <div className="rounded-2xl bg-[#141821] border border-white/[0.08] p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-extrabold text-[#F8FAFC] flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#00E5FF]" />
            Traffic &amp; Engagement Trend
          </h3>
          <p className="text-[11px] text-[#94A3B8]">
            Hover over any day to inspect exact views, stream plays, and downloads
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { key: 'pageViews' as const, label: 'Page Views', color: '#00E5FF' },
            { key: 'plays' as const, label: 'Plays', color: '#10B981' },
            { key: 'downloads' as const, label: 'Downloads', color: '#FFB800' },
            { key: 'uniqueVisitors' as const, label: 'Visitors', color: '#A855F7' },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setVisible((v) => ({ ...v, [item.key]: !v[item.key] }))}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold border inline-flex items-center gap-1.5 transition-all ${
                visible[item.key]
                  ? 'bg-white/[0.08] border-white/20 text-[#F8FAFC]'
                  : 'bg-transparent border-white/[0.06] text-[#64748B]'
              }`}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: visible[item.key] ? item.color : '#475569' }}
              />
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Live Hover Readout Strip */}
      <div className="min-h-[28px] px-3 py-1.5 rounded-lg bg-[#0B0D12] border border-white/[0.06] flex flex-wrap items-center justify-between gap-2 text-[11px] tabular-nums">
        {hovered ? (
          <>
            <span className="font-extrabold text-[#F8FAFC]">{hovered.label} ({hovered.date})</span>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[#00E5FF] font-bold">Views: {hovered.pageViews}</span>
              <span className="text-[#A855F7] font-bold">Visitors: {hovered.uniqueVisitors}</span>
              <span className="text-[#10B981] font-bold">Plays: {hovered.plays}</span>
              <span className="text-[#FFB800] font-bold">Downloads: {hovered.downloads}</span>
            </div>
          </>
        ) : (
          <span className="text-[#64748B]">
            Move cursor or tap any point on the chart to see daily breakdown
          </span>
        )}
      </div>

      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[460px] h-auto select-none">
          <defs>
            <linearGradient id="cpViewsGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00E5FF" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#00E5FF" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="cpPlaysGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10B981" stopOpacity="0.24" />
              <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Horizontal Y gridlines */}
          {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
            const y = padT + plotH * (1 - frac);
            const val = Math.round(maxVal * frac);
            return (
              <g key={frac}>
                <line
                  x1={padL}
                  y1={y}
                  x2={width - padR}
                  y2={y}
                  stroke="rgba(255,255,255,0.06)"
                  strokeDasharray="3 3"
                />
                <text
                  x={padL - 8}
                  y={y + 4}
                  textAnchor="end"
                  fill="#64748B"
                  fontSize="10"
                  fontWeight="600"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* Area Fills */}
          {visible.pageViews && <path d={buildArea('pageViews')} fill="url(#cpViewsGrad)" />}
          {visible.plays && <path d={buildArea('plays')} fill="url(#cpPlaysGrad)" />}

          {/* Lines */}
          {visible.pageViews && (
            <path d={buildPath('pageViews')} fill="none" stroke="#00E5FF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          )}
          {visible.uniqueVisitors && (
            <path d={buildPath('uniqueVisitors')} fill="none" stroke="#A855F7" strokeWidth="2" strokeDasharray="4 3" strokeLinecap="round" />
          )}
          {visible.plays && (
            <path d={buildPath('plays')} fill="none" stroke="#10B981" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          )}
          {visible.downloads && (
            <path d={buildPath('downloads')} fill="none" stroke="#FFB800" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          )}

          {/* Hover Vertical Guideline */}
          {hoverIdx !== null && (
            <line
              x1={getX(hoverIdx)}
              y1={padT}
              x2={getX(hoverIdx)}
              y2={padT + plotH}
              stroke="rgba(255,255,255,0.22)"
              strokeWidth="1"
            />
          )}

          {/* Interactive Hit Zones + Dots + X Labels */}
          {series.map((d, i) => {
            const cx = getX(i);
            const isHov = hoverIdx === i;
            const colW = series.length > 1 ? plotW / (series.length - 1) : plotW;
            return (
              <g key={d.date}>
                {visible.pageViews && (
                  <circle
                    cx={cx}
                    cy={getY(d.pageViews)}
                    r={isHov ? 5 : 2.8}
                    fill="#00E5FF"
                    stroke="#0B0D12"
                    strokeWidth="1.5"
                  />
                )}
                {visible.plays && (
                  <circle
                    cx={cx}
                    cy={getY(d.plays)}
                    r={isHov ? 5 : 2.8}
                    fill="#10B981"
                    stroke="#0B0D12"
                    strokeWidth="1.5"
                  />
                )}
                {visible.downloads && (
                  <circle
                    cx={cx}
                    cy={getY(d.downloads)}
                    r={isHov ? 4.5 : 2.5}
                    fill="#FFB800"
                    stroke="#0B0D12"
                    strokeWidth="1.5"
                  />
                )}
                {(i % labelStep === 0 || i === series.length - 1) && (
                  <text
                    x={cx}
                    y={height - 10}
                    textAnchor="middle"
                    fill={isHov ? '#F8FAFC' : '#64748B'}
                    fontSize="10"
                    fontWeight={isHov ? '700' : '600'}
                  >
                    {d.label}
                  </text>
                )}
                <rect
                  x={cx - colW / 2}
                  y={padT}
                  width={colW}
                  height={plotH + padB}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setHoverIdx(i)}
                  onMouseLeave={() => setHoverIdx(null)}
                  onClick={() => setHoverIdx(i)}
                />
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

// ============================================================================
// Interactive SVG Revenue Stacked Bar Chart
// ============================================================================
const RevenueBarChart: React.FC<{
  series: AdminAnalyticsDashboardData['dailySeries'];
}> = ({ series }) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const width = 760;
  const height = 210;
  const padL = 48;
  const padR = 14;
  const padT = 16;
  const padB = 30;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const maxRev = Math.max(50, ...series.map((d) => d.totalRevenue)) * 1.15;
  const barGap = 6;
  const barW = Math.max(10, (plotW - barGap * (series.length - 1)) / Math.max(1, series.length));
  const hovered = hoverIdx !== null ? series[hoverIdx] : null;
  const labelStep = series.length > 16 ? 4 : series.length > 10 ? 2 : 1;

  return (
    <div className="rounded-2xl bg-[#141821] border border-white/[0.08] p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-extrabold text-[#F8FAFC] flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-[#10B981]" />
            Daily Revenue (Subscriptions + Ads)
          </h3>
          <p className="text-[11px] text-[#94A3B8]">
            Combined GHS earnings from Premium plans and Ad impressions/payouts
          </p>
        </div>

        <div className="flex items-center gap-3 text-[11px] font-bold">
          <span className="inline-flex items-center gap-1.5 text-[#10B981]">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#10B981]" />
            Subscriptions
          </span>
          <span className="inline-flex items-center gap-1.5 text-[#FFB800]">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#FFB800]" />
            Ads
          </span>
        </div>
      </div>

      <div className="min-h-[26px] px-3 py-1 rounded-lg bg-[#0B0D12] border border-white/[0.06] flex flex-wrap items-center justify-between gap-2 text-[11px] tabular-nums">
        {hovered ? (
          <>
            <span className="font-extrabold text-[#F8FAFC]">{hovered.label}</span>
            <div className="flex items-center gap-3">
              <span className="text-[#10B981] font-bold">Subs: {formatGhs(hovered.subscriptionRevenue)}</span>
              <span className="text-[#FFB800] font-bold">Ads: {formatGhs(hovered.adRevenue)}</span>
              <span className="text-[#F8FAFC] font-extrabold">Total: {formatGhs(hovered.totalRevenue)}</span>
            </div>
          </>
        ) : (
          <span className="text-[#64748B]">Hover over any bar to view daily revenue breakdown</span>
        )}
      </div>

      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[440px] h-auto select-none">
          {[0, 0.5, 1].map((frac) => {
            const y = padT + plotH * (1 - frac);
            return (
              <g key={frac}>
                <line x1={padL} y1={y} x2={width - padR} y2={y} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                <text x={padL - 8} y={y + 4} textAnchor="end" fill="#64748B" fontSize="10" fontWeight="600">
                  {Math.round(maxRev * frac)}
                </text>
              </g>
            );
          })}

          {series.map((d, i) => {
            const x = padL + i * (barW + barGap);
            const subH = (d.subscriptionRevenue / maxRev) * plotH;
            const adH = (d.adRevenue / maxRev) * plotH;
            const baseY = padT + plotH;
            const isHov = hoverIdx === i;

            return (
              <g
                key={d.date}
                className="cursor-pointer"
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}
                onClick={() => setHoverIdx(i)}
              >
                <rect
                  x={x}
                  y={padT}
                  width={barW}
                  height={plotH}
                  rx="4"
                  fill={isHov ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.015)'}
                />
                {subH > 0 && (
                  <rect
                    x={x}
                    y={baseY - subH}
                    width={barW}
                    height={Math.max(3, subH)}
                    rx="3"
                    fill="#10B981"
                    opacity={isHov ? 1 : 0.88}
                  />
                )}
                {adH > 0 && (
                  <rect
                    x={x}
                    y={baseY - subH - adH}
                    width={barW}
                    height={Math.max(3, adH)}
                    rx="3"
                    fill="#FFB800"
                    opacity={isHov ? 1 : 0.88}
                  />
                )}
                {(i % labelStep === 0 || i === series.length - 1) && (
                  <text
                    x={x + barW / 2}
                    y={height - 8}
                    textAnchor="middle"
                    fill={isHov ? '#F8FAFC' : '#64748B'}
                    fontSize="10"
                    fontWeight="600"
                  >
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

// ============================================================================
// Device Split Donut Chart (Mobile vs Desktop vs Tablet)
// ============================================================================
const DeviceDonutChart: React.FC<{
  devices: AdminAnalyticsDashboardData['deviceBreakdown'];
}> = ({ devices }) => {
  const colors: Record<string, string> = {
    Mobile: '#00E5FF',
    Desktop: '#10B981',
    Tablet: '#FFB800',
  };
  const total = devices.reduce((s, d) => s + d.count, 0);
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  let offsetAcc = 0;

  return (
    <div className="rounded-2xl bg-[#141821] border border-white/[0.08] p-4 sm:p-5 flex flex-col justify-between gap-4">
      <div>
        <h3 className="text-sm font-extrabold text-[#F8FAFC]">Audience by Device</h3>
        <p className="text-[11px] text-[#94A3B8]">Mobile vs Desktop traffic share</p>
      </div>

      <div className="flex items-center justify-center">
        <div className="relative w-36 h-36">
          <svg viewBox="0 0 150 150" className="w-full h-full -rotate-90">
            <circle
              cx="75"
              cy="75"
              r={radius}
              fill="none"
              stroke="rgba(255,255,255,0.07)"
              strokeWidth="16"
            />
            {total > 0 &&
              devices.map((d) => {
                if (d.count <= 0) return null;
                const segLen = (d.count / total) * circumference;
                const strokeDasharray = `${segLen} ${circumference - segLen}`;
                const strokeDashoffset = -offsetAcc;
                offsetAcc += segLen;
                return (
                  <circle
                    key={d.device}
                    cx="75"
                    cy="75"
                    r={radius}
                    fill="none"
                    stroke={colors[d.device] || '#00E5FF'}
                    strokeWidth="16"
                    strokeDasharray={strokeDasharray}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="butt"
                  />
                );
              })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-xl font-black text-[#F8FAFC] tabular-nums">{total}</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
              Sessions
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {devices.map((d) => {
          const Icon =
            d.device === 'Mobile' ? Smartphone : d.device === 'Tablet' ? Tablet : Monitor;
          return (
            <div key={d.device} className="flex items-center justify-between text-xs tabular-nums">
              <span className="inline-flex items-center gap-2 text-[#CBD5E1] font-semibold">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: colors[d.device] || '#00E5FF' }}
                />
                <Icon className="w-3.5 h-3.5 text-[#94A3B8]" />
                {d.device}
              </span>
              <span className="font-extrabold text-[#F8FAFC]">
                {d.percent}% <span className="text-[#64748B] font-normal">({d.count})</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ============================================================================
// 24-Hour Peak Viewing Activity Bar Chart
// ============================================================================
const PeakHoursChart: React.FC<{
  hours: AdminAnalyticsDashboardData['hourlyDistribution'];
}> = ({ hours }) => {
  const maxEv = Math.max(4, ...hours.map((h) => h.events));
  return (
    <div className="rounded-2xl bg-[#141821] border border-white/[0.08] p-4 sm:p-5 space-y-3">
      <div>
        <h3 className="text-sm font-extrabold text-[#F8FAFC] flex items-center gap-2">
          <Clock className="w-4 h-4 text-[#A855F7]" />
          Peak Activity Hours (24h)
        </h3>
        <p className="text-[11px] text-[#94A3B8]">
          When your audience is most active on cenipluse.xyz
        </p>
      </div>

      <div className="h-32 flex items-end gap-1 pt-2">
        {hours.map((h) => {
          const pct = Math.max(5, Math.round((h.events / maxEv) * 100));
          return (
            <div
              key={h.hour}
              title={`${h.label} — ${h.events} events (${h.plays} plays)`}
              className="flex-1 h-full flex flex-col items-center justify-end gap-1 group"
            >
              <div
                style={{ height: `${pct}%` }}
                className={`w-full rounded-t-sm transition-all ${
                  h.plays > 0
                    ? 'bg-gradient-to-t from-[#00E5FF]/60 to-[#00E5FF] group-hover:brightness-125'
                    : 'bg-white/15 group-hover:bg-[#A855F7]/70'
                }`}
              />
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-[10px] font-semibold text-[#64748B] tabular-nums">
        <span>00:00</span>
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>23:00</span>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN ADMIN ANALYTICS & MONETIZATION DASHBOARD
// ============================================================================
export const AdminAnalyticsDashboard: React.FC<AdminAnalyticsDashboardProps> = ({ onNotify }) => {
  const [rangeDays, setRangeDays] = useState<number>(14);
  const [subView, setSubView] = useState<SubView>('overview');
  const [data, setData] = useState<AdminAnalyticsDashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  // Monetization editor state
  const [monetCfg, setMonetCfg] = useState<MonetizationConfig | null>(null);
  const [savingMonet, setSavingMonet] = useState(false);

  // Manual / Ad Payout logger state
  const [revSource, setRevSource] = useState<'ads' | 'subscription' | 'manual'>('ads');
  const [revPlanName, setRevPlanName] = useState('Adsterra / Monetag Payout');
  const [revMethod, setRevMethod] = useState('ad_network');
  const [revAmount, setRevAmount] = useState('');
  const [revNotes, setRevNotes] = useState('');
  const [loggingRev, setLoggingRev] = useState(false);

  // Admin 1-click grant subscription state
  const [grantEmail, setGrantEmail] = useState('');
  const [grantPlanId, setGrantPlanId] = useState<'monthly' | 'quarterly' | 'yearly'>('monthly');
  const [grantingSub, setGrantingSub] = useState(false);

  const handleGrantSub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!grantEmail.trim() || grantingSub) return;
    setGrantingSub(true);
    try {
      await grantAdminSubscription({
        userEmail: grantEmail.trim(),
        planId: grantPlanId,
      });
      setGrantEmail('');
      onNotify?.(`Granted ${grantPlanId} Premium access to ${grantEmail.trim()}!`);
      await loadData(rangeDays);
    } catch (err) {
      onNotify?.((err as Error).message || 'Could not grant subscription');
    } finally {
      setGrantingSub(false);
    }
  };

  const loadData = async (days = rangeDays) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchAdminAnalyticsDashboard(days);
      setData(res);
      setMonetCfg(res.monetizationConfig);
    } catch (err) {
      setError((err as Error).message || 'Could not load analytics dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(rangeDays);
  }, [rangeDays]);

  const handleSaveMonetization = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!monetCfg) return;
    setSavingMonet(true);
    try {
      const updated = await saveAdminMonetizationConfig(monetCfg);
      setMonetCfg(updated);
      onNotify?.('Monetization & Ad settings saved live!');
      loadData(rangeDays);
    } catch (err) {
      onNotify?.((err as Error).message || 'Failed to save monetization settings');
    } finally {
      setSavingMonet(false);
    }
  };

  const handleLogRevenue = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(revAmount);
    if (!Number.isFinite(num) || num <= 0) return;
    setLoggingRev(true);
    try {
      await logAdminManualRevenue({
        source: revSource,
        planName: revPlanName.trim() || (revSource === 'ads' ? 'Ad Network Payout' : 'Manual Subscription'),
        paymentMethod: revMethod,
        amount: num,
        currency: 'GHS',
        notes: revNotes.trim(),
      });
      setRevAmount('');
      setRevNotes('');
      onNotify?.(`Logged ${formatGhs(num)} to revenue ledger!`);
      await loadData(rangeDays);
    } catch (err) {
      onNotify?.((err as Error).message || 'Failed to log revenue');
    } finally {
      setLoggingRev(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="rounded-2xl bg-[#141821] border border-white/[0.08] p-12 flex flex-col items-center justify-center gap-3 text-center">
        <Loader2 className="w-7 h-7 text-[#00E5FF] animate-spin" />
        <p className="text-sm font-bold text-[#F8FAFC]">Loading Analytics &amp; Revenue Telemetry...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-2xl bg-rose-500/10 border border-rose-500/30 p-6 text-center space-y-3">
        <AlertCircle className="w-7 h-7 text-rose-400 mx-auto" />
        <p className="text-sm font-bold text-rose-200">{error}</p>
        <button
          type="button"
          onClick={() => loadData(rangeDays)}
          className="px-4 py-2 rounded-lg bg-[#00E5FF] text-[#071018] text-xs font-extrabold"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;
  const { kpis } = data;

  return (
    <div className="space-y-5">
      {/* Top Toolbar: Sub-views + Date Range + Live Pulse + Refresh */}
      <div className="rounded-2xl bg-[#141821] border border-white/[0.08] p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'overview' as const, label: 'Overview & Charts', icon: BarChart3 },
            { id: 'content' as const, label: 'What Users Watch', icon: Film },
            { id: 'revenue' as const, label: 'Revenue & Ads', icon: DollarSign },
            { id: 'live' as const, label: 'Live Activity Feed', icon: Activity },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setSubView(id)}
              className={`min-h-[38px] px-3.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-all ${
                subView === id
                  ? 'bg-[#00E5FF] text-[#071018] shadow-sm'
                  : 'bg-[#0B0D12] text-[#CBD5E1] hover:text-white border border-white/[0.06]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Active Now Live Badge */}
          <span className="px-3 py-1.5 rounded-full bg-[#10B981]/15 border border-[#10B981]/40 text-xs font-extrabold text-[#10B981] inline-flex items-center gap-2 tabular-nums">
            <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
            {kpis.activeNow} Active Now
          </span>

          {/* Date Range Picker */}
          <div className="inline-flex rounded-xl bg-[#0B0D12] border border-white/[0.08] p-0.5">
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setRangeDays(d)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                  rangeDays === d ? 'bg-[#1E2430] text-[#00E5FF]' : 'text-[#94A3B8] hover:text-white'
                }`}
              >
                {d}D
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => loadData(rangeDays)}
            disabled={loading}
            className="min-h-[36px] px-3 rounded-xl bg-[#0B0D12] hover:bg-[#1E2430] border border-white/10 text-xs font-bold text-[#CBD5E1] inline-flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#00E5FF]' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Executive KPI Grid (8 Metric Cards) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: 'Total Page Views',
            value: kpis.totalPageViews.toLocaleString(),
            sub: `${kpis.todayPageViews} today • ${kpis.uniqueVisitors} unique visitors`,
            icon: Eye,
            accent: 'text-[#00E5FF]',
            bg: 'bg-[#00E5FF]/10',
          },
          {
            label: 'Streams & Watch Time',
            value: kpis.totalPlays.toLocaleString(),
            sub: `${formatWatchTime(kpis.totalWatchMinutes)} total watched`,
            icon: Play,
            accent: 'text-[#10B981]',
            bg: 'bg-[#10B981]/10',
          },
          {
            label: 'Total Downloads',
            value: (kpis.totalVideoDownloads + kpis.totalSubtitleDownloads).toLocaleString(),
            sub: `${kpis.totalVideoDownloads} MP4 • ${kpis.totalSubtitleDownloads} SRT subs`,
            icon: Download,
            accent: 'text-[#FFB800]',
            bg: 'bg-[#FFB800]/10',
          },
          {
            label: 'Total Revenue',
            value: formatGhs(kpis.totalRevenueGhs),
            sub: `MRR: ${formatGhs(kpis.mrrGhs)} • ${kpis.activeSubscribers} subscribers`,
            icon: DollarSign,
            accent: 'text-[#10B981]',
            bg: 'bg-[#10B981]/15',
          },
          {
            label: 'Subscription Revenue',
            value: formatGhs(kpis.subscriptionRevenueGhs),
            sub: `${kpis.conversionRatePercent}% visitor-to-paid`,
            icon: Crown,
            accent: 'text-[#FCE18E]',
            bg: 'bg-[#FCE18E]/15',
          },
          {
            label: 'Ad Impressions & Rev',
            value: formatGhs(kpis.adRevenueGhs),
            sub: `${kpis.totalAdImpressions.toLocaleString()} views • ${kpis.adCtrPercent}% CTR`,
            icon: Megaphone,
            accent: 'text-[#A855F7]',
            bg: 'bg-[#A855F7]/15',
          },
          {
            label: 'Searches & Demand',
            value: kpis.totalSearches.toLocaleString(),
            sub: `${kpis.totalRequests} requests • ${kpis.totalWatchlistAdds} saves`,
            icon: Search,
            accent: 'text-[#38BDF8]',
            bg: 'bg-[#38BDF8]/15',
          },
          {
            label: 'Registered & Active',
            value: kpis.signedInUsers.toLocaleString(),
            sub: `${kpis.totalSignups} sign-ups • ${kpis.totalReviews} reviews`,
            icon: Users,
            accent: 'text-[#F472B6]',
            bg: 'bg-[#F472B6]/15',
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-2xl bg-[#141821] border border-white/[0.08] p-4 flex flex-col justify-between gap-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
                {card.label}
              </span>
              <span className={`w-8 h-8 rounded-xl ${card.bg} ${card.accent} flex items-center justify-center shrink-0`}>
                <card.icon className="w-4 h-4" />
              </span>
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-black text-[#F8FAFC] tabular-nums leading-tight">
                {card.value}
              </div>
              <div className="text-[11px] text-[#94A3B8] mt-1 truncate">{card.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ==================================================================== */}
      {/* VIEW 1: OVERVIEW & CHARTS */}
      {/* ==================================================================== */}
      {subView === 'overview' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_290px] gap-4">
            <TrafficAreaChart series={data.dailySeries} />
            <DeviceDonutChart devices={data.deviceBreakdown} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4">
            <RevenueBarChart series={data.dailySeries} />
            <PeakHoursChart hours={data.hourlyDistribution} />
          </div>

          {/* Quick Preview: Top Watched + Top Searches */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl bg-[#141821] border border-white/[0.08] p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-[#F8FAFC] flex items-center gap-2">
                  <Play className="w-4 h-4 text-[#10B981]" />
                  Most Watched Right Now
                </h3>
                <button
                  type="button"
                  onClick={() => setSubView('content')}
                  className="text-xs font-bold text-[#00E5FF] hover:underline"
                >
                  Full Report &rarr;
                </button>
              </div>
              {data.topWatched.length === 0 ? (
                <p className="text-xs text-[#94A3B8] py-6 text-center">
                  Watch events will appear here automatically as visitors stream movies &amp; series.
                </p>
              ) : (
                <div className="space-y-2">
                  {data.topWatched.slice(0, 5).map((item, idx) => (
                    <div
                      key={item.mediaId}
                      className="flex items-center gap-3 p-2 rounded-xl bg-[#0B0D12] border border-white/[0.05]"
                    >
                      <span className="w-5 text-center text-xs font-black text-[#00E5FF] tabular-nums">
                        #{idx + 1}
                      </span>
                      {item.poster ? (
                        <img
                          src={item.poster}
                          alt={item.title}
                          className="w-9 h-12 rounded-md object-cover shrink-0 bg-[#141821]"
                        />
                      ) : (
                        <div className="w-9 h-12 rounded-md bg-[#1E2430] flex items-center justify-center shrink-0">
                          <Film className="w-4 h-4 text-[#64748B]" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-[#F8FAFC] truncate">{item.title}</div>
                        <div className="text-[11px] text-[#94A3B8] tabular-nums">
                          {item.plays} plays &bull; {formatWatchTime(item.watchMinutes)} watched &bull;{' '}
                          {item.views} views
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-[#10B981]/15 text-[#10B981] text-[10px] font-bold uppercase shrink-0">
                        {item.type}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-[#141821] border border-white/[0.08] p-4 sm:p-5 space-y-3">
              <h3 className="text-sm font-extrabold text-[#F8FAFC] flex items-center gap-2">
                <Search className="w-4 h-4 text-[#00E5FF]" />
                What Users Are Searching For
              </h3>
              {data.topSearches.length === 0 ? (
                <p className="text-xs text-[#94A3B8] py-6 text-center">
                  Search queries from your site visitors will populate here automatically.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {data.topSearches.map((s) => (
                    <span
                      key={s.query}
                      className="px-3 py-1.5 rounded-full bg-[#0B0D12] border border-white/10 text-xs font-semibold text-[#F8FAFC] inline-flex items-center gap-2"
                    >
                      <span>{s.query}</span>
                      <span className="px-1.5 py-0.5 rounded-full bg-[#00E5FF]/15 text-[#00E5FF] text-[10px] font-extrabold tabular-nums">
                        {s.count}
                      </span>
                    </span>
                  ))}
                </div>
              )}

              {/* Top Pages Mini-Bars */}
              {data.topPages.length > 0 && (
                <div className="pt-3 border-t border-white/[0.06] space-y-2">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
                    Top Sections Visited
                  </div>
                  {data.topPages.slice(0, 5).map((p) => {
                    const maxP = Math.max(1, data.topPages[0]?.views || 1);
                    const pct = Math.round((p.views / maxP) * 100);
                    return (
                      <div key={p.page} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="capitalize font-semibold text-[#CBD5E1]">{p.page}</span>
                          <span className="font-bold text-[#F8FAFC] tabular-nums">{p.views}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-[#0B0D12] overflow-hidden">
                          <div className="h-full rounded-full bg-[#00E5FF]" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* VIEW 2: CONTENT & ENGAGEMENT DEEP DIVE */}
      {/* ==================================================================== */}
      {subView === 'content' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-[#141821] border border-white/[0.08] p-4 sm:p-5 space-y-3">
            <h3 className="text-sm font-extrabold text-[#F8FAFC] flex items-center gap-2">
              <Tv className="w-4 h-4 text-[#10B981]" />
              Top Watched Movies &amp; Series (Top 10)
            </h3>
            {data.topWatched.length === 0 ? (
              <p className="text-xs text-[#94A3B8] py-8 text-center">No watch telemetry recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {data.topWatched.map((m, idx) => (
                  <div
                    key={m.mediaId}
                    className="p-2.5 rounded-xl bg-[#0B0D12] border border-white/[0.06] flex items-center gap-3"
                  >
                    <span className="w-6 text-center text-xs font-black text-[#00E5FF] tabular-nums">
                      #{idx + 1}
                    </span>
                    {m.poster ? (
                      <img src={m.poster} alt={m.title} className="w-10 h-14 rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="w-10 h-14 rounded-lg bg-[#1E2430] flex items-center justify-center shrink-0">
                        <Film className="w-4 h-4 text-[#64748B]" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-extrabold text-[#F8FAFC] truncate">{m.title}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[#94A3B8] tabular-nums">
                        <span className="text-[#10B981] font-bold">{m.plays} plays</span>
                        <span>&bull;</span>
                        <span>{formatWatchTime(m.watchMinutes)} watch time</span>
                        <span>&bull;</span>
                        <span>{m.views} page views</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-[#141821] border border-white/[0.08] p-4 sm:p-5 space-y-3">
            <h3 className="text-sm font-extrabold text-[#F8FAFC] flex items-center gap-2">
              <Download className="w-4 h-4 text-[#FFB800]" />
              Most Downloaded Titles
            </h3>
            {data.topDownloaded.length === 0 ? (
              <p className="text-xs text-[#94A3B8] py-8 text-center">
                Video (.MP4) and Subtitle (.SRT) downloads will be tracked here automatically.
              </p>
            ) : (
              <div className="space-y-2">
                {data.topDownloaded.map((m, idx) => (
                  <div
                    key={m.mediaId}
                    className="p-2.5 rounded-xl bg-[#0B0D12] border border-white/[0.06] flex items-center gap-3"
                  >
                    <span className="w-6 text-center text-xs font-black text-[#FFB800] tabular-nums">
                      #{idx + 1}
                    </span>
                    {m.poster ? (
                      <img src={m.poster} alt={m.title} className="w-10 h-14 rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="w-10 h-14 rounded-lg bg-[#1E2430] flex items-center justify-center shrink-0">
                        <Film className="w-4 h-4 text-[#64748B]" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-extrabold text-[#F8FAFC] truncate">{m.title}</div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-[#94A3B8] tabular-nums">
                        <span className="text-[#FFB800] font-bold">{m.videoDownloads} MP4 downloads</span>
                        <span>&bull;</span>
                        <span className="text-[#00E5FF]">{m.subtitleDownloads} SRT subs</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* VIEW 3: REVENUE, ADS & MONETIZATION CONTROL CENTER */}
      {/* ==================================================================== */}
      {subView === 'revenue' && (
        <div className="space-y-5">
          <RevenueBarChart series={data.dailySeries} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Ad & Monetization Settings Form */}
            {monetCfg && (
              <form
                onSubmit={handleSaveMonetization}
                className="rounded-2xl bg-[#141821] border border-white/[0.08] p-4 sm:p-5 space-y-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-extrabold text-[#F8FAFC] flex items-center gap-2">
                      <Megaphone className="w-4 h-4 text-[#FFB800]" />
                      Ad &amp; Subscription Monetization Controls
                    </h3>
                    <p className="text-[11px] text-[#94A3B8]">
                      Enable sponsored/ad banners for free users while keeping Premium 100% ad-free
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-[#94A3B8]">
                    Site Access &amp; Subscription Paywall Mode
                  </span>
                  <select
                    value={monetCfg.accessMode || 'free'}
                    onChange={(e) =>
                      setMonetCfg({ ...monetCfg, accessMode: e.target.value as AccessMode })
                    }
                    className="w-full min-h-[40px] px-3 rounded-xl bg-[#0B0D12] border border-[#00E5FF]/35 text-xs font-bold text-[#F8FAFC] outline-none"
                  >
                    <option value="free">
                      100% Free (No Paywall, No Ads) — Current
                    </option>
                    <option value="soft_paywall">
                      Soft Paywall + Ads (Browse Free, Subscribe to Watch &amp; Download)
                    </option>
                    <option value="freemium">
                      Freemium + Ads (Watch Free with Ads, Subscribe to Remove Ads)
                    </option>
                    <option value="strict_gate">
                      Strict Members-Only Gate (Must Subscribe Before Entering Site)
                    </option>
                  </select>
                </div>

                <label className="space-y-1 block">
                  <span className="text-[11px] font-bold text-[#94A3B8]">
                    Paystack Public Key (MTN MoMo + Telecel + Cards in GHS)
                  </span>
                  <input
                    type="text"
                    value={monetCfg.paystackPublicKey || ''}
                    onChange={(e) =>
                      setMonetCfg({ ...monetCfg, paystackPublicKey: e.target.value })
                    }
                    placeholder="pk_live_... or pk_test_..."
                    className="w-full min-h-[38px] px-3 rounded-lg bg-[#0B0D12] border border-white/10 text-xs font-mono text-[#F8FAFC] outline-none focus:border-[#00E5FF]"
                  />
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label className="p-3 rounded-xl bg-[#0B0D12] border border-white/[0.08] flex items-center justify-between gap-2 cursor-pointer">
                    <div>
                      <div className="text-xs font-bold text-[#F8FAFC]">Enable Double Ads</div>
                      <div className="text-[10.5px] text-[#94A3B8]">Show Slot 1 &amp; Slot 2 banners</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={monetCfg.adsEnabled}
                      onChange={(e) => setMonetCfg({ ...monetCfg, adsEnabled: e.target.checked })}
                      className="w-4 h-4 accent-[#00E5FF]"
                    />
                  </label>

                  <label className="p-3 rounded-xl bg-[#0B0D12] border border-white/[0.08] flex items-center justify-between gap-2 cursor-pointer">
                    <div>
                      <div className="text-xs font-bold text-[#F8FAFC]">Ad-Free for Premium</div>
                      <div className="text-[10.5px] text-[#94A3B8]">Hide all ads for subscribers</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={monetCfg.adFreeForPremium}
                      onChange={(e) =>
                        setMonetCfg({ ...monetCfg, adFreeForPremium: e.target.checked })
                      }
                      className="w-4 h-4 accent-[#10B981]"
                    />
                  </label>
                </div>

                {/* Double Ad Slot 2 Controls */}
                <div className="p-3 rounded-xl bg-[#0B0D12] border border-white/[0.06] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#00E5FF]">
                      Double Ad — Slot 2 (Movie / Series Detail Page)
                    </span>
                    <input
                      type="checkbox"
                      checked={monetCfg.secondAdEnabled !== false}
                      onChange={(e) =>
                        setMonetCfg({ ...monetCfg, secondAdEnabled: e.target.checked })
                      }
                      className="w-4 h-4 accent-[#00E5FF]"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={monetCfg.secondAdTitle || ''}
                      onChange={(e) => setMonetCfg({ ...monetCfg, secondAdTitle: e.target.value })}
                      placeholder="Slot 2 Headline"
                      className="min-h-[36px] px-3 rounded-lg bg-[#141821] border border-white/10 text-xs text-[#F8FAFC] outline-none"
                    />
                    <input
                      type="url"
                      value={monetCfg.secondAdLinkUrl || ''}
                      onChange={(e) =>
                        setMonetCfg({ ...monetCfg, secondAdLinkUrl: e.target.value })
                      }
                      placeholder="Slot 2 Ad / Sponsor URL (optional)"
                      className="min-h-[36px] px-3 rounded-lg bg-[#141821] border border-white/10 text-xs text-[#F8FAFC] outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="space-y-1 block">
                    <span className="text-[11px] font-bold text-[#94A3B8]">Ad Network / Sponsor Label</span>
                    <input
                      type="text"
                      value={monetCfg.adNetworkName || ''}
                      onChange={(e) => setMonetCfg({ ...monetCfg, adNetworkName: e.target.value })}
                      className="w-full min-h-[38px] px-3 rounded-lg bg-[#0B0D12] border border-white/10 text-xs text-[#F8FAFC] outline-none focus:border-[#00E5FF]"
                    />
                  </label>

                  <label className="space-y-1 block">
                    <span className="text-[11px] font-bold text-[#94A3B8]">Estimated eCPM (GHS per 1K views)</span>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={monetCfg.ecpmGhs ?? 18}
                      onChange={(e) => setMonetCfg({ ...monetCfg, ecpmGhs: Number(e.target.value) })}
                      className="w-full min-h-[38px] px-3 rounded-lg bg-[#0B0D12] border border-white/10 text-xs text-[#F8FAFC] outline-none focus:border-[#00E5FF]"
                    />
                  </label>
                </div>

                <label className="space-y-1 block">
                  <span className="text-[11px] font-bold text-[#94A3B8]">Banner Headline</span>
                  <input
                    type="text"
                    value={monetCfg.bannerTitle || ''}
                    onChange={(e) => setMonetCfg({ ...monetCfg, bannerTitle: e.target.value })}
                    className="w-full min-h-[38px] px-3 rounded-lg bg-[#0B0D12] border border-white/10 text-xs text-[#F8FAFC] outline-none focus:border-[#00E5FF]"
                  />
                </label>

                <label className="space-y-1 block">
                  <span className="text-[11px] font-bold text-[#94A3B8]">Banner Subtitle</span>
                  <input
                    type="text"
                    value={monetCfg.bannerSubtitle || ''}
                    onChange={(e) => setMonetCfg({ ...monetCfg, bannerSubtitle: e.target.value })}
                    className="w-full min-h-[38px] px-3 rounded-lg bg-[#0B0D12] border border-white/10 text-xs text-[#F8FAFC] outline-none focus:border-[#00E5FF]"
                  />
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="space-y-1 block">
                    <span className="text-[11px] font-bold text-[#94A3B8]">CTA Button Label</span>
                    <input
                      type="text"
                      value={monetCfg.bannerCtaText || ''}
                      onChange={(e) => setMonetCfg({ ...monetCfg, bannerCtaText: e.target.value })}
                      className="w-full min-h-[38px] px-3 rounded-lg bg-[#0B0D12] border border-white/10 text-xs text-[#F8FAFC] outline-none focus:border-[#00E5FF]"
                    />
                  </label>

                  <label className="space-y-1 block">
                    <span className="text-[11px] font-bold text-[#94A3B8]">Sponsor URL (leave empty to open Premium)</span>
                    <input
                      type="url"
                      value={monetCfg.bannerLinkUrl || ''}
                      onChange={(e) => setMonetCfg({ ...monetCfg, bannerLinkUrl: e.target.value })}
                      placeholder="https://sponsor-or-ad-link.com"
                      className="w-full min-h-[38px] px-3 rounded-lg bg-[#0B0D12] border border-white/10 text-xs text-[#F8FAFC] outline-none focus:border-[#00E5FF]"
                    />
                  </label>
                </div>

                {/* Live Ad Network Zones (Adsterra, Monetag, HilltopAds, Direct Sponsor) */}
                <div className="pt-3 border-t border-white/[0.08] space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold text-[#00E5FF] uppercase tracking-wider">
                      Live Ad Network Codes (Adsterra / Monetag / HilltopAds)
                    </span>
                    <span className="text-[10px] font-bold text-[#94A3B8]">
                      Hidden for Premium
                    </span>
                  </div>

                  <label className="block space-y-1">
                    <span className="text-[11px] font-bold text-[#94A3B8]">
                      Home Feed Banner Code (728x90 / Native Banner HTML or &lt;script&gt;)
                    </span>
                    <textarea
                      rows={3}
                      value={monetCfg.homeBannerCode || ''}
                      onChange={(e) => setMonetCfg({ ...monetCfg, homeBannerCode: e.target.value })}
                      placeholder="Paste Adsterra / Monetag Native or Display Banner snippet here..."
                      className="w-full p-2.5 rounded-lg bg-[#0B0D12] border border-white/10 text-[11px] font-mono text-[#CBD5E1] outline-none focus:border-[#00E5FF]"
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="text-[11px] font-bold text-[#94A3B8]">
                      Below-Player Banner Code (Shown under Video Player on Movie/Series pages)
                    </span>
                    <textarea
                      rows={3}
                      value={monetCfg.playerBannerCode || ''}
                      onChange={(e) => setMonetCfg({ ...monetCfg, playerBannerCode: e.target.value })}
                      placeholder="Paste Adsterra / Monetag Responsive Banner snippet here..."
                      className="w-full p-2.5 rounded-lg bg-[#0B0D12] border border-white/10 text-[11px] font-mono text-[#CBD5E1] outline-none focus:border-[#00E5FF]"
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="text-[11px] font-bold text-[#94A3B8]">
                      Download Modal Banner Code (320x50 / Native Banner inside Download dialog)
                    </span>
                    <textarea
                      rows={2}
                      value={monetCfg.downloadBannerCode || ''}
                      onChange={(e) => setMonetCfg({ ...monetCfg, downloadBannerCode: e.target.value })}
                      placeholder="Paste compact banner snippet for Download Options modal..."
                      className="w-full p-2.5 rounded-lg bg-[#0B0D12] border border-white/10 text-[11px] font-mono text-[#CBD5E1] outline-none focus:border-[#00E5FF]"
                    />
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <label className="block space-y-1">
                      <span className="text-[11px] font-bold text-[#94A3B8]">
                        Global Script URL (Social Bar / In-Page Push)
                      </span>
                      <input
                        type="url"
                        value={monetCfg.globalAdScriptUrl || ''}
                        onChange={(e) => setMonetCfg({ ...monetCfg, globalAdScriptUrl: e.target.value })}
                        placeholder="https://pl12345.effectivegatecpm.com/..."
                        className="w-full min-h-[38px] px-3 rounded-lg bg-[#0B0D12] border border-white/10 text-xs text-[#F8FAFC] outline-none focus:border-[#00E5FF]"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-[11px] font-bold text-[#94A3B8]">
                        Direct Link / Smartlink URL (Optional)
                      </span>
                      <input
                        type="url"
                        value={monetCfg.smartlinkUrl || ''}
                        onChange={(e) => setMonetCfg({ ...monetCfg, smartlinkUrl: e.target.value })}
                        placeholder="https://adsterra-smartlink-url..."
                        className="w-full min-h-[38px] px-3 rounded-lg bg-[#0B0D12] border border-white/10 text-xs text-[#F8FAFC] outline-none focus:border-[#00E5FF]"
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <label className="block space-y-1">
                      <span className="text-[11px] font-bold text-[#94A3B8]">
                        Direct Sponsor Image URL (Home Slot)
                      </span>
                      <input
                        type="url"
                        value={monetCfg.bannerImageUrl || ''}
                        onChange={(e) => setMonetCfg({ ...monetCfg, bannerImageUrl: e.target.value })}
                        placeholder="https://.../banner-728x90.jpg"
                        className="w-full min-h-[38px] px-3 rounded-lg bg-[#0B0D12] border border-white/10 text-xs text-[#F8FAFC] outline-none focus:border-[#00E5FF]"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-[11px] font-bold text-[#94A3B8]">
                        Direct Sponsor Image URL (Player Slot)
                      </span>
                      <input
                        type="url"
                        value={monetCfg.secondAdImageUrl || ''}
                        onChange={(e) => setMonetCfg({ ...monetCfg, secondAdImageUrl: e.target.value })}
                        placeholder="https://.../player-banner.jpg"
                        className="w-full min-h-[38px] px-3 rounded-lg bg-[#0B0D12] border border-white/10 text-xs text-[#F8FAFC] outline-none focus:border-[#00E5FF]"
                      />
                    </label>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={savingMonet}
                  className="w-full min-h-[42px] rounded-xl bg-[#00E5FF] hover:bg-[#33ECFF] disabled:opacity-60 text-[#071018] text-xs font-extrabold inline-flex items-center justify-center gap-2 transition-colors"
                >
                  {savingMonet ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {savingMonet ? 'Saving Settings...' : 'Save Monetization Settings'}
                </button>
              </form>
            )}

            {/* Right Column: Log Revenue Form + Monetization Blueprint */}
            <div className="space-y-4">
              <form
                onSubmit={handleLogRevenue}
                className="rounded-2xl bg-[#141821] border border-white/[0.08] p-4 sm:p-5 space-y-3"
              >
                <h3 className="text-sm font-extrabold text-[#F8FAFC] flex items-center gap-2">
                  <PlusCircle className="w-4 h-4 text-[#10B981]" />
                  Log Ad Payout or Manual Revenue
                </h3>
                <div className="grid grid-cols-2 gap-2.5">
                  <select
                    value={revSource}
                    onChange={(e) => setRevSource(e.target.value as 'ads' | 'subscription' | 'manual')}
                    className="min-h-[38px] px-3 rounded-lg bg-[#0B0D12] border border-white/10 text-xs text-[#F8FAFC]"
                  >
                    <option value="ads">Ad Network Payout</option>
                    <option value="subscription">Direct MoMo Subscription</option>
                    <option value="manual">Sponsor / Other</option>
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={revAmount}
                    onChange={(e) => setRevAmount(e.target.value)}
                    placeholder="Amount (GHS)"
                    className="min-h-[38px] px-3 rounded-lg bg-[#0B0D12] border border-white/10 text-xs text-[#F8FAFC] outline-none focus:border-[#10B981]"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    value={revPlanName}
                    onChange={(e) => setRevPlanName(e.target.value)}
                    placeholder="Label (e.g. Adsterra Payout)"
                    className="min-h-[38px] px-3 rounded-lg bg-[#0B0D12] border border-white/10 text-xs text-[#F8FAFC] outline-none"
                  />
                  <input
                    type="text"
                    value={revNotes}
                    onChange={(e) => setRevNotes(e.target.value)}
                    placeholder="Optional notes / ref"
                    className="min-h-[38px] px-3 rounded-lg bg-[#0B0D12] border border-white/10 text-xs text-[#F8FAFC] outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loggingRev || !revAmount}
                  className="w-full min-h-[40px] rounded-xl bg-[#10B981] hover:brightness-110 disabled:opacity-60 text-[#041811] text-xs font-extrabold inline-flex items-center justify-center gap-1.5"
                >
                  {loggingRev ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Record Revenue (GHS)
                </button>
              </form>

              {/* Admin 1-Click Grant Subscription */}
              <form
                onSubmit={handleGrantSub}
                className="rounded-2xl bg-[#141821] border border-[#FCE18E]/25 p-4 sm:p-5 space-y-3"
              >
                <h3 className="text-sm font-extrabold text-[#F8FAFC] flex items-center gap-2">
                  <Crown className="w-4 h-4 text-[#FCE18E]" />
                  Grant Premium Access (VIP / Manual MoMo)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_130px] gap-2.5">
                  <input
                    type="email"
                    required
                    value={grantEmail}
                    onChange={(e) => setGrantEmail(e.target.value)}
                    placeholder="User email (e.g. friend@gmail.com)"
                    className="min-h-[38px] px-3 rounded-lg bg-[#0B0D12] border border-white/10 text-xs text-[#F8FAFC] outline-none focus:border-[#FCE18E]"
                  />
                  <select
                    value={grantPlanId}
                    onChange={(e) =>
                      setGrantPlanId(e.target.value as 'monthly' | 'quarterly' | 'yearly')
                    }
                    className="min-h-[38px] px-3 rounded-lg bg-[#0B0D12] border border-white/10 text-xs text-[#F8FAFC]"
                  >
                    <option value="monthly">Monthly (30d)</option>
                    <option value="quarterly">Quarterly (90d)</option>
                    <option value="yearly">Yearly (365d)</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={grantingSub || !grantEmail.trim()}
                  className="w-full min-h-[40px] rounded-xl bg-gradient-to-r from-[#FFF1BC] via-[#FCE18E] to-[#F5CD67] disabled:opacity-60 text-[#2B1907] text-xs font-extrabold inline-flex items-center justify-center gap-1.5"
                >
                  {grantingSub ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crown className="w-4 h-4" />}
                  Activate Subscription Instantly
                </button>
              </form>

              {/* Monetization Strategy Card */}
              <div className="rounded-2xl bg-gradient-to-br from-[#1B1914] via-[#141821] to-[#0E1520] border border-[#FCE18E]/25 p-4 sm:p-5 space-y-2.5">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#FCE18E] flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4" />
                  Recommended Monetization Stack for cenipluse.xyz
                </h4>
                <ul className="space-y-1.5 text-xs text-[#CBD5E1] leading-relaxed">
                  <li>
                    <strong className="text-[#F8FAFC]">1. Subscriptions (MTN MoMo + Telecel + Cards):</strong>{' '}
                    Connect <strong>Paystack</strong> (works natively in Ghana with instant MTN MoMo, Telecel Cash, Visa &amp; Mastercard). Premium users get 0 ads, 4K streams, and unlimited fast downloads.
                  </li>
                  <li>
                    <strong className="text-[#F8FAFC]">2. High-CPM Streaming Ads (Free Users Only):</strong>{' '}
                    Plug in <strong>Adsterra</strong>, <strong>Monetag</strong>, or <strong>ExoClick</strong> native banners / social bars — keep them off for Premium members to drive upgrades.
                  </li>
                  <li>
                    <strong className="text-[#F8FAFC]">3. Direct Local Sponsors:</strong>{' '}
                    Use the Banner Sponsor URL above to sell direct weekly ad spots to local brands or betting/telco partners at flat GHS rates.
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Recent Transactions Table */}
          <div className="rounded-2xl bg-[#141821] border border-white/[0.08] p-4 sm:p-5 space-y-3">
            <h3 className="text-sm font-extrabold text-[#F8FAFC]">Recent Revenue &amp; Subscription Ledger</h3>
            {data.recentTransactions.length === 0 ? (
              <p className="text-xs text-[#94A3B8] py-6 text-center">
                No transactions logged yet. When users activate a Premium plan or you log an ad payout, it appears here.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-[11px] uppercase tracking-wider text-[#94A3B8]">
                      <th className="py-2 pr-3">Date</th>
                      <th className="py-2 pr-3">Source / Plan</th>
                      <th className="py-2 pr-3">Method</th>
                      <th className="py-2 pr-3">User</th>
                      <th className="py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {data.recentTransactions.map((tx) => (
                      <tr key={tx.id}>
                        <td className="py-2.5 pr-3 text-[#94A3B8] tabular-nums whitespace-nowrap">
                          {new Date(tx.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-2.5 pr-3 font-bold text-[#F8FAFC]">{tx.planName}</td>
                        <td className="py-2.5 pr-3 capitalize text-[#CBD5E1]">{tx.paymentMethod}</td>
                        <td className="py-2.5 pr-3 text-[#94A3B8] truncate max-w-[180px]">{tx.userEmail}</td>
                        <td className="py-2.5 text-right font-extrabold text-[#10B981] tabular-nums whitespace-nowrap">
                          {tx.currency} {tx.amount.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* VIEW 4: REAL-TIME LIVE ACTIVITY STREAM */}
      {/* ==================================================================== */}
      {subView === 'live' && (
        <div className="rounded-2xl bg-[#141821] border border-white/[0.08] p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-extrabold text-[#F8FAFC] flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#10B981]" />
                Real-Time User Activity Feed
              </h3>
              <p className="text-[11px] text-[#94A3B8]">
                Latest 30 actions across cenipluse.xyz (streams, downloads, searches, page views)
              </p>
            </div>
          </div>

          {data.recentActivity.length === 0 ? (
            <p className="text-xs text-[#94A3B8] py-8 text-center">
              Waiting for visitor activity — browse or play a movie to see events stream in live.
            </p>
          ) : (
            <div className="space-y-2">
              {data.recentActivity.map((ev) => {
                const DevIcon =
                  ev.deviceType === 'mobile' ? Smartphone : ev.deviceType === 'tablet' ? Tablet : Monitor;
                const badgeStyle =
                  ev.eventType === 'play_start' || ev.eventType === 'watch_heartbeat'
                    ? 'bg-[#10B981]/15 text-[#10B981]'
                    : ev.eventType.startsWith('download')
                    ? 'bg-[#FFB800]/15 text-[#FFB800]'
                    : ev.eventType === 'search'
                    ? 'bg-[#A855F7]/15 text-[#A855F7]'
                    : 'bg-[#00E5FF]/15 text-[#00E5FF]';

                return (
                  <div
                    key={ev.id}
                    className="p-3 rounded-xl bg-[#0B0D12] border border-white/[0.05] flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <DevIcon className="w-4 h-4 text-[#64748B] shrink-0" />
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase shrink-0 ${badgeStyle}`}>
                        {ev.eventType.replace(/_/g, ' ')}
                      </span>
                      <span className="font-bold text-[#F8FAFC] truncate">
                        {ev.mediaTitle ||
                          (ev.searchQuery ? `"${ev.searchQuery}"` : null) ||
                          (ev.pagePath ? `Visited /${ev.pagePath}` : 'Activity')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5 text-[11px] text-[#94A3B8] shrink-0 tabular-nums">
                      <span>{ev.userEmail || `Guest #${ev.sessionId.slice(-4)}`}</span>
                      <span>&bull;</span>
                      <span>{formatRelativeTime(ev.createdAt)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
