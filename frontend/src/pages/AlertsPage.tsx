import { useEffect, useState, useMemo } from 'react';
import { useAuthStore } from '../store/authStore';
import { alertApi } from '../services/api';
import Sidebar from '../components/layout/Sidebar';
import { timeAgo } from '../utils/formatDate';
import type { Alert } from '../types/api';

type SeverityFilter = 'ALL' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-border/60 rounded ${className ?? ''}`} />;
}

const SEV_STYLE: Record<string, { border: string; badge: string; bg: string }> = {
  CRITICAL: { border: 'border-l-danger',  badge: 'text-danger border-danger bg-danger/10',  bg: 'bg-danger/5'  },
  HIGH:     { border: 'border-l-orange-400', badge: 'text-orange-400 border-orange-400 bg-orange-400/10', bg: 'bg-orange-400/5' },
  MEDIUM:   { border: 'border-l-amber',   badge: 'text-amber border-amber bg-amber/10',     bg: ''             },
  LOW:      { border: 'border-l-cyan',    badge: 'text-cyan border-cyan bg-cyan/10',         bg: ''             },
};

export default function AlertsPage() {
  const companyId   = useAuthStore(s => s.companyId) ?? '';
  const companyName = useAuthStore(s => s.companyName) ?? '';

  const [alerts,   setAlerts]   = useState<Alert[]>([]);
  const [read,     setRead]     = useState<Set<string>>(new Set());
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [filter,   setFilter]   = useState<SeverityFilter>('ALL');

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    alertApi.getActive(companyId)
      .then(({ data }) => setAlerts(Array.isArray(data) ? data : []))
      .catch(() => setError('Failed to load alerts'))
      .finally(() => setLoading(false));
  }, [companyId]);

  const markAllRead = () => setRead(new Set(alerts.map(a => a.id)));

  const filtered = useMemo(() => {
    if (filter === 'ALL') return alerts;
    return alerts.filter(a => a.severity === filter);
  }, [alerts, filter]);

  const counts = useMemo(() => ({
    CRITICAL: alerts.filter(a => a.severity === 'CRITICAL').length,
    HIGH:     alerts.filter(a => a.severity === 'HIGH').length,
    MEDIUM:   alerts.filter(a => a.severity === 'MEDIUM').length,
    LOW:      alerts.filter(a => a.severity === 'LOW').length,
  }), [alerts]);

  const unread = alerts.filter(a => !read.has(a.id)).length;

  return (
    <div className="flex min-h-screen bg-navy">
      <Sidebar companyName={companyName} />

      <main className="flex-1 overflow-y-auto">
        {/* Top bar */}
        <div className="sticky top-0 z-10 bg-surface/90 backdrop-blur border-b border-border px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-text font-sans font-semibold text-base">Alerts & Notifications</h1>
            {unread > 0 && (
              <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-danger/15 text-danger border border-danger/30">
                {unread} unread
              </span>
            )}
          </div>
          <button onClick={markAllRead}
            className="text-xs text-muted hover:text-cyan font-mono transition-colors">
            Mark all read
          </button>
        </div>

        <div className="px-6 py-6 space-y-5">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Critical', count: counts.CRITICAL, color: 'text-danger' },
              { label: 'Warnings', count: counts.HIGH + counts.MEDIUM, color: 'text-amber' },
              { label: 'Info',     count: counts.LOW,      color: 'text-cyan'   },
            ].map(c => (
              <div key={c.label} className="bg-surface border border-border rounded p-4">
                <p className="text-muted text-xs uppercase tracking-widest font-sans mb-2">{c.label}</p>
                <p className={`font-mono text-2xl font-medium ${c.color}`}>{loading ? '—' : c.count}</p>
              </div>
            ))}
          </div>

          {/* Filter pills */}
          <div className="flex gap-2 flex-wrap">
            {(['ALL','CRITICAL','HIGH','MEDIUM','LOW'] as SeverityFilter[]).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded text-xs font-mono border transition-colors ${
                  filter === f
                    ? 'bg-cyan/15 text-cyan border-cyan/30'
                    : 'text-muted border-border hover:text-text'
                }`}>
                {f}{f !== 'ALL' && counts[f as keyof typeof counts] > 0 && ` (${counts[f as keyof typeof counts]})`}
              </button>
            ))}
          </div>

          {error && (
            <div className="px-4 py-3 rounded border border-danger bg-danger/10 text-danger text-sm font-mono">{error}</div>
          )}

          {/* Alerts feed */}
          <div className="space-y-3">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-surface border border-border rounded p-4">
                  <Skeleton className="h-4 w-24 mb-3"/>
                  <Skeleton className="h-4 w-full mb-2"/>
                  <Skeleton className="h-3 w-32"/>
                </div>
              ))
            ) : filtered.length === 0 ? (
              <div className="py-20 text-center bg-surface border border-border rounded">
                <p className="text-success font-mono text-sm">No active alerts</p>
                <p className="text-muted text-xs mt-2">Your supply chain looks healthy 🟢</p>
              </div>
            ) : (
              filtered.map(alert => {
                const sev = SEV_STYLE[alert.severity] ?? SEV_STYLE.LOW;
                const isRead = read.has(alert.id);
                const isCritical = alert.severity === 'CRITICAL';
                return (
                  <div key={alert.id}
                    onClick={() => setRead(prev => new Set([...prev, alert.id]))}
                    className={`bg-surface border border-border border-l-4 ${sev.border} rounded p-4 cursor-pointer transition-all hover:border-opacity-80 ${
                      isRead ? 'opacity-60' : sev.bg
                    } ${isCritical && !isRead ? 'animate-pulse-border' : ''}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`text-xs font-mono px-2 py-0.5 rounded border ${sev.badge}`}>
                            {alert.severity}
                          </span>
                          {!isRead && (
                            <span className="w-2 h-2 rounded-full bg-cyan flex-shrink-0"/>
                          )}
                        </div>
                        <p className={`text-sm font-sans ${isRead ? 'text-muted' : 'text-text'}`}>
                          {alert.message}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        <span className="text-xs text-muted font-mono">{timeAgo(alert.createdAt)}</span>
                        {!isRead && (
                          <button
                            onClick={e => { e.stopPropagation(); setRead(prev => new Set([...prev, alert.id])); }}
                            className="text-xs text-muted hover:text-danger font-mono transition-colors">
                            Dismiss
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
