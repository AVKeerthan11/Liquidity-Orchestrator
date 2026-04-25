import React, { useEffect, useState, useRef, useMemo } from 'react';
import cytoscape from 'cytoscape';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
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

// ── Main Dashboard ─────────────────────────────────────────────────────────────

export default function BuyerDashboard() {
  const companyId = useAuthStore((s) => s.companyId) ?? '';

  const [dashboard, setDashboard] = useState<BuyerDashboardData | null>(null);
  const [network, setNetwork]     = useState<GraphNetwork | null>(null);
  const [fsri, setFsri]           = useState<FsriResponse | null>(null);
  const [alerts, setAlerts]       = useState<Alert[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [now, setNow]             = useState(new Date());

  const cyRef = useRef<HTMLDivElement>(null);
  const cyInstance = useRef<cytoscape.Core | null>(null);

  // Clock tick
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Fetch API
  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    
    Promise.allSettled([
      api.get<BuyerDashboardData>(`/api/dashboard/buyer/${companyId}`),
      api.get<GraphNetwork>(`/api/graph/network/${companyId}`),
      api.get<FsriResponse>(`/api/graph/cascade-risk/${companyId}`),
      api.get<Alert[]>(`/api/alerts/active/${companyId}`),
    ]).then(([dashRes, netRes, fsriRes, alertRes]) => {
      if (dashRes.status === 'fulfilled') {
        setDashboard(dashRes.value.data);
      } else setError('Failed to load dashboard data.');
      
      if (netRes.status === 'fulfilled') {
        setNetwork(netRes.value.data);
      }
      if (fsriRes.status === 'fulfilled') {
        setFsri(fsriRes.value.data);
      }
      if (alertRes.status === 'fulfilled' && Array.isArray(alertRes.value.data)) setAlerts(alertRes.value.data);
      
    }).finally(() => setLoading(false));
  }, [companyId]);

  // Cytoscape Init
  useEffect(() => {
    if (!cyRef.current || !network || network.nodes.length === 0) return;

    const elements: cytoscape.ElementDefinition[] = [];
    
    network.nodes.forEach(n => {
      const { id, label, type, riskScore } = n.data;
      let color = '#ccc';
      let size = 35;
      
      if (type === 'BUYER') {
        color = '#00d4ff'; // cyan
        size = 50;
      } else if (type === 'FINANCIER') {
        color = '#a855f7'; // purple
        size = 30;
      } else {
        // SUPPLIER
        if (riskScore < 30) color = '#10b981'; // green
        else if (riskScore <= 60) color = '#f59e0b'; // amber
        else color = '#ef4444'; // red
      }
      
      elements.push({
        data: { id, name: label, type, riskScore },
        style: {
          'background-color': color,
          'width': size,
          'height': size,
          'label': label,
          'text-valign': 'bottom',
          'text-margin-y': 6,
          'color': '#e2e8f0',
          'font-size': '10px',
          'font-family': 'Inter'
        }
      });
    });

    network.edges.forEach(e => {
      const { source, target, status, amount } = e.data;
      let lineColor = '#ccc';
      let width = 1.5;
      
      if (status === 'PAID') {
        lineColor = '#064e3b'; // subtle green
      } else if (status === 'PENDING') {
        lineColor = '#b45309'; // subtle amber
      } else if (status === 'OVERDUE') {
        lineColor = '#ef4444'; // red
        width = 3;
      }

      elements.push({
        data: { source, target, status, amount },
        style: {
          'line-color': lineColor,
          'width': width,
          'target-arrow-color': lineColor,
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          'arrow-scale': status === 'OVERDUE' ? 1.2 : 1
        }
      });
    });

    cyInstance.current = cytoscape({
      container: cyRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'label': 'data(name)',
          }
        }
      ],
      layout: {
        name: 'cose',
        idealEdgeLength: 200,
        nodeOverlap: 50,
        refresh: 20,
        fit: true,
        padding: 60,
        randomize: true,
        componentSpacing: 150,
        nodeRepulsion: 8000,
        edgeElasticity: 150,
        nestingFactor: 5,
        gravity: 0.3,
        numIter: 1000,
        initialTemp: 200,
        coolingFactor: 0.95,
        minTemp: 1.0
      }
    });

    const tooltip = document.createElement('div');
    tooltip.style.position = 'absolute';
    tooltip.style.display = 'none';
    tooltip.style.backgroundColor = '#0f1629';
    tooltip.style.border = '1px solid #1e2d4a';
    tooltip.style.padding = '8px 12px';
    tooltip.style.borderRadius = '4px';
    tooltip.style.color = '#e2e8f0';
    tooltip.style.fontSize = '12px';
    tooltip.style.fontFamily = 'Inter';
    tooltip.style.zIndex = '100';
    tooltip.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
    tooltip.style.pointerEvents = 'none';
    cyRef.current.appendChild(tooltip);

    cyInstance.current.on('tap', 'node', function(evt){
      const node = evt.target;
      const pos = node.renderedPosition();
      
      tooltip.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 2px;">${node.data('name')}</div>
        <div style="color: #64748b; font-size: 10px; margin-bottom: 4px;">TYPE: ${node.data('type')}</div>
        ${node.data('type') === 'SUPPLIER' ? `<div>Risk Score: <span style="font-family: monospace; color: #00d4ff;">${(node.data('riskScore') || 0).toFixed(1)}</span></div>` : ''}
      `;
      tooltip.style.display = 'block';
      tooltip.style.left = (pos.x + 15) + 'px';
      tooltip.style.top = (pos.y - 15) + 'px';
    });
    
    cyInstance.current.on('tap', function(evt){
      if(evt.target === cyInstance.current) {
        tooltip.style.display = 'none';
      }
    });

    return () => {
      if (cyInstance.current) {
        cyInstance.current.destroy();
        cyInstance.current = null;
      }
      if (cyRef.current && tooltip.parentNode === cyRef.current) {
        cyRef.current.removeChild(tooltip);
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
    const r0 = dashboard.r0Score;
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
            {loading ? (
              <Skeleton className="h-5 w-40" />
            ) : (
              <h1 className="text-text font-sans font-semibold text-base">{companyName}</h1>
            )}
            {!loading && dashboard && (
              <span className={`text-xs font-mono px-2.5 py-1 rounded border tracking-wide shadow-sm ${
                dashboard.atRiskSuppliers > 0 ? 'text-danger border-danger bg-danger/10 shadow-danger/20' : 'text-success border-success bg-success/10 shadow-success/20'
              }`}>
                {dashboard.atRiskSuppliers > 0 ? `${dashboard.atRiskSuppliers} AT RISK` : 'HEALTHY'}
              </span>
            )}
          </div>
          <span className="text-muted font-mono text-xs">
            {now.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
            {' '}
            {now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>

        <div className="px-6 py-6 space-y-6">
          {/* Metric cards */}
          <div className="grid grid-cols-4 gap-4">
            {loading ? (
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
            {/* Ambient background glow based on R0 */}
            <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] blur-[100px] rounded-full pointer-events-none opacity-10 transition-colors duration-1000 ${
              r0Label === 'CONTAINED' ? 'bg-success' : r0Label === 'SPREADING' ? 'bg-amber' : 'bg-danger'
            }`} />
            
            <h2 className="text-cyan text-sm uppercase tracking-widest font-sans font-semibold mb-8 z-10">CONTAGION INDEX — R0</h2>
             
            {loading ? (
               <Skeleton className="h-24 w-48 mb-4 z-10" />
            ) : (
              <div className="flex flex-col items-center w-full max-w-3xl z-10">
                <div className={`font-mono text-[7rem] leading-none mb-3 tracking-tighter ${r0Color}`} style={{ textShadow: `0 0 40px var(--color-${r0Label === 'CONTAINED' ? 'success' : r0Label === 'SPREADING' ? 'amber' : 'danger'})`}}>
                  {dashboard?.r0Score.toFixed(2)}
                </div>
                <div className={`text-xs font-mono font-semibold tracking-widest px-4 py-1.5 rounded-full border mb-12 shadow-sm ${
                   r0Label === 'CONTAINED' ? SEVERITY_COLORS['GREEN'] : r0Label === 'SPREADING' ? SEVERITY_COLORS['YELLOW'] : SEVERITY_COLORS['RED']
                }`}>
                  {r0Label}
                </div>
                 
                <div className="w-full">
                  <div className="flex justify-between text-xs text-muted mb-3 font-mono">
                    <span>STABLE (0.0)</span>
                    <span className={r0Label === 'CRITICAL' ? 'text-danger' : ''}>CRITICAL (3.0+)</span>
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
                    R0 represents financial stress reproduction number. Values above 1.0 indicate stress is spreading through your supply chain network.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* FSRI Cascade Risk Panel */}
          <div className="bg-surface border border-border rounded p-5">
            <div className="mb-5">
              <p className="text-cyan text-xs uppercase tracking-widest font-sans font-semibold">NETWORK CRITICALITY — FSRI</p>
              <p className="text-muted text-xs font-sans mt-0.5">Financial Stress Resilience Index — suppliers ranked by cascade impact</p>
            </div>

            {loading ? (
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
                       <th className="pb-3 font-medium px-2 w-1/3">FSRI Score</th>
                       <th className="pb-3 font-medium text-right px-2">Centrality</th>
                       <th className="pb-3 font-medium text-right px-2">Criticality</th>
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
              <p className="text-cyan text-xs uppercase tracking-widest font-sans">SUPPLY CHAIN NETWORK</p>
              {!loading && (network?.nodes.length ?? 0) > 0 && (
                <div className="flex gap-2 relative z-10">
                  <button onClick={() => cyInstance.current?.zoom(cyInstance.current.zoom() * 1.2)} className="bg-navy hover:bg-cyan/10 text-cyan border border-border hover:border-cyan/50 rounded w-6 h-6 flex items-center justify-center font-mono cursor-pointer transition-all" title="Zoom In">+</button>
                  <button onClick={() => cyInstance.current?.zoom(cyInstance.current.zoom() * 0.8)} className="bg-navy hover:bg-cyan/10 text-cyan border border-border hover:border-cyan/50 rounded w-6 h-6 flex items-center justify-center font-mono cursor-pointer transition-all" title="Zoom Out">-</button>
                </div>
              )}
            </div>
            {loading ? (
              <Skeleton className="h-[500px] w-full" />
            ) : network?.nodes.length === 0 ? (
              <div className="h-[500px] flex items-center justify-center bg-navy rounded border border-border/50">
                <p className="text-muted font-mono">No network data available</p>
              </div>
            ) : (
              <div 
                ref={cyRef} 
                className="h-[500px] w-full bg-navy rounded border border-border/50 relative z-0"
              />
            )}
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Supplier Risk Table */}
            <div className="lg:col-span-2 bg-surface border border-border rounded p-5">
              <p className="text-cyan text-xs uppercase tracking-widest font-sans mb-5">SUPPLIER RISK OVERVIEW</p>
              
              {loading ? (
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
