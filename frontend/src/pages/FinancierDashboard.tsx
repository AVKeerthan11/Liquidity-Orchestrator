import React, { useEffect, useState, useCallback } from 'react';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import { useDashboardStore, isCacheFresh, timeAgo } from '../store/dashboardStore';
import Sidebar from '../components/layout/Sidebar';
import type {
  FinancierDashboardData,
  Alert,
  GraphNetwork,
} from '../types/api';

function formatINR(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(value) || value === 0) return '₹0';
  if (value >= 1_00_00_000) return `₹${(value / 1_00_00_000).toFixed(2)} Cr`;
  if (value >= 1_00_000)    return `₹${(value / 1_00_000).toFixed(2)} L`;
  return `₹${value.toLocaleString('en-IN')}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

const ALERT_COLORS: Record<string, string> = {
  LOW:      'bg-cyan/10 text-cyan border-cyan/30',
  MEDIUM:   'bg-amber/10 text-amber border-amber/30',
  HIGH:     'bg-orange-400/10 text-orange-400 border-orange-400/30',
  CRITICAL: 'bg-danger/10 text-danger border-danger/30',
};

const TYPE_COLORS: Record<string, string> = {
  EARLY_PAYMENT: 'text-cyan border-cyan bg-cyan/10',
  INVOICE_DISCOUNTING: 'text-amber border-amber bg-amber/10',
  MICRO_CREDIT: 'text-purple-400 border-purple-400 bg-purple-400/10'
};

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-border/60 rounded ${className ?? ''}`} />;
}

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
    <div className="flex items-center gap-3 py-2.5 border-b border-border last:border-0 hover:bg-cyan/5 px-2 -mx-2 rounded transition-colors">
      <span className={`text-xs font-mono px-2 py-0.5 rounded border shrink-0 ${ALERT_COLORS[alert.severity] || ALERT_COLORS.LOW}`}>
        {alert.severity}
      </span>
      <p className="text-text text-sm flex-1 font-sans truncate">{alert.message}</p>
      <span className="text-muted text-xs font-mono shrink-0">{formatTime(alert.createdAt)}</span>
    </div>
  );
}

// Module-level cache keyed by companyId — survives React unmount/remount
const _financierCache: Record<string, {
  dashboard: FinancierDashboardData;
  alerts: Alert[];
}> = {};

