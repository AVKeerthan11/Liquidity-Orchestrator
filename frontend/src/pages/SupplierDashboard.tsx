import { useEffect, useState, useCallback } from 'react';
import {
  XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Area, AreaChart,
} from 'recharts';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import { useDashboardStore, isCacheFresh, timeAgo } from '../store/dashboardStore';
import Sidebar from '../components/layout/Sidebar';
import type {
  SupplierDashboard as DashboardData,
  RiskScore,
  RiskHistoryPoint,
  Alert,
  FinancingOffer,
  CashFlowForecast,
  ResearchComparisonResponse,
} from '../types/api';

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatINR(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(value) || value === 0) return '₹0';
  if (value >= 1_00_00_000) return `₹${(value / 1_00_00_000).toFixed(3)} Cr`;
  if (value >= 1_00_000)    return `₹${(value / 1_00_000).toFixed(2)} L`;
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function formatShortfall(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(value) || value <= 0) return 'HEALTHY';
  if (value >= 1_00_00_000) return `₹${(value / 1_00_00_000).toFixed(3)} Cr`;
  if (value >= 1_00_000)    return `₹${(value / 1_00_000).toFixed(2)} L`;
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit' });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

const SEVERITY_COLORS: Record<string, string> = {
  GREEN:    'text-success border-success bg-success/10',
  YELLOW:   'text-amber border-amber bg-amber/10',
  ORANGE:   'text-orange-400 border-orange-400 bg-orange-400/10',
  RED:      'text-danger border-danger bg-danger/10',
};

const ALERT_COLORS: Record<string, string> = {
  LOW:      'bg-cyan/10 text-cyan border-cyan/30',
  MEDIUM:   'bg-amber/10 text-amber border-amber/30',
  HIGH:     'bg-orange-400/10 text-orange-400 border-orange-400/30',
  CRITICAL: 'bg-danger/10 text-danger border-danger/30',
};

const OFFER_LABELS: Record<string, string> = {
  EARLY_PAYMENT:      'Early Payment',
  INVOICE_DISCOUNTING: 'Invoice Discounting',
  MICRO_CREDIT:       'Micro Credit',
};

// ── Skeleton ───────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-border/60 rounded ${className ?? ''}`} />;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function MetricCard({
  label, value, valueClass,
}: { label: string; value: React.ReactNode; valueClass?: string }) {
  return (
    <div className="bg-surface border-l-2 border-cyan border-t border-r border-b border-border rounded p-4 hover:glow-cyan transition-all">
      <p className="text-muted text-xs uppercase tracking-widest font-sans mb-2">{label}</p>
      <p className={`font-mono text-2xl font-medium ${valueClass ?? 'text-text'}`}>{value}</p>
    </div>
  );
}

function AlertRow({ alert }: { alert: Alert }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
      <span className={`text-xs font-mono px-2 py-0.5 rounded border shrink-0 ${ALERT_COLORS[alert.severity]}`}>
        {alert.severity}
      </span>
      <p className="text-text text-sm flex-1 font-sans">{alert.message}</p>
      <span className="text-muted text-xs font-mono shrink-0">{formatTime(alert.createdAt)}</span>
    </div>
  );
}

