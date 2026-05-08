import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import cytoscape from 'cytoscape';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import { useDashboardStore, isCacheFresh, timeAgo } from '../store/dashboardStore';
import Sidebar from '../components/layout/Sidebar';
import type {
  BuyerDashboardData,
  GraphNetwork,
  Alert,
  FsriResponse,
} from '../types/api';

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatINR(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(value) || value === 0) return '₹0';
  if (value >= 1_00_00_000) return `₹${(value / 1_00_00_000).toFixed(2)} Cr`;
  if (value >= 1_00_000)    return `₹${(value / 1_00_000).toFixed(2)} L`;
  return `₹${value.toLocaleString('en-IN')}`;
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
    <div className="flex items-center gap-3 py-2.5 border-b border-border last:border-0 hover:bg-cyan/5 px-2 -mx-2 rounded transition-colors">
      <span className={`text-xs font-mono px-2 py-0.5 rounded border shrink-0 ${ALERT_COLORS[alert.severity] || ALERT_COLORS.LOW}`}>
        {alert.severity}
      </span>
      <p className="text-text text-sm flex-1 font-sans truncate">{alert.message}</p>
      <span className="text-muted text-xs font-mono shrink-0">{formatTime(alert.createdAt)}</span>
    </div>
  );
}

// Module-level cache keyed by companyId — survives React unmount/remount, bypasses localStorage timing
const _buyerCache: Record<string, {
  dashboard: BuyerDashboardData;
  network: GraphNetwork | null;
  fsri: FsriResponse | null;
  alerts: Alert[];
}> = {};

// ── Main Dashboard ─────────────────────────────────────────────────────────────