export default function FinancierDashboard() {
  const companyId = useAuthStore((s) => s.companyId) ?? '';
  const companyName = useAuthStore((s) => s.companyName) ?? _financierCache?.dashboard?.companyName ?? '...';
  const cache     = useDashboardStore();
  const [dashboard, setDashboard] = useState<FinancierDashboardData | null>(
    _financierCache[companyId]?.dashboard ?? cache.financierData
  );
  const [alerts, setAlerts] = useState<Alert[]>(_financierCache[companyId]?.alerts ?? []);
  const [loading, setLoading] = useState(!_financierCache[companyId] && cache.financierData === null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  const [nodeMap, setNodeMap] = useState<Record<string, string>>({});
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [fundedDeals, setFundedDeals] = useState<any[]>([]);

  useEffect(() => {
    api.get<GraphNetwork>('/api/graph/network/b885e67f-609e-44c2-b1e8-04744c5579a4')
      .then(res => {
        const map: Record<string, string> = {};
        res.data.nodes.forEach(n => {
          map[n.data.id] = n.data.label;
        });
        setNodeMap(map);
      })
      .catch(err => console.error('Failed to load network graph for names', err));
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const fetchData = useCallback((force = false) => {
    if (!companyId) return;

    // Module-level cache hit
    if (!force && _financierCache[companyId]?.dashboard?.companyName) {
      console.log('Financier dashboard: serving from module cache for', companyId);
      setDashboard(_financierCache[companyId].dashboard);
      setAlerts(_financierCache[companyId].alerts);
      setLoading(false);
      return;
    }

    // Zustand persist cache hit
    const store = useDashboardStore.getState();
    if (!force && isCacheFresh(store.financierFetchedAt) && store.financierData?.companyName) {
      setDashboard(store.financierData);
      setLastUpdated(store.financierFetchedAt);
      setLoading(false);
      return;
    }

    console.log('Financier dashboard: cache miss — fetching');
    setLoading(true);

    Promise.all([
      api.get<FinancierDashboardData>(`/api/dashboard/financier/${companyId}`),
      api.get<Alert[]>(`/api/alerts/active/${companyId}`),
    ]).then(([dashRes, alertRes]) => {
      const alertData = Array.isArray(alertRes.data) ? alertRes.data : [];
      setDashboard(dashRes.data);
      setAlerts(alertData);
      setLastUpdated(Date.now());

      if (dashRes.data?.companyName) {
        _financierCache[companyId] = { dashboard: dashRes.data, alerts: alertData };
        useDashboardStore.getState().setFinancierData(dashRes.data);
        console.log('Financier dashboard: cache saved for', companyId);
      }
    }).catch(err => {
      console.error('Financier dashboard fetch failed:', err);
      setError('Failed to load dashboard data.');
    }).finally(() => setLoading(false));
  }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFundDeal = async (offerId: string) => {
    try {
      await api.post(`/api/financing/fund/${offerId}`);
      const funded = dashboard?.activeOffers?.find(r => r.id === offerId);
      if (funded) {
        setFundedDeals(prev => [...prev, { ...funded, status: 'FUNDED' }]);
        setDashboard(prev => prev ? {
          ...prev,
          activeOffers: prev.activeOffers.filter(r => r.id !== offerId),
        } : prev);
      }
    } catch (err) {
      console.error('Failed to fund deal:', err);
    }
  };

  useEffect(() => { fetchData(); }, [companyId]);

  // Poll dashboard every 30s to catch new ACCEPTED offers from suppliers
  useEffect(() => {
    if (!companyId) return;
    const interval = setInterval(async () => {
      try {
        const res = await api.get(`/api/dashboard/financier/${companyId}`);
        if (res.data) {
          setDashboard(res.data);
          useDashboardStore.getState().setFinancierData(res.data);
        }
      } catch (err) {
        console.error('Financier poll failed:', err);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [companyId]);

  const handleFund = async (offerId: string) => {
    try {
      await api.post(`/api/financing/accept/${offerId}`);
      if (dashboard) {
        setDashboard({
          ...dashboard,
          activeOffers: dashboard.activeOffers.map(r => 
            r.id === offerId || (r as any).offerId === offerId ? { ...r, status: 'ACCEPTED' as const } : r
          )
        });
      }
    } catch (err) {
      console.error('Failed to fund request:', err);
    }
  };

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
        <div className="sticky top-0 z-10 bg-surface/90 backdrop-blur border-b border-border px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {loading ? (
              <Skeleton className="h-5 w-40" />
            ) : (
              <h1 className="text-text font-sans font-semibold text-base">{companyName}</h1>
            )}
          </div>
          <div className="flex items-center gap-3">
            {loading && cache.financierData && (
              <span className="flex items-center gap-1.5 text-cyan font-mono text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan animate-pulse" />
                Syncing live data...
              </span>
            )}
            {lastUpdated && (
              <span className="text-muted font-mono text-xs">Updated {timeAgo(lastUpdated)}</span>
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
          <div className="grid grid-cols-3 gap-4">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={`metric-${i}`} className="h-24" />)
            ) : (
              <>
                <MetricCard label="Total Capital Deployed" value={formatINR(dashboard?.totalPortfolioValue)} valueClass="text-cyan glow-cyan" />
                <MetricCard label="Deals Funded" value={dashboard?.offersByType ? Object.values(dashboard.offersByType).reduce((a, b) => a + (Number(b) || 0), 0) : 0} />
                <MetricCard label="Avg Borrower Risk" value={`${dashboard?.averageRiskScore?.toFixed(1) || 0}%`} valueClass="text-amber" />
              </>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              
              {/* Financing Requests */}
              <div className="bg-surface border border-border rounded p-5">
                <div className="mb-5">
                  <p className="text-cyan text-xs uppercase tracking-widest font-sans">Deals Awaiting Your Funding</p>
                  <p className="text-muted text-xs font-sans mt-0.5">Suppliers who have selected a financing option and need funding</p>
                </div>
                
                {loading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-10" />
                    <Skeleton className="h-10" />
                    <Skeleton className="h-10" />
                  </div>
                ) : (!dashboard?.activeOffers || dashboard.activeOffers.length === 0) ? (
                  <p className="text-success text-sm font-mono py-8 text-center bg-navy/50 rounded border border-success/10">
                    No active offers — network stable
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left font-sans border-collapse">
                      <thead>
                        <tr className="border-b border-border text-muted text-xs uppercase tracking-wider text-opacity-80">
                          <th className="pb-3 font-medium px-2">Supplier Name</th>
                          <th className="pb-3 font-medium px-2">Type</th>
                          <th className="pb-3 font-medium text-right px-2">Amount</th>
                          <th className="pb-3 font-medium text-right px-2">Status</th>
                          <th className="pb-3 font-medium text-right px-2">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dashboard.activeOffers.map((r, idx) => {
                          const reqId = r.id || (r as any).offerId || `req-${idx}`;
                          // Prefer supplierName from response, fall back to nodeMap, then truncated UUID
                          const supplierName = (r as any).supplierName
                            || (r.supplierId && nodeMap[r.supplierId])
                            || (r.supplierId ? `Supplier ${r.supplierId.slice(0, 8)}...` : 'Unknown');
                          return (
                            <tr key={reqId} className="hover:bg-cyan/5 transition-colors border-b border-border/30 last:border-0 group">
                              <td className="py-3 px-2 text-text text-sm font-medium font-sans">{supplierName}</td>
                              <td className="py-3 px-2">
                                <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${TYPE_COLORS[r.type] || TYPE_COLORS.EARLY_PAYMENT}`}>
                                  {r.type.replace('_', ' ')}
                                </span>
                              </td>
                              <td className="py-3 px-2 text-right font-mono text-sm text-text/90 group-hover:text-cyan transition-colors">
                                {formatINR(r.amount)}
                              </td>
                              <td className="py-3 px-2 text-right">
                                {r.status === 'PENDING' ? (
                                  <span className="px-3 py-1 text-xs font-mono text-amber border border-amber/30 bg-amber/10 rounded shrink-0">
                                    PENDING
                                  </span>
                                ) : r.status === 'ACCEPTED' ? (
                                  <span className="px-3 py-1 text-xs font-mono text-success border border-success/30 bg-success/10 rounded shrink-0">
                                    ACCEPTED
                                  </span>
                                ) : (
                                  <span className="px-3 py-1 text-xs font-mono text-danger border border-danger/30 bg-danger/10 rounded shrink-0">
                                    {r.status}
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-2 text-right">
                                {r.status === 'ACCEPTED' && (
                                  <button
                                    onClick={() => handleFundDeal(r.id || (r as any).offerId)}
                                    className="px-3 py-1.5 bg-cyan text-navy text-xs font-sans font-semibold rounded hover:bg-cyan/90 transition-all"
                                  >
                                    Fund Deal
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Funded deals section */}
                {fundedDeals.length > 0 && (
                  <div className="mt-6 pt-5 border-t border-border">
                    <p className="text-success text-xs uppercase tracking-widest font-sans mb-3">Deals You've Funded</p>
                    <div className="space-y-2">
                      {fundedDeals.map((deal: any) => (
                        <div key={deal.id} className="flex items-center justify-between p-3 bg-success/5 border border-success/20 rounded-lg">
                          <span className="text-text font-sans font-medium text-sm">{(deal as any).supplierName || 'Supplier'}</span>
                          <span className="text-muted text-xs font-mono">{deal.type?.replace(/_/g, ' ')}</span>
                          <span className="text-text font-mono text-sm">{formatINR(deal.amount)}</span>
                          <span className="text-success text-xs font-mono font-semibold">✅ FUNDED</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Multi-Financier Deal Analysis */}
              <div className="bg-surface border border-border rounded p-5">
                <div className="mb-5">
                  <p className="text-cyan text-xs uppercase tracking-widest font-sans">Multi-Financier Deal Analysis</p>
                  <p className="text-muted text-xs font-sans mt-0.5">How financing is split fairly when multiple financiers fund the same supplier</p>
                </div>
                
                {loading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-10" />
                    <Skeleton className="h-24" />
                  </div>
                ) : (
                  <p className="text-muted text-sm font-mono py-8 text-center bg-navy/50 rounded border border-border">
                    No active deals requiring multiple financiers yet
                  </p>
                )}
                
                <p className="text-muted/60 text-[10px] font-sans mt-4 text-center">
                  When stress is high enough, this shows each financier's fair share of a joint rescue deal
                </p>
              </div>

            </div>

            {/* Alerts Panel */}
            <div className="bg-surface border border-border rounded p-5 flex flex-col h-fit sticky top-24">
              <p className="text-cyan text-xs uppercase tracking-widest font-sans mb-4">Active Alerts</p>
              {loading ? (
                <div className="space-y-3">
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                </div>
              ) : alerts.length === 0 ? (
                <p className="text-success text-sm font-mono py-8 text-center bg-navy/50 rounded border border-success/10 mt-2">
                  No active alerts<br/><span className="text-muted text-xs mt-1 block">system nominal</span>
                </p>
              ) : (
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                  {alerts.map((a) => <AlertRow key={a.id} alert={a} />)}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