function FinancingCard({
  offer, isRecommended, onAccept, accepting,
}: {
  offer: FinancingOffer;
  isRecommended: boolean;
  onAccept: (id: string) => void;
  accepting: boolean;
}) {
  // EARLY_PAYMENT + INVOICE_DISCOUNTING → show receivableAmount (what supplier gets after deduction)
  // MICRO_CREDIT → show originalAmount (full loan disbursed)
  const isMicroCredit  = offer.type === 'MICRO_CREDIT';
  const displayAmount  = isMicroCredit
    ? (offer.originalAmount ?? 0)
    : (offer.receivableAmount ?? 0);
  const originalAmount = offer.originalAmount ?? 0;
  const cost           = offer.cost ?? 0;
  const routingPct     = Math.min((offer.routingScore ?? 0) * 100, 100);

  // Debug — remove once confirmed working
  console.log(`[FinancingCard] type=${offer.type} originalAmount=${offer.originalAmount} receivableAmount=${offer.receivableAmount} displayAmount=${displayAmount}`);

  return (
    <div className={`bg-surface border border-border rounded p-5 flex flex-col gap-3 relative
      ${isRecommended ? 'border-cyan/40 glow-cyan' : ''}`}>
      {isRecommended && (
        <span className="absolute top-3 right-3 text-xs font-mono text-cyan border border-cyan/30 bg-cyan/10 px-2 py-0.5 rounded">
          RECOMMENDED
        </span>
      )}
      <p className="text-muted text-xs uppercase tracking-widest font-sans">
        {OFFER_LABELS[offer.type]}
      </p>
      <div>
        <p className={`font-mono text-2xl font-medium ${displayAmount > 0 ? 'text-cyan' : 'text-muted text-base'}`}>
          {formatINR(displayAmount)}
        </p>
        {originalAmount > 0 && (
          <p className="text-muted text-xs font-mono mt-0.5">
            of {formatINR(originalAmount)} original
          </p>
        )}
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted font-sans">Fee</span>
        <span className="text-amber font-mono">{formatINR(cost)}</span>
      </div>
      {/* Match score bar */}
      <div>
        <div className="flex justify-between text-xs mb-1">
          <span className="text-muted font-sans">Match Score</span>
          <span className="text-cyan font-mono">{routingPct.toFixed(1)}%</span>
        </div>
        <div className="h-1.5 bg-border rounded-full overflow-hidden">
          <div
            className="h-full bg-cyan rounded-full transition-all"
            style={{ width: `${routingPct}%` }}
          />
        </div>
      </div>
      {offer.status === 'ACCEPTED' && (
        <div className="flex items-center gap-2 text-amber font-mono text-sm py-1">
          ⏳ Awaiting financier funding
        </div>
      )}
      {offer.status === 'FUNDED' && (
        <div className="flex items-center gap-2 text-success font-mono text-sm py-1">
          ✅ Funded — cash on the way
        </div>
      )}
      {offer.status === 'REJECTED' && (
        <div className="text-muted text-sm font-mono py-1">
          Not selected
        </div>
      )}
      {offer.status === 'PENDING' && (
        <button
          onClick={() => onAccept(offer.id)}
          disabled={accepting}
          className="mt-1 w-full py-2 text-sm font-sans font-medium border border-cyan text-cyan rounded
            hover:bg-cyan hover:text-navy transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {accepting ? 'Processing...' : 'Accept Offer'}
        </button>
      )}
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────

// Module-level cache keyed by companyId — survives React unmount/remount, bypasses localStorage timing
const _supplierCache: Record<string, {
  dashboard: DashboardData;
  riskScore: RiskScore | null;
  history: RiskHistoryPoint[];
  alerts: Alert[];
  offers: FinancingOffer[];
  research: ResearchComparisonResponse | null;
}> = {};

export default function SupplierDashboard() {
  const companyId    = useAuthStore((s) => s.companyId) ?? '';
  const cache        = useDashboardStore();

  const [dashboard,  setDashboard]  = useState<DashboardData | null>(_supplierCache[companyId]?.dashboard ?? cache.supplierData);
  const [riskScore,  setRiskScore]  = useState<RiskScore | null>(_supplierCache[companyId]?.riskScore ?? null);
  const [history,    setHistory]    = useState<RiskHistoryPoint[]>(_supplierCache[companyId]?.history ?? []);
  const [alerts,     setAlerts]     = useState<Alert[]>(_supplierCache[companyId]?.alerts ?? []);
  const [offers,     setOffers]     = useState<FinancingOffer[]>(_supplierCache[companyId]?.offers ?? []);
  const [research,   setResearch]   = useState<ResearchComparisonResponse | null>(_supplierCache[companyId]?.research ?? null);
  const [loading,    setLoading]    = useState(!_supplierCache[companyId] && cache.supplierData === null);
  const [error,      setError]      = useState<string | null>(null);
  const [accepting,  setAccepting]  = useState<string | null>(null);
  const [confirmOffer, setConfirmOffer] = useState<any>(null);
  const [acceptedMessage, setAcceptedMessage] = useState<string | null>(null);
  const [now,        setNow]        = useState(new Date());
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Clock tick
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const fetchData = useCallback((force = false) => {
    if (!companyId) return;

    // Module-level cache hit — all data present, serve immediately
    if (!force && _supplierCache[companyId]?.dashboard?.companyName) {
      setDashboard(_supplierCache[companyId].dashboard);
      setRiskScore(_supplierCache[companyId].riskScore);
      setHistory(_supplierCache[companyId].history);
      setAlerts(_supplierCache[companyId].alerts);
      setOffers(_supplierCache[companyId].offers);
      setResearch(_supplierCache[companyId].research);
      setLoading(false);
      return;
    }

    // Zustand persist cache hit (page reload within TTL)
    const store = useDashboardStore.getState();
    if (!force && isCacheFresh(store.supplierFetchedAt) && store.supplierData?.companyName) {
      setDashboard(store.supplierData);
      setLastUpdated(store.supplierFetchedAt);
      setLoading(false);
      return;
    }

    console.log('Cache miss — firing API calls');
    setLoading(true);
    setError(null);

    // Use allSettled so a single failing endpoint (e.g. no risk score yet) doesn't kill the whole dashboard
    Promise.allSettled([
      api.get<DashboardData>(`/api/dashboard/supplier/${companyId}`),
      api.get<RiskScore>(`/api/risk/score/${companyId}`),
      api.get<RiskHistoryPoint[]>(`/api/risk/history/${companyId}?days=30`),
      api.get<Alert[]>(`/api/alerts/active/${companyId}`),
      api.get<FinancingOffer[]>(`/api/financing/options/${companyId}`),
      api.get<ResearchComparisonResponse>(`/api/risk/research/comparison/${companyId}`),
    ]).then(([dash, risk, hist, alrt, fin, resCmp]) => {
      // Only the dashboard call is critical — if it fails, show error
      if (dash.status === 'rejected') {
        console.error('Dashboard fetch failed:', dash.reason);
        setError('Failed to load dashboard data.');
        return;
      }

      const fresh = {
        dashboard: dash.value.data,
        riskScore: risk.status === 'fulfilled' ? risk.value.data : null,
        history:   hist.status === 'fulfilled' && Array.isArray(hist.value.data) ? hist.value.data : [],
        alerts:    alrt.status === 'fulfilled' && Array.isArray(alrt.value.data) ? alrt.value.data : [],
        offers:    fin.status  === 'fulfilled' && Array.isArray(fin.value.data)  ? fin.value.data  : [],
        research:  resCmp.status === 'fulfilled' ? resCmp.value.data : null,
      };

      if (fresh.dashboard?.companyName) {
        _supplierCache[companyId] = fresh;
        useDashboardStore.getState().setSupplierData(fresh.dashboard);
      }

      setDashboard(fresh.dashboard);
      setRiskScore(fresh.riskScore);
      setHistory(fresh.history);
      setAlerts(fresh.alerts);
      setOffers(fresh.offers);
      setResearch(fresh.research);
      setLastUpdated(Date.now());
    }).catch(err => {
      console.error('Unexpected dashboard error:', err);
      setError('Failed to load dashboard data.');
    }).finally(() => setLoading(false));
  }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData(); }, [companyId, refreshTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  // Invalidate cache and refetch when user switches back to this tab
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && companyId) {
        delete _supplierCache[companyId];
        setRefreshTrigger(prev => prev + 1);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [companyId]);

  // Poll financing options every 30s to catch FUNDED status from financier
  useEffect(() => {
    if (!companyId) return;
    const interval = setInterval(async () => {
      try {
        const response = await api.get(`/api/financing/options/${companyId}`);
        setOffers(Array.isArray(response.data) ? response.data : []);
      } catch (err) {
        console.error('Financing poll failed:', err);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [companyId]);

  const handleAccept = async (offerId: string) => {
    // handled via confirmation dialog — this is kept for FinancingCard compat
    const offer = offers.find(o => o.id === offerId);
    if (offer) setConfirmOffer(offer);
  };

  const handleAcceptConfirmed = async (offerId: string) => {
    setAccepting(offerId);
    try {
      await api.post(`/api/financing/accept/${offerId}`);
      setConfirmOffer(null);
      setAcceptedMessage('Offer accepted! Awaiting financier funding.');
      // Reload to reflect ACCEPTED + REJECTED statuses
      const response = await api.get(`/api/financing/options/${companyId}`);
      setOffers(Array.isArray(response.data) ? response.data : []);
      setTimeout(() => setAcceptedMessage(null), 5000);
    } catch (err) {
      console.error('Failed to accept offer:', err);
    } finally {
      setAccepting(null);
    }
  };

  const companyName = dashboard?.companyName ?? '...';
  const severity    = riskScore?.severity ?? 'GREEN';

  // Chart data
  const chartData = history.map((h) => ({
    date:  formatDate(h.calculatedAt),
    score: h.score,
  }));

  const hasHighRisk = history.some((h) => h.score > 70);

  if (error) {
    return (
      <div className="min-h-screen bg-navy flex items-center justify-center">
        <p className="text-danger font-mono">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-navy">
      <Sidebar companyName={companyName} />

      <main className="flex-1 overflow-y-auto">
        {/* Top bar */}
        <div className="sticky top-0 z-10 bg-surface/90 backdrop-blur border-b border-border px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {loading ? (
              <Skeleton className="h-5 w-40" />
            ) : (
              <h1 className="text-text font-sans font-semibold text-base">{companyName}</h1>
            )}
            {!loading && riskScore && (
              <span className={`text-xs font-mono px-2.5 py-1 rounded border ${SEVERITY_COLORS[severity]}`}>
                RISK {riskScore.score.toFixed(1)} · {severity}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {loading && cache.supplierData && (
              <span className="flex items-center gap-1.5 text-cyan font-mono text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan animate-pulse" />
                Syncing live data...
              </span>
            )}
            {lastUpdated && (
              <span className="text-muted font-mono text-xs">
                Updated {timeAgo(lastUpdated)}
              </span>
            )}
            <button
              onClick={() => fetchData(true)}
              disabled={loading}
              title="Force refresh"
              className="text-muted hover:text-cyan transition-colors disabled:opacity-40"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={loading ? 'animate-spin' : ''}>
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
            </button>
            <span className="text-muted font-mono text-xs">
              {now.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
              {' '}
              {now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
        </div>

        <div className="px-6 py-6 space-y-6">

          {/* Metric cards */}
          <div className="grid grid-cols-4 gap-4">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={`metric-${i}`} className="h-24" />)
            ) : (
              <>
                <MetricCard label="Total Invoices"    value={dashboard?.totalInvoices ?? 0} />
                <MetricCard label="Pending Invoices"  value={dashboard?.pendingInvoices ?? 0}  valueClass="text-amber" />
                <MetricCard label="Overdue Invoices"  value={dashboard?.overdueInvoices ?? 0}  valueClass="text-danger" />
                <MetricCard
                  label="Total Outstanding"
                  value={(() => {
                    // Prefer backend value; fall back to summing offers if available
                    const backendVal = dashboard?.totalPendingAmount ?? 0;
                    if (backendVal > 0) return formatINR(backendVal);
                    const fromOffers = offers.reduce((sum, o) => sum + (o.originalAmount ?? o.amount ?? 0), 0);
                    return fromOffers > 0 ? formatINR(fromOffers) : '₹0';
                  })()}
                  valueClass="text-cyan"
                />
              </>
            )}
          </div>

          {/* Welcome banner for new suppliers with no invoices */}
          {!loading && (dashboard?.totalInvoices ?? 0) === 0 && (
            <div className="border border-cyan/30 bg-cyan/5 rounded p-6">
              <h3 className="text-cyan font-sans font-semibold text-base mb-2">
                Welcome to Liquidity Orchestrator 👋
              </h3>
              <p className="text-muted text-sm font-sans mb-4 leading-relaxed">
                Your dashboard is ready. Create your first invoice to connect with your buyer
                and unlock risk monitoring, cash flow forecasting, and financing options.
              </p>
              <a href="/invoices"
                className="inline-block bg-cyan text-navy font-sans font-semibold text-sm px-4 py-2 rounded hover:bg-cyan/90 transition-colors">
                + Create First Invoice
              </a>
            </div>
          )}

          {/* Cash Flow Forecast */}
          {(() => {
            const cf: CashFlowForecast | null | undefined = dashboard?.cashFlowForecast;
            const shortfall  = cf?.predictedShortfall ?? null;
            const days       = cf?.daysUntilShortfall ?? null;
            const confidence = cf?.confidence ?? null;
            const isHealthy  = !shortfall || shortfall <= 0;
            const borderColor = isHealthy ? 'border-l-success' : 'border-l-danger';
            const bgTint      = isHealthy ? 'bg-success/5' : 'bg-danger/5';

            return (
              <div className={`bg-surface border border-border border-l-2 ${borderColor} ${bgTint} rounded p-5`}>
                <p className="text-cyan text-xs uppercase tracking-widest font-sans mb-5">
                  Cash Flow Forecast
                </p>
                {loading ? (
                  <div className="flex gap-8">
                    <Skeleton className="h-16 flex-1" />
                    <Skeleton className="h-16 flex-1" />
                    <Skeleton className="h-16 flex-1" />
                  </div>
                ) : (
                  <div className="flex items-center gap-8">
                    {/* Shortfall */}
                    <div className="flex-1">
                      <p className={`font-mono text-3xl font-medium ${isHealthy ? 'text-success' : 'text-danger'}`}>
                        {shortfall && shortfall > 0 ? formatShortfall(shortfall) : 'No shortfall detected'}
                      </p>
                      <p className="text-muted text-xs font-sans mt-1 uppercase tracking-wide">
                        Expected Shortfall
                      </p>
                    </div>

                    <div className="w-px h-12 bg-border" />

                    {/* Days */}
                    <div className="flex-1 text-center">
                      <p className="font-mono text-3xl font-medium text-amber">
                        {days && days > 0 ? days : 'N/A'}
                      </p>
                      <p className="text-muted text-xs font-sans mt-1 uppercase tracking-wide">
                        Days to Shortfall
                      </p>
                    </div>

                    <div className="w-px h-12 bg-border" />

                    {/* Confidence */}
                    <div className="flex-1 text-right">
                      <p className="font-mono text-3xl font-medium text-cyan">
                        {confidence !== null && confidence !== undefined ? `${(confidence * 100).toFixed(0)}%` : '—'}
                      </p>
                      <p className="text-muted text-xs font-sans mt-1 uppercase tracking-wide">
                        Forecast Accuracy
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Risk Score Trend */}
          <div className="bg-surface border border-border rounded p-5">
            <p className="text-cyan text-xs uppercase tracking-widest font-sans mb-4">
              Your Risk History — Last 30 Days
            </p>
            {loading ? (
              <Skeleton className="h-48" />
            ) : chartData.length === 0 ? (
              <p className="text-muted text-sm font-mono text-center py-12">No history data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="cyanGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#00d4ff" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#00d4ff" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e2d4a" />
                  <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'JetBrains Mono' }} />
                  <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'JetBrains Mono' }} />
                  <Tooltip
                    contentStyle={{ background: '#0f1629', border: '1px solid #1e2d4a', borderRadius: 4 }}
                    labelStyle={{ color: '#64748b', fontFamily: 'JetBrains Mono', fontSize: 11 }}
                    itemStyle={{ color: '#00d4ff', fontFamily: 'JetBrains Mono', fontSize: 12 }}
                  />
                  {hasHighRisk && (
                    <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="4 3" strokeWidth={1} />
                  )}
                  <Area type="monotone" dataKey="score" stroke="#00d4ff" strokeWidth={2} fill="url(#cyanGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Alerts */}
          <div className="bg-surface border border-border rounded p-5">
            <p className="text-cyan text-xs uppercase tracking-widest font-sans mb-4">Active Alerts</p>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={`alert-skel-${i}`} className="h-10" />)}
              </div>
            ) : alerts.length === 0 ? (
              <p className="text-success text-sm font-mono py-4 text-center">
                No active alerts — system nominal
              </p>
            ) : (
              <div>
                {alerts.map((a) => <AlertRow key={a.id} alert={a} />)}
              </div>
            )}
          </div>

          {/* Financing Options */}
          <div className="bg-surface border border-border rounded p-5">
            <div className="mb-4">
              <p className="text-cyan text-xs uppercase tracking-widest font-sans">Financing Options</p>
              <p className="text-muted text-xs font-sans mt-0.5">Automatically matched by routing algorithm</p>
            </div>
            {loading ? (
              <div className="grid grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={`fin-skel-${i}`} className="h-48" />)}
              </div>
            ) : (() => {
              const hasActiveInvoices = (dashboard?.pendingInvoices ?? 0) > 0 || (dashboard?.overdueInvoices ?? 0) > 0;
              if (!hasActiveInvoices && offers.length === 0) {
                return (
                  <div className="border border-success/20 bg-success/5 rounded p-6 text-center">
                    <p className="text-success text-2xl mb-2">✅</p>
                    <p className="text-success font-sans font-medium mb-1">All invoices paid</p>
                    <p className="text-muted text-sm font-sans">No financing needed — your cash flow is healthy.</p>
                  </div>
                );
              }
              if (offers.length === 0) {
                return <p className="text-muted text-sm font-mono text-center py-8">No financing options available</p>;
              }
              return (
                <div className="grid grid-cols-3 gap-4">
                  {offers.map((offer) => (
                    <FinancingCard
                      key={offer.id}
                      offer={offer}
                      isRecommended={offer.recommended === true}
                      onAccept={handleAccept}
                      accepting={accepting === offer.id}
                    />
                  ))}
                </div>
              );
            })()}
          </div>

          {/* Research Insights Panel — only shown when scores are meaningful */}
          {!loading && research && (research.traditionalScore > 0 || research.networkAwareScore > 0) && (
          <div className="bg-surface border border-border rounded p-5">
            <div className="mb-6 text-center border-b border-border pb-4">
              <p className="text-cyan text-base uppercase tracking-widest font-sans font-semibold mb-1">
                How We Score You Differently
              </p>
              <p className="text-muted text-xs font-sans tracking-widest uppercase">
                Our model vs traditional bank scoring
              </p>
            </div>

            {loading ? (
              <div className="flex gap-4">
                <Skeleton className="h-32 flex-1" />
                <Skeleton className="h-32 flex-1" />
              </div>
            ) : !research ? (
              <p className="text-muted text-sm font-mono text-center py-8">Analysis unavailable</p>
            ) : (
              <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between gap-4">
                  {/* Traditional Box */}
                  <div className="flex-1 border border-border bg-navy/30 rounded p-6 text-center shadow-inner">
                    <p className="text-muted text-xs uppercase tracking-widest font-sans mb-3">
                      Standard Credit Score
                    </p>
                    <div className="font-mono text-5xl font-light text-text drop-shadow-md">
                      {research.traditionalScore.toFixed(1)}
                    </div>
                  </div>

                  {/* Arrow and difference */}
                  <div className="shrink-0 flex flex-col items-center">
                    <span className="text-border text-4xl mb-1">→</span>
                    <span className={`text-xs font-mono font-bold px-2 py-1 rounded bg-black/20 ${research.underestimated ? 'text-danger' : 'text-success'}`}>
                      {research.underestimated ? '+' : '-'}{research.difference.toFixed(1)} pts
                    </span>
                  </div>

                  {/* Network-Aware Box */}
                  <div className="flex-1 border border-cyan/50 bg-cyan/5 rounded p-6 text-center shadow-[0_0_15px_rgba(0,212,255,0.1)] relative">
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan/50 to-transparent"></div>
                    <p className="text-cyan text-xs uppercase tracking-widest font-sans mb-3 font-semibold">
                      Our Smart Score
                    </p>
                    <div className="font-mono text-5xl font-medium text-cyan" style={{ textShadow: '0 0 20px rgba(0,212,255,0.4)' }}>
                      {research.networkAwareScore.toFixed(1)}
                    </div>
                  </div>
                </div>

                <div className="text-center mt-2 px-8 py-4 bg-amber/5 border border-amber/20 rounded">
                  <p className="text-amber text-sm font-sans italic font-medium leading-relaxed">
                    "{research.conclusion}"
                  </p>
                </div>
                
                <p className="text-muted/60 text-[10px] text-center font-sans tracking-wide">
                  {research.paperReference}
                </p>
              </div>
            )}
          </div>
          )}

        </div>
      </main>

      {/* Confirmation modal */}
      {confirmOffer && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#0f1629] border border-[#1e3a5f] rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-text font-sans font-semibold text-lg mb-2">Confirm Financing</h3>
            <p className="text-muted font-sans mb-4">
              Accept <span className="text-cyan font-medium">{confirmOffer.type?.replace(/_/g, ' ')}</span> for{' '}
              <span className="text-text font-semibold">{formatINR(confirmOffer.receivableAmount ?? confirmOffer.amount ?? 0)}</span>?
              {' '}Fee: <span className="text-amber font-mono">{formatINR(confirmOffer.cost ?? 0)}</span>
            </p>
            <p className="text-muted/70 text-sm font-sans mb-6">
              Other financing options will be dismissed once you confirm.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleAcceptConfirmed(confirmOffer.id)}
                disabled={!!accepting}
                className="flex-1 bg-cyan text-navy font-sans font-semibold py-2.5 rounded-lg hover:bg-cyan/90 transition-all disabled:opacity-60"
              >
                {accepting ? 'Confirming...' : 'Confirm'}
              </button>
              <button
                onClick={() => setConfirmOffer(null)}
                className="flex-1 border border-border text-muted font-sans py-2.5 rounded-lg hover:text-text hover:border-muted transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success banner */}
      {acceptedMessage && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded font-mono text-sm shadow-lg border bg-success/10 border-success text-success">
          {acceptedMessage}
        </div>
      )}
    </div>
  );
}