export default function BuyerDashboard() {
  const companyId = useAuthStore((s) => s.companyId) ?? '';
  const { buyerData, buyerNetwork: cachedNetwork, setBuyerData } = useDashboardStore();

  // Seed from module cache first (fastest), then Zustand persist, then null
  const [dashboard, setDashboard] = useState<BuyerDashboardData | null>(
    _buyerCache[companyId]?.dashboard ?? buyerData
  );
  const [network,   setNetwork]   = useState<GraphNetwork | null>(
    _buyerCache[companyId]?.network ?? cachedNetwork
  );
  const [fsri,      setFsri]      = useState<FsriResponse | null>(_buyerCache[companyId]?.fsri ?? null);
  const [alerts,    setAlerts]    = useState<Alert[]>(_buyerCache[companyId]?.alerts ?? []);

  // initialLoading = true only when there is NO cached data at all
  const [initialLoading,  setInitialLoading]  = useState(!_buyerCache[companyId] && !buyerData);
  const [loadingNetwork,  setLoadingNetwork]  = useState(!_buyerCache[companyId] && !cachedNetwork);
  const [refreshing,      setRefreshing]      = useState(false);
  const [error,           setError]           = useState<string | null>(null);
  const [now,             setNow]             = useState(new Date());
  const [lastUpdated,     setLastUpdated]     = useState<number | null>(
    useDashboardStore.getState().buyerFetchedAt
  );

  const cyRef = useRef<HTMLDivElement>(null);
  const cyContainerRef = useRef<HTMLDivElement>(null);
  const cyInstance = useRef<cytoscape.Core | null>(null);
  const [selectedNode, setSelectedNode] = useState<{ name: string; riskScore: number; type: string; invoiceCount?: number } | null>(null);
  const [tooltip, setTooltip] = useState<{
    x: number; y: number;
    name: string; riskScore: number; severity: string;
    totalInvoices: number; pendingAmount: number; overdueAmount: number;
  } | null>(null);

  // Clock tick
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Always background-refresh; only show skeleton on true first load
  const fetchData = useCallback((force = false) => {
    if (!companyId) return;

    // Module-level cache hit — serve immediately, no API calls
    if (!force && _buyerCache[companyId]?.dashboard?.companyName) {
      setDashboard(_buyerCache[companyId].dashboard);
      if (_buyerCache[companyId].network) setNetwork(_buyerCache[companyId].network);
      setFsri(_buyerCache[companyId].fsri);
      setAlerts(_buyerCache[companyId].alerts);
      setInitialLoading(false);
      setLoadingNetwork(false);
      return;
    }

    // Zustand persist cache hit
    const store = useDashboardStore.getState();
    if (!force && isCacheFresh(store.buyerFetchedAt) && store.buyerData?.companyName) {
      setDashboard(store.buyerData);
      if (store.buyerNetwork) setNetwork(store.buyerNetwork);
      setLastUpdated(store.buyerFetchedAt);
      setInitialLoading(false);
      setLoadingNetwork(false);
      return;
    }

    setRefreshing(true);

    // Fast: dashboard + alerts
    Promise.all([
      api.get<BuyerDashboardData>(`/api/dashboard/buyer/${companyId}`),
      api.get<Alert[]>(`/api/alerts/active/${companyId}`),
    ]).then(([dashRes, alertRes]) => {
      setDashboard(dashRes.data);
      setLastUpdated(Date.now());
      if (Array.isArray(alertRes.data)) setAlerts(alertRes.data);
    }).catch(err => {
      console.error('Buyer dashboard fast fetch failed:', err);
      if (!dashboard) setError('Failed to load dashboard data.');
    }).finally(() => setInitialLoading(false));

    // Slow: graph + FSRI
    Promise.all([
      api.get<GraphNetwork>(`/api/graph/network/${companyId}`),
      api.get<FsriResponse>(`/api/graph/cascade-risk/${companyId}`),
    ]).then(([netRes, fsriRes]) => {
      setNetwork(netRes.data);
      setFsri(fsriRes.data);

      // Save to both caches after all data is present
      const currentDash = useDashboardStore.getState().buyerData ?? dashboard;
      if (currentDash?.companyName) {
        _buyerCache[companyId] = {
          dashboard: currentDash,
          network:   netRes.data,
          fsri:      fsriRes.data,
          alerts:    useDashboardStore.getState().buyerData ? alerts : [],
        };
        setBuyerData(currentDash, netRes.data);
      }
    }).catch(err => {
      console.error('Buyer dashboard graph fetch failed:', err);
    }).finally(() => {
      setLoadingNetwork(false);
      setRefreshing(false);
    });
  }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData(); }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cytoscape Init
  useEffect(() => {
    if (!cyRef.current || !network || network.nodes.length === 0) return;

    const elements: cytoscape.ElementDefinition[] = [];

    network.nodes.forEach(n => {
      const { id, label, type, riskScore, invoiceCount, pendingAmount, overdueAmount } = n.data;
      elements.push({
        data: {
          id,
          name:          label,
          type,
          riskScore:     riskScore     ?? 0,
          invoiceCount:  invoiceCount  ?? 0,
          pendingAmount: pendingAmount ?? 0,
          overdueAmount: overdueAmount ?? 0,
        },
      });
    });

    // Deduplicate edges — one per source-target pair, keeping highest amount
    const edgeMap = new Map<string, typeof network.edges[0]>();
    const invoiceCount = new Map<string, number>();

    network.edges.forEach(e => {
      const key = `${e.data.source}-${e.data.target}`;
      invoiceCount.set(key, (invoiceCount.get(key) ?? 0) + 1);
      const existing = edgeMap.get(key);
      if (!existing || (e.data.amount ?? 0) > (existing.data.amount ?? 0)) {
        edgeMap.set(key, e);
      }
    });

    edgeMap.forEach((e, key) => {
      elements.push({
        data: {
          id:            key,
          source:        e.data.source,
          target:        e.data.target,
          invoiceAmount: e.data.amount,   // renamed: stylesheet reads 'invoiceAmount'
          status:        e.data.status,
          invoiceCount:  invoiceCount.get(key) ?? 1,
        },
      });
    });

    cyInstance.current = cytoscape({
      container: cyRef.current,
      elements,
      minZoom: 0.4,
      maxZoom: 3,
      wheelSensitivity: 0.3,
      motionBlur: true,
      motionBlurOpacity: 0.2,
      pixelRatio: 'auto' as any,
      style: [
        // ── Base node ──────────────────────────────────────────────────────────
        {
          selector: 'node',
          style: {
            'background-color': (ele: any) => {
              const t = ele.data('type'), r = ele.data('riskScore') ?? 0;
              if (t === 'BUYER')     return '#00d4ff';
              if (t === 'FINANCIER') return '#a855f7';
              if (r >= 60) return '#ef4444';
              if (r >= 40) return '#f59e0b';
              return '#10b981';
            },
            'width': (ele: any) => {
              const t = ele.data('type'), r = ele.data('riskScore') ?? 0;
              if (t === 'BUYER') return 45;
              return Math.max(20, Math.min(42, 20 + (r / 100) * 22));
            },
            'height': (ele: any) => {
              const t = ele.data('type'), r = ele.data('riskScore') ?? 0;
              if (t === 'BUYER') return 45;
              return Math.max(20, Math.min(42, 20 + (r / 100) * 22));
            },
            'border-width': 2,
            'border-color': (ele: any) => {
              const t = ele.data('type'), r = ele.data('riskScore') ?? 0;
              if (t === 'BUYER') return '#ffffff';
              if (r >= 60) return '#ff6b6b';
              if (r >= 40) return '#fcd34d';
              return '#34d399';
            },
            'label': '',
            'transition-property': 'width height border-width opacity',
            'transition-duration': '0.2s',
          } as any,
        },
        // ── Buyer always labelled ──────────────────────────────────────────────
        {
          selector: 'node[type = "BUYER"]',
          style: {
            'label': 'data(name)',
            'font-size': '11px',
            'font-family': 'Inter',
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': '6px',
            'color': '#00d4ff',
            'text-outline-width': 2,
            'text-outline-color': '#0a0e1a',
          } as any,
        },
        // ── At-risk suppliers always labelled ──────────────────────────────────
        {
          selector: 'node[riskScore >= 40]',
          style: {
            'label': 'data(name)',
            'font-size': '10px',
            'font-family': 'Inter',
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': '6px',
            'color': '#ffffff',
            'text-outline-width': 2,
            'text-outline-color': '#0a0e1a',
          } as any,
        },
        // ── Hover ──────────────────────────────────────────────────────────────
        {
          selector: 'node:active',
          style: {
            'border-width': 3,
            'opacity': 1,
            'label': 'data(name)',
            'font-size': '11px',
            'font-family': 'Inter',
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': '8px',
            'color': '#ffffff',
            'text-outline-width': 2,
            'text-outline-color': '#0a0e1a',
            'overlay-opacity': 0,
          } as any,
        },
        // ── Edges ──────────────────────────────────────────────────────────────
        {
          selector: 'edge',
          style: {
            'width': 'mapData(invoiceAmount, 0, 10000000, 1, 6)' as any,
            'line-color': (ele: any) => {
              const r = ele.source().data('riskScore') ?? 0;
              if (r >= 60) return '#ef4444';
              if (r >= 40) return '#f59e0b';
              return '#10b981';
            },
            'target-arrow-color': (ele: any) => {
              const r = ele.source().data('riskScore') ?? 0;
              if (r >= 60) return '#ef4444';
              if (r >= 40) return '#f59e0b';
              return '#10b981';
            },
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'opacity': 0.7,
            'arrow-scale': 0.9,
          } as any,
        },
      ],
      layout: {
        name: 'cose',
        idealEdgeLength: 150,
        nodeOverlap: 40,
        refresh: 20,
        fit: true,
        padding: 60,
        randomize: false,
        componentSpacing: 120,
        nodeRepulsion: 450000,
        edgeElasticity: 100,
        nestingFactor: 5,
        gravity: 80,
        numIter: 1000,
        initialTemp: 200,
        coolingFactor: 0.95,
        minTemp: 1.0,
      } as any,
    });

    const cy = cyInstance.current;

    // Mouseover node — floating tooltip
    cy.on('mouseover', 'node', (evt) => {
      const node = evt.target;
      const data = node.data();
      if (data.type === 'BUYER') return;
      const pos = node.renderedPosition();
      const rect = cyContainerRef.current?.getBoundingClientRect();
      setTooltip({
        x: pos.x + (rect?.left ?? 0),
        y: pos.y + (rect?.top  ?? 0) - 10,
        name:          data.name,
        riskScore:     data.riskScore ?? 0,
        severity:      data.riskScore >= 60 ? 'HIGH' : data.riskScore >= 40 ? 'MEDIUM' : 'LOW',
        totalInvoices: data.invoiceCount ?? 1,
        pendingAmount: data.pendingAmount ?? 0,
        overdueAmount: data.overdueAmount ?? 0,
      });
    });
    cy.on('mouseout', 'node', () => setTooltip(null));

    // Tap node — animate zoom + show info card
    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      cy.animate({ center: { eles: node }, zoom: 1.8, duration: 400, easing: 'ease-in-out-cubic' } as any);
      setSelectedNode({ name: node.data('name'), riskScore: node.data('riskScore') ?? 0, type: node.data('type') });
    });

    // Tap edge — show invoice count
    cy.on('tap', 'edge', (evt) => {
      const edge = evt.target;
      const srcName = cy.getElementById(edge.data('source')).data('name') ?? edge.data('source');
      const tgtName = cy.getElementById(edge.data('target')).data('name') ?? edge.data('target');
      setSelectedNode({ name: `${srcName} → ${tgtName}`, riskScore: 0, type: 'EDGE', invoiceCount: edge.data('invoiceCount') ?? 1 });
    });

    // Tap background — reset zoom
    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        cy.animate({ fit: { padding: 60 }, duration: 400, easing: 'ease-in-out-cubic' } as any);
        setSelectedNode(null);
        setTooltip(null);
      }
    });

    return () => {
      setSelectedNode(null);
      setTooltip(null);
      if (cyInstance.current) {
        cyInstance.current.destroy();
        cyInstance.current = null;
      }
    };
  }, [network]);

  const companyName = dashboard?.companyName ?? '...';
  
  // Mapped attributes
  const totalExposure = dashboard?.totalOutstandingPayables ?? 0;
  
  const overdueExposure = useMemo(() => {
    if (!network?.edges) return 0;
    return network.edges
      .filter((e) => e.data.status === 'OVERDUE')
      .reduce((sum, e) => sum + e.data.amount, 0);
  }, [network]);

  // Sort suppliers desc by risk score
  const sortedSuppliers = useMemo(() => {
    const net = dashboard?.supplierNetwork || network;
    if (!net?.nodes) return [];
    
    return net.nodes
      .filter(n => n.data.type === 'SUPPLIER')
      .map(n => {
        const sid = n.data.id;
        const edges = net.edges || [];
        const sEdges = edges.filter(e => e.data.source === sid || e.data.target === sid);
        
        const pendingAmount = sEdges
          .filter(e => e.data.status === 'PENDING')
          .reduce((sum, e) => sum + e.data.amount, 0);
          
        const overdueAmount = sEdges
          .filter(e => e.data.status === 'OVERDUE')
          .reduce((sum, e) => sum + e.data.amount, 0);

        const riskScore = n.data.riskScore || 0;
        let severity: 'GREEN'|'YELLOW'|'ORANGE'|'RED' = 'GREEN';
        if (riskScore > 60) severity = 'RED';
        else if (riskScore > 30) severity = 'YELLOW';

        return {
          companyId: sid,
          companyName: n.data.label,
          riskScore,
          severity,
          pendingAmount,
          overdueAmount,
        };
      })
      .sort((a, b) => b.riskScore - a.riskScore);
  }, [dashboard, network]);

  let r0Color = 'text-success';
  let r0Label = 'CONTAINED';
  let r0GaugePct = 0;
  
  if (dashboard) {
    // If buyer has no suppliers, R0 is meaningless — force to 0
    const r0 = (dashboard.totalSuppliers ?? 0) === 0 ? 0 : dashboard.r0Score;
    r0GaugePct = Math.min((r0 / 3) * 100, 100);
    if (r0 > 2.0) {
      r0Color = 'text-danger';
      r0Label = 'CRITICAL';
    } else if (r0 >= 1.0) {
      r0Color = 'text-amber';
      r0Label = 'SPREADING';
    }
  }

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
            {initialLoading ? (
              <Skeleton className="h-5 w-40" />
            ) : (
              <h1 className="text-text font-sans font-semibold text-base">{companyName}</h1>
            )}
            {!initialLoading && dashboard && (
              <span className={`text-xs font-mono px-2.5 py-1 rounded border tracking-wide shadow-sm ${
                dashboard.atRiskSuppliers > 0 ? 'text-danger border-danger bg-danger/10 shadow-danger/20' : 'text-success border-success bg-success/10 shadow-success/20'
              }`}>
                {dashboard.atRiskSuppliers > 0 ? `${dashboard.atRiskSuppliers} AT RISK` : 'HEALTHY'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {refreshing && (
              <span className="flex items-center gap-1.5 text-cyan font-mono text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan animate-pulse" />
                Syncing...
              </span>
            )}
            {lastUpdated && (
              <span className="text-muted font-mono text-xs">Updated {timeAgo(lastUpdated)}</span>
            )}
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing}
              title="Force refresh"
              className="text-muted hover:text-cyan transition-colors disabled:opacity-40"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={refreshing ? 'animate-spin' : ''}>
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
            {initialLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={`metric-${i}`} className="h-24" />)
            ) : (
              <>
                <MetricCard label="Total Suppliers" value={dashboard?.totalSuppliers ?? 0} />
                <MetricCard label="At Risk Suppliers" value={dashboard?.atRiskSuppliers ?? 0} valueClass="text-danger" />
                <MetricCard label="Total Exposure" value={formatINR(totalExposure)} valueClass="text-cyan glow-cyan" />
                <MetricCard label="Overdue Exposure" value={formatINR(overdueExposure)} valueClass="text-danger" />
              </>
            )}
          </div>

          {/* R0 Contagion Score Panel */}
          <div className="relative bg-surface border border-border rounded p-10 flex flex-col items-center overflow-hidden">
            <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] blur-[100px] rounded-full pointer-events-none opacity-10 transition-colors duration-1000 ${
              r0Label === 'CONTAINED' ? 'bg-success' : r0Label === 'SPREADING' ? 'bg-amber' : 'bg-danger'
            }`} />
            
            <h2 className="text-cyan text-sm uppercase tracking-widest font-sans font-semibold mb-8 z-10">Financial Stress Spread Index</h2>
             
            {initialLoading ? (
               <Skeleton className="h-24 w-48 mb-4 z-10" />            ) : (
              <div className="flex flex-col items-center w-full max-w-3xl z-10">
                <div className={`font-mono text-[7rem] leading-none mb-3 tracking-tighter ${r0Color}`} style={{ textShadow: `0 0 40px var(--color-${r0Label === 'CONTAINED' ? 'success' : r0Label === 'SPREADING' ? 'amber' : 'danger'})`}}>
                  {((dashboard?.totalSuppliers ?? 0) === 0 ? 0 : (dashboard?.r0Score ?? 0)).toFixed(2)}
                </div>
                <div className={`text-xs font-mono font-semibold tracking-widest px-4 py-1.5 rounded-full border mb-12 shadow-sm ${
                   r0Label === 'CONTAINED' ? SEVERITY_COLORS['GREEN'] : r0Label === 'SPREADING' ? SEVERITY_COLORS['YELLOW'] : SEVERITY_COLORS['RED']
                }`}>
                  {r0Label === 'SPREADING' ? '⚠ Stress is Spreading' : r0Label}
                </div>
                 
                <div className="w-full">
                  <div className="flex justify-between text-xs text-muted mb-3 font-mono">
                    <span>Safe (0.0)</span>
                    <span className={r0Label === 'CRITICAL' ? 'text-danger' : ''}>Crisis (3.0+)</span>
                  </div>
                  <div className="h-2 w-full bg-navy rounded-full overflow-hidden relative border border-border/50">
                    <div 
                      className={`h-full absolute left-0 top-0 transition-all duration-1000 ${
                        r0Label === 'CONTAINED' ? 'bg-success' : r0Label === 'SPREADING' ? 'bg-amber' : 'bg-danger'
                      }`}
                      style={{ width: `${r0GaugePct}%`, boxShadow: '0 0 10px currentColor' }}
                    />
                  </div>
                  <p className="text-muted text-sm text-center mt-6 font-sans max-w-xl mx-auto">
                    This index measures how fast financial stress spreads across your suppliers. Above 1.0 means each struggling supplier is affecting more than one other — action recommended.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* FSRI Cascade Risk Panel */}
          <div className="bg-surface border border-border rounded p-5">
            <div className="mb-5">
              <p className="text-cyan text-xs uppercase tracking-widest font-sans font-semibold">Supply Chain Impact Ranking</p>
              <p className="text-muted text-xs font-sans mt-0.5">Suppliers ranked by how much damage their failure would cause to your supply chain</p>
            </div>

            {loadingNetwork ? (
               <div className="space-y-3 mt-4">
                 <Skeleton className="h-10" />
                 <Skeleton className="h-10" />
                 <Skeleton className="h-10" />
               </div>
            ) : (!fsri || fsri.suppliers.length === 0) ? (
               <div className="py-8 text-center border border-border rounded bg-navy/50">
                 <p className="text-muted font-mono text-sm">No critical cascade vectors detected</p>
               </div>
            ) : (
               <div className="overflow-x-auto mt-4">
                 <table className="w-full text-left font-sans border-collapse">
                   <thead>
                     <tr className="border-b border-border text-muted text-xs uppercase tracking-wider text-opacity-80">
                       <th className="pb-3 font-medium px-2">Supplier Name</th>
                       <th className="pb-3 font-medium px-2 w-1/3">Impact Score</th>
                       <th className="pb-3 font-medium text-right px-2">Network Reach</th>
                       <th className="pb-3 font-medium text-right px-2">Risk Level</th>
                     </tr>
                   </thead>
                   <tbody>
                     {fsri.suppliers.slice(0, 5).map((s) => {
                       let barColor = '#00d4ff'; // LOW cyan
                       if (s.criticalityLevel === 'CRITICAL') barColor = '#ef4444'; // red
                       else if (s.criticalityLevel === 'HIGH') barColor = '#fb923c'; // orange
                       else if (s.criticalityLevel === 'MEDIUM') barColor = '#f59e0b'; // amber
                       
                       const badgeClass =
                         s.criticalityLevel === 'CRITICAL' ? 'text-danger border-danger bg-danger/10' :
                         s.criticalityLevel === 'HIGH' ? 'text-orange-400 border-orange-400 bg-orange-400/10' :
                         s.criticalityLevel === 'MEDIUM' ? 'text-amber border-amber bg-amber/10' :
                         'text-cyan border-cyan bg-cyan/10';

                       return (
                         <tr key={s.supplierId} className="hover:bg-cyan/5 transition-colors border-b border-border/30 last:border-0 group">
                           <td className="py-3 px-2 text-text text-sm font-medium">{s.supplierName}</td>
                           <td className="py-3 px-2">
                             <div className="flex flex-col">
                               <span className="font-mono text-xs text-text mb-1">{s.fsriScore.toFixed(1)}%</span>
                               <div className="h-1.5 w-full bg-navy rounded-full overflow-hidden border border-border/50">
                                 <div 
                                   className="h-full rounded-full transition-all"
                                   style={{ 
                                     width: `${Math.min(s.fsriScore, 100)}%`,
                                     backgroundColor: barColor 
                                   }}
                                 />
                               </div>
                             </div>
                           </td>
                           <td className="py-3 px-2 text-right">
                             <span className="text-muted text-xs font-mono">{(s.centralityScore * 100).toFixed(1)}%</span>
                           </td>
                           <td className="py-3 px-2 text-right">
                             <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${badgeClass}`}>
                               {s.criticalityLevel}
                             </span>
                           </td>
                         </tr>
                       );
                     })}
                   </tbody>
                 </table>
                 
                 <div className="mt-6 pt-5 border-t border-border flex justify-between items-center bg-navy/30 p-4 rounded border border-cyan/10 shadow-inner">
                   <p className="text-muted font-sans text-sm uppercase tracking-widest font-medium">Network Resilience Score</p>
                   <p className={`font-mono text-3xl font-bold tracking-tighter ${
                     fsri.networkResilienceScore > 70 ? 'text-success' : 
                     fsri.networkResilienceScore >= 40 ? 'text-amber' : 
                     'text-danger'
                   }`}>
                     {fsri.networkResilienceScore.toFixed(1)}%
                   </p>
                 </div>
               </div>
            )}
          </div>

          {/* Supply Chain Network Graph */}
          <div className="bg-surface border border-border rounded p-5 relative overflow-hidden">
            <div className="flex justify-between items-start mb-4">
              <p className="text-cyan text-xs uppercase tracking-widest font-sans">Live Supplier Network Map</p>
              {!initialLoading && (network?.nodes.length ?? 0) > 0 && (
                <div className="flex gap-2 relative z-10">
                  <button onClick={() => cyInstance.current?.zoom(cyInstance.current.zoom() * 1.2)} className="bg-navy hover:bg-cyan/10 text-cyan border border-border hover:border-cyan/50 rounded w-6 h-6 flex items-center justify-center font-mono cursor-pointer transition-all" title="Zoom In">+</button>
                  <button onClick={() => cyInstance.current?.zoom(cyInstance.current.zoom() * 0.8)} className="bg-navy hover:bg-cyan/10 text-cyan border border-border hover:border-cyan/50 rounded w-6 h-6 flex items-center justify-center font-mono cursor-pointer transition-all" title="Zoom Out">-</button>
                </div>
              )}
            </div>
            {loadingNetwork ? (
              <Skeleton className="h-[500px] w-full" />
            ) : network?.nodes.length === 0 ? (
              <div className="h-[500px] flex items-center justify-center bg-navy rounded border border-border/50">
                <p className="text-muted font-mono">No network data available</p>
              </div>
            ) : (
              <div className="relative" ref={cyContainerRef}>
                <div 
                  key={`cy-${network?.nodes.length ?? 0}`}
                  ref={cyRef} 
                  className="h-[500px] w-full bg-navy rounded border border-border/50 relative z-0"
                />

                {/* Info card — bottom left, shown on node/edge tap */}
                {selectedNode && (
                  <div className="absolute bottom-4 left-4 bg-[#0f1629] border border-[#1e3a5f] rounded-lg p-3 text-sm z-10 shadow-lg min-w-[160px]">
                    <div className="text-cyan font-medium font-sans truncate">{selectedNode.name}</div>
                    {selectedNode.type === 'SUPPLIER' && (
                      <div className="text-muted mt-1 font-sans">
                        Risk Score:{' '}
                        <span className={`font-mono font-semibold ${
                          selectedNode.riskScore >= 60 ? 'text-danger' :
                          selectedNode.riskScore >= 40 ? 'text-amber' : 'text-success'
                        }`}>{selectedNode.riskScore.toFixed(1)}</span>
                      </div>
                    )}
                    {selectedNode.type === 'EDGE' && selectedNode.invoiceCount !== undefined && (
                      <div className="text-muted mt-1 font-sans">
                        Invoices: <span className="font-mono font-semibold text-cyan">{selectedNode.invoiceCount}</span>
                      </div>
                    )}
                    <div className="text-muted font-sans text-xs mt-0.5 uppercase tracking-wide">
                      {selectedNode.type === 'EDGE' ? 'Relationship' : selectedNode.type}
                    </div>
                  </div>
                )}

                {/* Legend — bottom right */}
                <div className="absolute bottom-4 right-4 bg-[#0a0e1a]/90 border border-[#1e3a5f] rounded-lg p-3 text-xs z-10">
                  <div className="text-muted mb-2 font-medium uppercase tracking-wider text-[10px]">Legend</div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-500 shrink-0" />
                    <span className="text-muted/80">High risk supplier</span>
                  </div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-3 h-3 rounded-full bg-amber-500 shrink-0" />
                    <span className="text-muted/80">Medium risk supplier</span>
                  </div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" />
                    <span className="text-muted/80">Healthy supplier</span>
                  </div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-3 h-3 rounded-full bg-cyan-400 shrink-0" />
                    <span className="text-muted/80">Buyer (you)</span>
                  </div>
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[#1e3a5f]">
                    <div className="flex items-center gap-0.5">
                      <div className="w-3 h-px bg-muted/60" />
                      <div className="w-3 h-0.5 bg-muted/60" />
                      <div className="w-3 h-1 bg-muted/60" />
                    </div>
                    <span className="text-muted/80">Edge = invoice volume</span>
                  </div>
                  <div className="text-muted/50 mt-2 text-[10px]">Hover nodes for details</div>
                </div>
              </div>
            )}

            {/* Floating tooltip — fixed position, driven by mouseover state */}
            {tooltip && (
              <div
                style={{ position: 'fixed', left: tooltip.x, top: tooltip.y - 120, transform: 'translateX(-50%)', zIndex: 1000, pointerEvents: 'none' }}
                className="bg-[#0f1629] border border-[#1e3a5f] rounded-lg p-3 text-xs shadow-xl min-w-[180px]"
              >
                <div className="text-white font-medium text-sm mb-2">{tooltip.name}</div>
                <div className="flex justify-between mb-1">
                  <span className="text-muted/80">Risk Score</span>
                  <span className={`font-mono font-medium ${tooltip.riskScore >= 60 ? 'text-red-400' : tooltip.riskScore >= 40 ? 'text-amber-400' : 'text-green-400'}`}>
                    {tooltip.riskScore.toFixed(1)}
                  </span>
                </div>
                <div className="flex justify-between mb-1">
                  <span className="text-muted/80">Severity</span>
                  <span className={tooltip.severity === 'HIGH' ? 'text-red-400' : tooltip.severity === 'MEDIUM' ? 'text-amber-400' : 'text-green-400'}>
                    {tooltip.severity}
                  </span>
                </div>
                <div className="flex justify-between mb-1">
                  <span className="text-muted/80">Invoices</span>
                  <span className="text-cyan-400">{tooltip.totalInvoices}</span>
                </div>
                {tooltip.overdueAmount > 0 && (
                  <div className="flex justify-between mt-1 pt-1 border-t border-[#1e3a5f]">
                    <span className="text-muted/80">Overdue</span>
                    <span className="text-red-400">₹{(tooltip.overdueAmount / 100_000).toFixed(2)} L</span>
                  </div>
                )}
              </div>
            )}
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Supplier Risk Table */}
            <div className="lg:col-span-2 bg-surface border border-border rounded p-5">
              <p className="text-cyan text-xs uppercase tracking-widest font-sans mb-5">Supplier Health Overview</p>
              
              {initialLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-10" />
                  <Skeleton className="h-10" />
                  <Skeleton className="h-10" />
                </div>
              ) : sortedSuppliers.length === 0 ? (
                 <p className="text-muted text-sm font-mono text-center py-8">No suppliers found</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left font-sans border-collapse">
                    <thead>
                      <tr className="border-b border-border text-muted text-xs uppercase tracking-wider text-opacity-80">
                        <th className="pb-3 font-medium px-2">Supplier Name</th>
                        <th className="pb-3 font-medium px-2">Risk Score</th>
                        <th className="pb-3 font-medium px-2">Severity</th>
                        <th className="pb-3 font-medium text-right px-2">Pending Amount</th>
                        <th className="pb-3 font-medium text-right px-2">Overdue Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedSuppliers.map((s: any) => (
                        <tr 
                          key={s.companyId} 
                          className="hover:bg-cyan/5 transition-colors border-b border-border/30 last:border-0 group"
                        >
                          <td className="py-3 px-2 text-text text-sm font-medium">{s.companyName}</td>
                          <td className="py-3 px-2">
                            <div className="flex flex-col">
                              <span className="font-mono text-sm text-text">{s.riskScore.toFixed(1)}</span>
                              <div className="h-1 mt-1.5 w-16 bg-navy rounded-full overflow-hidden">
                                <div 
                                  className="h-full rounded-full"
                                  style={{ 
                                    width: `${s.riskScore}%`,
                                    backgroundColor: s.riskScore < 30 ? '#10b981' : s.riskScore < 60 ? '#f59e0b' : '#ef4444' 
                                  }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-2">
                            <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${SEVERITY_COLORS[s.severity] || SEVERITY_COLORS.GREEN}`}>
                              {s.severity || 'GREEN'}
                            </span>
                          </td>
                          <td className="py-3 px-2 text-right font-mono text-sm text-text/90 group-hover:text-cyan transition-colors">{formatINR(s.pendingAmount)}</td>
                          <td className="py-3 px-2 text-right font-mono text-sm text-danger group-hover:text-red-400 transition-colors">{formatINR(s.overdueAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Alerts Panel */}
            <div className="bg-surface border border-border rounded p-5 flex flex-col">
              <p className="text-cyan text-xs uppercase tracking-widest font-sans mb-4">Active Alerts</p>
              {initialLoading ? (
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
