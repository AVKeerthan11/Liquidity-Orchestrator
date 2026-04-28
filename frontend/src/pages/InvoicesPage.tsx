import { useEffect, useState, useMemo } from 'react';
import { useAuthStore } from '../store/authStore';
import { invoiceApi } from '../services/api';
import Sidebar from '../components/layout/Sidebar';
import { formatINR } from '../utils/formatCurrency';
import { daysUntil } from '../utils/formatDate';
import type { Invoice } from '../types/api';

type FilterTab = 'ALL' | 'PENDING' | 'OVERDUE' | 'PAID';
type SortKey = 'amount' | 'dueDate' | 'status' | null;

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-border/60 rounded ${className ?? ''}`} />;
}

const STATUS_STYLE: Record<string, string> = {
  PENDING: 'text-amber border-amber bg-amber/10',
  OVERDUE: 'text-danger border-danger bg-danger/10',
  PAID:    'text-success border-success bg-success/10',
};

export default function InvoicesPage() {
  const companyId = useAuthStore(s => s.companyId) ?? '';
  const role      = useAuthStore(s => s.role) ?? '';
  const companyName = useAuthStore(s => s.companyName) ?? '';

  const [invoices,    setInvoices]    = useState<Invoice[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [filter,      setFilter]      = useState<FilterTab>('ALL');
  const [search,      setSearch]      = useState('');
  const [sortKey,     setSortKey]     = useState<SortKey>(null);
  const [sortAsc,     setSortAsc]     = useState(true);
  const [expandedId,  setExpandedId]  = useState<string | null>(null);
  const [showDrawer,  setShowDrawer]  = useState(false);
  const [toast,       setToast]       = useState<string | null>(null);

  // Drawer form state
  const [buyerId,     setBuyerId]     = useState('');
  const [amount,      setAmount]      = useState('');
  const [dueDate,     setDueDate]     = useState('');
  const [description, setDescription] = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);

  useEffect(() => { fetchInvoices(); }, [companyId]);

  const fetchInvoices = async () => {
    if (!companyId) return;
    try {
      setLoading(true);
      setError(null);
      const { data } = await invoiceApi.getByCompany(companyId);
      setInvoices(Array.isArray(data) ? data : []);
    } catch (err: any) {
      const status = err?.response?.status;
      const msg = err?.response?.data?.message || err?.message || 'Unknown error';
      console.error('Invoice fetch failed:', status, msg);
      if (status === 403) {
        setError(`Access denied (403) — your session may have expired. Try logging out and back in.`);
      } else if (status === 500) {
        setError(`Server error (500): ${msg}`);
      } else if (status === 404) {
        setError(`Endpoint not found (404) — check backend is running on port 8081`);
      } else {
        setError(`Failed to load invoices: ${msg}`);
      }
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!buyerId.trim() || !amount || !dueDate) {
      setDrawerError('Buyer ID, amount, and due date are required');
      return;
    }
    setSubmitting(true);
    setDrawerError(null);
    try {
      await invoiceApi.create({
        supplierId: companyId,
        buyerId: buyerId.trim(),
        amount: parseFloat(amount),
        dueDate,
        description: description.trim() || undefined,
      });
      setShowDrawer(false);
      setBuyerId(''); setAmount(''); setDueDate(''); setDescription('');
      await fetchInvoices();
      showToast('Invoice created successfully');
    } catch (err: any) {
      setDrawerError(err.response?.data?.message || 'Failed to create invoice');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(true); }
  };

  const filtered = useMemo(() => {
    let list = invoices;
    if (filter !== 'ALL') list = list.filter(i => i.status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i =>
        i.supplierName?.toLowerCase().includes(q) ||
        i.buyerName?.toLowerCase().includes(q) ||
        i.id?.toLowerCase().includes(q)
      );
    }
    if (sortKey) {
      list = [...list].sort((a, b) => {
        let av: number | string = 0, bv: number | string = 0;
        if (sortKey === 'amount')  { av = a.amount; bv = b.amount; }
        if (sortKey === 'dueDate') { av = a.dueDate; bv = b.dueDate; }
        if (sortKey === 'status')  { av = a.status; bv = b.status; }
        return sortAsc ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
      });
    }
    return list;
  }, [invoices, filter, search, sortKey, sortAsc]);

  const totalValue   = invoices.reduce((s, i) => s + i.amount, 0);
  const pendingValue = invoices.filter(i => i.status === 'PENDING').reduce((s, i) => s + i.amount, 0);
  const overdueCount = invoices.filter(i => i.status === 'OVERDUE').length;

  const SortIcon = ({ k }: { k: SortKey }) => (
    <span className={`ml-1 text-xs ${sortKey === k ? 'text-cyan' : 'text-muted'}`}>
      {sortKey === k ? (sortAsc ? '↑' : '↓') : '↕'}
    </span>
  );

  return (
    <div className="flex min-h-screen bg-navy">
      <Sidebar companyName={companyName} />

      <main className="flex-1 overflow-y-auto">
        {/* Top bar */}
        <div className="sticky top-0 z-10 bg-surface/90 backdrop-blur border-b border-border px-6 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-text font-sans font-semibold text-base">Invoices</h1>
            <p className="text-muted text-xs font-mono">{invoices.length} total · {formatINR(pendingValue)} pending</p>
          </div>
          {role === 'SUPPLIER' && (
            <button onClick={() => setShowDrawer(true)}
              className="flex items-center gap-2 bg-cyan text-navy text-xs font-sans font-semibold uppercase tracking-widest px-4 py-2 rounded hover:shadow-[0_0_16px_rgba(0,212,255,0.4)] transition-all">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              New Invoice
            </button>
          )}
        </div>

        <div className="px-6 py-6 space-y-5">
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Total Invoices', value: invoices.length.toString(), color: 'text-text' },
              { label: 'Total Value',    value: formatINR(totalValue),       color: 'text-cyan'    },
              { label: 'Pending Value',  value: formatINR(pendingValue),     color: 'text-amber'   },
              { label: 'Overdue Count',  value: overdueCount.toString(),     color: overdueCount > 0 ? 'text-danger' : 'text-success' },
            ].map(c => (
              <div key={c.label} className="bg-surface border border-border rounded p-4 hover:border-cyan/30 transition-colors">
                <p className="text-muted text-xs uppercase tracking-widest font-sans mb-2">{c.label}</p>
                <p className={`font-mono text-2xl font-medium ${c.color}`}>{loading ? '—' : c.value}</p>
              </div>
            ))}
          </div>

          {/* Filter + Search */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1 bg-surface border border-border rounded p-1">
              {(['ALL','PENDING','OVERDUE','PAID'] as FilterTab[]).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-3 py-1 rounded text-xs font-mono transition-colors ${
                    filter === f ? 'bg-cyan/15 text-cyan border border-cyan/30' : 'text-muted hover:text-text'
                  }`}>
                  {f}
                </button>
              ))}
            </div>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or ID..."
              className="flex-1 min-w-[200px] bg-surface border border-border rounded px-3 py-1.5 text-sm font-mono text-text placeholder:text-muted focus:outline-none focus:border-cyan transition-colors"/>
          </div>

          {/* Error */}
          {error && (
            <div className="px-4 py-3 rounded border border-danger bg-danger/10 text-danger text-sm font-mono">{error}</div>
          )}

          {/* Table */}
          <div className="bg-surface border border-border rounded overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border text-muted text-xs uppercase tracking-wider">
                    <th className="px-4 py-3 font-medium">Invoice #</th>
                    <th className="px-4 py-3 font-medium">Counterparty</th>
                    <th className="px-4 py-3 font-medium cursor-pointer hover:text-cyan" onClick={() => toggleSort('amount')}>
                      Amount <SortIcon k="amount"/>
                    </th>
                    <th className="px-4 py-3 font-medium">Issue Date</th>
                    <th className="px-4 py-3 font-medium cursor-pointer hover:text-cyan" onClick={() => toggleSort('dueDate')}>
                      Due Date <SortIcon k="dueDate"/>
                    </th>
                    <th className="px-4 py-3 font-medium">Days Left</th>
                    <th className="px-4 py-3 font-medium cursor-pointer hover:text-cyan" onClick={() => toggleSort('status')}>
                      Status <SortIcon k="status"/>
                    </th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b border-border/30">
                        {Array.from({ length: 8 }).map((_, j) => (
                          <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full"/></td>
                        ))}
                      </tr>
                    ))
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-16 text-center">
                        <p className="text-muted font-mono text-sm">No invoices found</p>
                        {role === 'SUPPLIER' && filter === 'ALL' && !search && (
                          <p className="text-muted text-xs mt-2">Create your first invoice to get started</p>
                        )}
                      </td>
                    </tr>
                  ) : (
                    filtered.map(inv => {
                      const days = daysUntil(inv.dueDate);
                      const daysColor = days < 0 ? 'text-danger' : days <= 14 ? 'text-amber' : 'text-success';
                      const counterparty = role === 'SUPPLIER' ? inv.buyerName : inv.supplierName;
                      const isExpanded = expandedId === inv.id;
                      return (
                        <>
                          <tr key={inv.id}
                            className="border-b border-border/30 hover:bg-cyan/5 transition-colors">
                            <td className="px-4 py-3 font-mono text-xs text-cyan">{inv.id.slice(0,8)}…</td>
                            <td className="px-4 py-3 text-sm text-text">{counterparty}</td>
                            <td className="px-4 py-3 font-mono text-sm text-text">{formatINR(inv.amount)}</td>
                            <td className="px-4 py-3 text-xs text-muted">{new Date(inv.createdAt).toLocaleDateString('en-IN')}</td>
                            <td className="px-4 py-3 text-xs text-muted">{new Date(inv.dueDate).toLocaleDateString('en-IN')}</td>
                            <td className={`px-4 py-3 font-mono text-xs font-semibold ${daysColor}`}>
                              {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-xs font-mono px-2 py-0.5 rounded border ${STATUS_STYLE[inv.status] || 'text-muted border-border'}`}>
                                {inv.status}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <button onClick={() => setExpandedId(isExpanded ? null : inv.id)}
                                className="text-xs text-cyan hover:underline font-mono">
                                {isExpanded ? 'Hide' : 'Details'}
                              </button>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr key={`${inv.id}-exp`} className="bg-navy/60 border-b border-border/30">
                              <td colSpan={8} className="px-6 py-4">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
                                  <div><p className="text-muted mb-1">Supplier ID</p><p className="text-text">{inv.supplierId}</p></div>
                                  <div><p className="text-muted mb-1">Buyer ID</p><p className="text-text">{inv.buyerId}</p></div>
                                  <div><p className="text-muted mb-1">Full Amount</p><p className="text-cyan">{formatINR(inv.amount)}</p></div>
                                  <div><p className="text-muted mb-1">Status</p><p className={STATUS_STYLE[inv.status]?.split(' ')[0]}>{inv.status}</p></div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      {/* New Invoice Drawer */}
      {showDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowDrawer(false)}/>
          <div className="relative w-[480px] bg-surface border-l border-border h-full overflow-y-auto p-8 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-text font-sans font-semibold text-lg">New Invoice</h2>
              <button onClick={() => setShowDrawer(false)} className="text-muted hover:text-text transition-colors">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-5">
              <div>
                <label className="block text-muted text-xs uppercase tracking-widest mb-1.5">Buyer ID</label>
                <input value={buyerId} onChange={e => setBuyerId(e.target.value)} placeholder="UUID of buyer company"
                  className="w-full bg-navy border border-border rounded px-3 py-2.5 font-mono text-sm text-text placeholder:text-muted focus:outline-none focus:border-cyan transition-colors"/>
              </div>
              <div>
                <label className="block text-muted text-xs uppercase tracking-widest mb-1.5">Invoice Amount (₹)</label>
                <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="240000" min="1"
                  className="w-full bg-navy border border-border rounded px-3 py-2.5 font-mono text-sm text-text placeholder:text-muted focus:outline-none focus:border-cyan transition-colors"/>
              </div>
              <div>
                <label className="block text-muted text-xs uppercase tracking-widest mb-1.5">Due Date</label>
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                  className="w-full bg-navy border border-border rounded px-3 py-2.5 font-mono text-sm text-text focus:outline-none focus:border-cyan transition-colors"/>
              </div>
              <div>
                <label className="block text-muted text-xs uppercase tracking-widest mb-1.5">Description (optional)</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
                  placeholder="Invoice for goods delivered..."
                  className="w-full bg-navy border border-border rounded px-3 py-2.5 font-mono text-sm text-text placeholder:text-muted focus:outline-none focus:border-cyan transition-colors resize-none"/>
              </div>
              {drawerError && (
                <div className="px-3 py-2 rounded border border-danger bg-danger/10 text-danger text-sm font-mono">{drawerError}</div>
              )}
              <button type="submit" disabled={submitting}
                className="w-full bg-cyan text-navy font-sans font-semibold text-sm uppercase tracking-widest py-3 rounded hover:shadow-[0_0_16px_rgba(0,212,255,0.4)] transition-all disabled:opacity-60">
                {submitting ? 'Creating...' : 'Create Invoice'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-success/10 border border-success text-success px-4 py-3 rounded font-mono text-sm shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
