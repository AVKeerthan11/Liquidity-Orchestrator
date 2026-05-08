import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { financingApi } from '../services/api';
import Sidebar from '../components/layout/Sidebar';
import { formatINR } from '../utils/formatCurrency';
import type { FinancingOffer } from '../types/api';

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-border/60 rounded ${className ?? ''}`} />;
}

const TYPE_META: Record<string, { label: string; color: string; formula: string; desc: string; icon: React.ReactNode }> = {
  EARLY_PAYMENT: {
    label: 'Early Payment',
    color: 'text-cyan border-cyan bg-cyan/10',
    formula: 'You receive payment immediately at a small discount',
    desc: 'Get paid immediately at a small discount fee',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  },
  INVOICE_DISCOUNTING: {
    label: 'Invoice Discounting',
    color: 'text-success border-success bg-success/10',
    formula: 'Sell your invoice to a financier at a discount rate',
    desc: 'Sell your invoice to a financier at a discount',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  },
  MICRO_CREDIT: {
    label: 'Micro Credit',
    color: 'text-amber border-amber bg-amber/10',
    formula: 'Short-term loan repaid when your invoice is paid',
    desc: 'Short-term loan repaid when invoice is settled',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  },
};

export default function FinancingPage() {
  const companyId   = useAuthStore(s => s.companyId) ?? '';
  const role        = useAuthStore(s => s.role) ?? '';
  const companyName = useAuthStore(s => s.companyName) ?? '';

  const [options,     setOptions]     = useState<FinancingOffer[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [confirmOpt,  setConfirmOpt]  = useState<FinancingOffer | null>(null);
  const [accepting,   setAccepting]   = useState(false);
  const [toast,       setToast]       = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [showFormula, setShowFormula] = useState(false);

  useEffect(() => { fetchOptions(); }, [companyId]);

  const fetchOptions = async () => {
    if (!companyId) return;
    try {
      setLoading(true);
      setError(null);
      const { data } = await financingApi.getOptions(companyId);
      setOptions(Array.isArray(data) ? data : []);
    } catch {
      setError('Failed to load financing options');
      setOptions([]);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleAccept = async () => {
    if (!confirmOpt) return;
    setAccepting(true);
    try {
      await financingApi.accept(confirmOpt.id);
      setConfirmOpt(null);
      await fetchOptions();  // reload so ACCEPTED + REJECTED statuses appear
      showToast('Offer accepted! Awaiting financier funding.');
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to accept offer', 'error');
    } finally {
      setAccepting(false);
    }
  };

  const routeColor = (score?: number) => {
    if (!score) return 'bg-muted';
    if (score > 0.7) return 'bg-success';
    if (score > 0.4) return 'bg-amber';
    return 'bg-danger';
  };

  // Group by type for summary cards
  const byType = (type: string) => options.filter(o => o.type === type);

  // If supplier already accepted/funded an offer, disable the others
  const hasActiveChoice = options.some(
    o => o.status === 'ACCEPTED' || o.status === 'FUNDED'
  );

  // Financiers don't use supplier financing options
  if (role === 'FINANCIER') {
    return (
      <div className="flex min-h-screen bg-navy">
        <Sidebar companyName={companyName} />
        <main className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <div className="w-14 h-14 rounded-full bg-cyan/10 border border-cyan/30 flex items-center justify-center mx-auto mb-5">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" strokeWidth="2">
                <line x1="12" y1="1" x2="12" y2="23"/>
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
              </svg>
            </div>
            <h2 className="text-cyan font-sans font-semibold text-xl mb-3">Financing Deals You're Offering</h2>
            <p className="text-muted font-sans text-sm leading-relaxed">
              View and manage financing requests from your dashboard.
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-navy">
      <Sidebar companyName={companyName} />

      <main className="flex-1 overflow-y-auto">
        {/* Top bar */}
        <div className="sticky top-0 z-10 bg-surface/90 backdrop-blur border-b border-border px-6 py-3">
          <h1 className="text-text font-sans font-semibold text-base">Financing Options</h1>
          <p className="text-muted text-xs font-mono">AI-optimized financing routes for your invoices</p>
        </div>

        <div className="px-6 py-6 space-y-6">
          {/* Financing type cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.entries(TYPE_META).map(([key, meta]) => {
              const typeOptions = byType(key);
              const avgCost = typeOptions.length
                ? typeOptions.reduce((s, o) => s + (o.cost || 0), 0) / typeOptions.length
                : null;
              const avgSpeed = typeOptions.length
                ? typeOptions.reduce((s, o) => s + (o.speedDays || 0), 0) / typeOptions.length
                : null;
              // Unique financier names for this type
              const financierNames = [...new Set(
                typeOptions.map(o => o.financierName).filter(Boolean)
              )] as string[];
              return (
                <div key={key} className={`bg-surface border rounded p-5 border-l-4 ${meta.color.split(' ')[1]}`}>
                  <div className="flex items-start gap-3 mb-3">
                    <span className={meta.color.split(' ')[0]}>{meta.icon}</span>
                    <div>
                      <p className="text-text font-sans font-semibold text-sm">{meta.label}</p>
                      <p className="text-muted text-xs mt-0.5 whitespace-normal break-words">{meta.desc}</p>
                      {financierNames.length > 0 && (
                        <p className="text-muted text-xs mt-1 font-mono">
                          by {financierNames.join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-4 text-xs font-mono">
                    <div>
                      <p className="text-muted">Avg Cost</p>
                      <p className="text-text">{avgCost != null ? `${formatINR(avgCost)}` : '—'}</p>
                    </div>
                    <div>
                      <p className="text-muted">Avg Speed</p>
                      <p className="text-text">{avgSpeed != null ? `${Math.round(avgSpeed)}d` : '—'}</p>
                    </div>
                    <div>
                      <p className="text-muted">Available</p>
                      <p className="text-cyan">{typeOptions.length}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {error && (
            <div className="px-4 py-3 rounded border border-danger bg-danger/10 text-danger text-sm font-mono">{error}</div>
          )}

          {/* Options table */}
          <div className="bg-surface border border-border rounded overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
              <p className="text-text font-sans font-semibold text-sm">Available Options</p>
              <span className="text-muted text-xs font-mono">{options.length} offers</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border text-muted text-xs uppercase tracking-wider">
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Financier</th>
                    <th className="px-4 py-3 font-medium">Offer Amount</th>
                    <th className="px-4 py-3 font-medium">Cost</th>
                    <th className="px-4 py-3 font-medium">Speed</th>
                    <th className="px-4 py-3 font-medium">Match Score</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    {role === 'SUPPLIER' && <th className="px-4 py-3 font-medium">Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <tr key={i} className="border-b border-border/30">
                        {Array.from({ length: 8 }).map((_, j) => (
                          <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full"/></td>
                        ))}
                      </tr>
                    ))
                  ) : options.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-16 text-center">
                        <p className="text-muted font-mono text-sm">No financing options available right now</p>
                        <p className="text-muted text-xs mt-2">Options are generated based on your active invoices</p>
                      </td>
                    </tr>
                  ) : (
                    options.map(opt => {
                      const meta = TYPE_META[opt.type];
                      const score = opt.routingScore ?? 0;
                      return (
                        <tr key={opt.id} className="border-b border-border/30 hover:bg-cyan/5 transition-colors">
                          <td className="px-4 py-3">
                            <span className={`text-xs font-mono px-2 py-0.5 rounded border ${meta?.color || 'text-muted border-border'}`}>
                              {meta?.label || opt.type}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-sans text-sm text-text">
                            {opt.financierName
                              ? <span className="text-cyan font-medium">{opt.financierName}</span>
                              : <span className="text-muted text-xs">—</span>
                            }
                          </td>
                          <td className="px-4 py-3 font-mono text-sm text-text">
                            {formatINR(opt.receivableAmount ?? opt.amount ?? 0)}
                          </td>
                          <td className="px-4 py-3 font-mono text-sm text-text">
                            {formatINR(opt.cost)}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-amber">
                            {opt.speedDays ? `${opt.speedDays}d` : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-20 bg-navy rounded-full h-1.5 overflow-hidden">
                                <div className={`h-full rounded-full ${routeColor(score)}`}
                                  style={{ width: `${Math.min(score * 100, 100)}%` }}/>
                              </div>
                              <span className="font-mono text-xs text-text">{score.toFixed(2)}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-mono px-2 py-0.5 rounded border ${
                              opt.status === 'ACCEPTED' ? 'text-amber border-amber bg-amber/10' :
                              opt.status === 'FUNDED'   ? 'text-success border-success bg-success/10' :
                              opt.status === 'REJECTED' ? 'text-muted border-border' :
                              'text-cyan border-cyan/30 bg-cyan/5'
                            }`}>
                              {opt.status || 'PENDING'}
                            </span>
                          </td>
                          {role === 'SUPPLIER' && (
                            <td className="px-4 py-3">
                              {opt.status === 'ACCEPTED' && (
                                <span className="text-xs font-mono text-amber">⏳ Awaiting funding</span>
                              )}
                              {opt.status === 'FUNDED' && (
                                <span className="text-xs font-mono text-success">✅ Funded</span>
                              )}
                              {opt.status === 'REJECTED' && (
                                <span className="text-xs font-mono text-muted opacity-50">Not selected</span>
                              )}
                              {(!opt.status || opt.status === 'PENDING') && hasActiveChoice && (
                                <button disabled
                                  className="text-xs font-sans px-3 py-1.5 rounded bg-border text-muted cursor-not-allowed opacity-40">
                                  Accept Offer
                                </button>
                              )}
                              {(!opt.status || opt.status === 'PENDING') && !hasActiveChoice && (
                                <button onClick={() => setConfirmOpt(opt)}
                                  className="text-xs bg-cyan text-navy font-sans font-semibold px-3 py-1.5 rounded hover:bg-cyan/90 transition-all">
                                  Accept Offer
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Routing Score Explainer */}
          <div className="bg-surface border border-border rounded overflow-hidden">
            <button onClick={() => setShowFormula(v => !v)}
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-cyan/5 transition-colors">
              <p className="text-text font-sans font-semibold text-sm">How We Pick the Best Option</p>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                className={`text-muted transition-transform ${showFormula ? 'rotate-180' : ''}`}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            {showFormula && (
              <div className="border-t border-border">
                <div className="p-4 space-y-3 text-sm text-muted">
                  <p>Our routing algorithm scores each financing option across 3 factors:</p>
                  <div className="space-y-2">
                    <div className="flex items-start gap-3">
                      <span className="text-cyan font-medium min-w-[80px]">Cost (40%)</span>
                      <span>Lower fees = higher score. We find you the cheapest option first.</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="text-cyan font-medium min-w-[80px]">Speed (35%)</span>
                      <span>Faster payment = higher score. Critical when you need cash urgently.</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="text-cyan font-medium min-w-[80px]">Approval (25%)</span>
                      <span>Higher chance of approval = higher score. Based on your risk profile.</span>
                    </div>
                  </div>
                  <p className="text-muted/60 text-xs pt-2 border-t border-border">
                    The option with the highest combined score is marked as RECOMMENDED.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Confirmation Modal */}
      {confirmOpt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setConfirmOpt(null)}/>
          <div className="relative bg-surface border border-border rounded-lg p-8 w-full max-w-md shadow-2xl">
            <h2 className="text-text font-sans font-semibold text-lg mb-5">Confirm Financing</h2>
            <div className="space-y-3 text-sm font-mono mb-6">
              <div className="flex justify-between">
                <span className="text-muted">Type</span>
                <span className="text-text">{TYPE_META[confirmOpt.type]?.label}</span>
              </div>
              {confirmOpt.financierName && (
                <div className="flex justify-between">
                  <span className="text-muted">Financier</span>
                  <span className="text-cyan">{confirmOpt.financierName}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted">You will receive</span>
                <span className="text-cyan font-semibold">{formatINR(confirmOpt.receivableAmount ?? confirmOpt.amount ?? 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Cost</span>
                <span className="text-amber">{formatINR(confirmOpt.cost)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Speed</span>
                <span className="text-text">{confirmOpt.speedDays ? `${confirmOpt.speedDays} days` : '—'}</span>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={handleAccept} disabled={accepting}
                className="flex-1 bg-cyan text-navy font-sans font-semibold text-sm uppercase tracking-widest py-2.5 rounded hover:shadow-[0_0_16px_rgba(0,212,255,0.4)] transition-all disabled:opacity-60">
                {accepting ? 'Confirming...' : 'Confirm'}
              </button>
              <button onClick={() => setConfirmOpt(null)}
                className="flex-1 bg-navy border border-border text-muted text-sm font-sans py-2.5 rounded hover:text-text transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded font-mono text-sm shadow-lg border ${
          toast.type === 'success'
            ? 'bg-success/10 border-success text-success'
            : 'bg-danger/10 border-danger text-danger'
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
