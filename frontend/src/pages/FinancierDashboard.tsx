import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
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

export default function FinancierDashboard() {
  const companyId = useAuthStore((s) => s.companyId) ?? '';
  const [dashboard, setDashboard] = useState<FinancierDashboardData | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  const [nodeMap, setNodeMap] = useState<Record<string, string>>({});

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

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    
    Promise.allSettled([
      api.get<FinancierDashboardData>(`/api/dashboard/financier/${companyId}`),
      api.get<Alert[]>(`/api/alerts/active/${companyId}`),
    ]).then(([dashRes, alertRes]) => {
      if (dashRes.status === 'fulfilled') {
        setDashboard(dashRes.value.data);
      } else {
        setError('Failed to load dashboard data.');
      }
      
      if (alertRes.status === 'fulfilled' && Array.isArray(alertRes.value.data)) {
        setAlerts(alertRes.value.data);
      }
    }).finally(() => setLoading(false));
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

  const companyName = dashboard?.companyName ?? '...';

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
          <span className="text-muted font-mono text-xs">
            {now.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
            {' '}
            {now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>

        <div className="px-6 py-6 space-y-6">
          <div className="grid grid-cols-3 gap-4">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={`metric-${i}`} className="h-24" />)
            ) : (
              <>
                <MetricCard label="Total Deployed" value={formatINR(dashboard?.totalPortfolioValue)} valueClass="text-cyan glow-cyan" />
                <MetricCard label="Active Deals" value={dashboard?.offersByType ? Object.values(dashboard.offersByType).reduce((a, b) => a + (Number(b) || 0), 0) : 0} />
                <MetricCard label="AVG RISK SCORE" value={`${dashboard?.averageRiskScore?.toFixed(1) || 0}%`} valueClass="text-amber" />
              </>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              
              {/* Pending Requests */}
              <div className="bg-surface border border-border rounded p-5">
                <div className="mb-5">
                  <p className="text-cyan text-xs uppercase tracking-widest font-sans">FINANCING REQUESTS</p>
                  <p className="text-muted text-xs font-sans mt-0.5">Suppliers seeking liquidity intervention</p>
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
                        </tr>
                      </thead>
                      <tbody>
                        {dashboard.activeOffers.map((r, idx) => {
                          const reqId = r.id || (r as any).offerId || `req-${idx}`;
                          const supplierName = r.supplierId && nodeMap[r.supplierId] 
                            ? nodeMap[r.supplierId] 
                            : (r.supplierId ? r.supplierId.slice(0, 8) + '...' : 'Unknown');
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
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Coalition Analysis */}
              <div className="bg-surface border border-border rounded p-5">
                <div className="mb-5">
                  <p className="text-cyan text-xs uppercase tracking-widest font-sans">COALITION ANALYSIS — SHAPLEY VALUES</p>
                  <p className="text-muted text-xs font-sans mt-0.5">Fair value allocation across financier network using cooperative game theory</p>
                </div>
                
                {loading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-10" />
                    <Skeleton className="h-24" />
                  </div>
                ) : (
                  <p className="text-muted text-sm font-mono py-8 text-center bg-navy/50 rounded border border-border">
                    No active coalition — insufficient network stress
                  </p>
                )}
                
                <p className="text-muted/60 text-[10px] font-sans mt-4 text-center">
                  Shapley values represent each financier's marginal contribution to the rescue coalition
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
