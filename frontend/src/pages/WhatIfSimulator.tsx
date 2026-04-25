import { useState } from 'react';
import api from '../services/api';
import Sidebar from '../components/layout/Sidebar';
import { useAuthStore } from '../store/authStore';
import type { SimulationResult, SimulationRequest } from '../types/api';

// Hardcoded supplier list from requirements
const SUPPLIERS = [
  { id: 'bef4265a-3899-4fd2-a13a-cd96e328eb71', name: 'Patel Engineering Works' },
  { id: '21ee68f8-a5af-448d-b055-1de885725a82', name: 'Reddy Construction Materials' },
  { id: '9891ccf2-e015-4de5-9d9f-96fb0d90e62a', name: 'Agarwal Steel Fabricators' },
  { id: '7d4aa259-29e9-4992-be40-20e4802c2bc4', name: 'Sharma Textiles Pvt Ltd' },
  { id: '3a024242-e27d-45f8-83bf-5a55d35b7651', name: 'Gupta Auto Components' },
  { id: 'ef0443a2-8caa-435d-b2b4-235ad8175a98', name: 'Singh Packaging Solutions' },
  { id: 'e71aef68-9d27-4824-b571-9c18aacd9824', name: 'Kumar Electronics Mfg' },
  { id: 'e213ed92-eec6-485e-af76-9c906018f157', name: 'Nair Rubber Industries' },
  { id: '7c11be66-cf14-482b-8fbe-9862906e2345', name: 'Bose Electronics Components' },
  { id: '0b81addb-ee91-4a7c-b3cc-47bb7cdccb40', name: 'Pillai Garments Exports' },
  { id: '0c0ecb52-2235-4665-9ef1-89e3743f236e', name: 'Das Agro Products' },
  { id: 'b2f1eaf6-6b81-4d0d-859b-1466f42f97e1', name: 'Mishra Furniture Works' },
  { id: '57ae054e-fad3-42bc-9fd2-738d80573851', name: 'Joshi Food Processing' },
  { id: '0f57cc11-0866-4db7-8f5e-85f62a76face', name: 'Chauhan Dairy Products' },
  { id: 'fe247099-42eb-46cc-b6b6-bb339c7e4127', name: 'Pandey Logistics Services' },
  { id: '7e2a9c89-73d0-4f0f-b8ed-4706b0a53230', name: 'Rao Precision Parts' },
  { id: 'b3cfa7c9-e3e5-4a80-b1d0-ffba2b38fac7', name: 'Iyer Pharma Supplies' },
  { id: 'a874a6a7-8c4b-4df8-b11f-69db17cec5b4', name: 'Mehta Chemical Industries' },
];

function formatINR(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(value) || value === 0) return '₹0';
  if (value >= 1_00_00_000) return `₹${(value / 1_00_00_000).toFixed(3)} Cr`;
  if (value >= 1_00_000)    return `₹${(value / 1_00_000).toFixed(2)} L`;
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export default function WhatIfSimulator() {
  const companyId = useAuthStore((s) => s.companyId);

  const [scenarioType, setScenarioType] = useState<'PAYMENT_DELAY' | 'SUPPLIER_FAILURE'>('PAYMENT_DELAY');
  const [targetCompanyId, setTargetCompanyId] = useState(SUPPLIERS[0].id);
  const [delayDays, setDelayDays] = useState<number>(30);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SimulationResult | null>(null);

  const handleRunSimulation = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    const payload: SimulationRequest = {
      scenarioType,
      targetCompanyId,
      buyerId: 'b885e67f-609e-44c2-b1e8-04744c5579a4',
      ...(scenarioType === 'PAYMENT_DELAY' && { delayDays }),
      ...(scenarioType === 'SUPPLIER_FAILURE' && { supplierId: targetCompanyId })
    };

    try {
      const res = await api.post<any>('/api/simulation/whatif', payload);
      console.log('Simulation result:', res.data);
      
      const targetSupplier = SUPPLIERS.find(s => s.id === targetCompanyId);
      
      const mappedResult: SimulationResult = {
        scenarioType: payload.scenarioType,
        targetCompany: targetSupplier ? targetSupplier.name : 'Unknown',
        totalFinancialExposure: res.data.totalFinancialImpact,
        cascadeDepth: String(res.data.cascadeRisk ?? '0'),
        networkResilienceScore: res.data.r0AfterScenario,
        recommendation: res.data.recommendation,
        impactedCompanies: (res.data.supplierDetails || []).map((s: any) => {
          const riskIncrease = (s.projectedScore || 0) - (s.currentScore || 0);
          let severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
          if (riskIncrease > 30) severity = 'CRITICAL';
          else if (riskIncrease > 20) severity = 'HIGH';
          else if (riskIncrease > 10) severity = 'MEDIUM';
          
          return {
            companyId: s.supplierId || Math.random().toString(),
            companyName: s.supplierName,
            currentRiskScore: s.currentScore,
            projectedRiskScore: s.projectedScore,
            riskIncrease: riskIncrease,
            impactSeverity: severity,
          };
        }),
      };

      setResult(mappedResult);
    } catch (err) {
      console.error(err);
      setError('Simulation failed — check backend connection');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-navy text-text">
      <Sidebar companyName="What-If Simulator" />

      <main className="flex-1 flex flex-col overflow-y-auto">
        {/* Top bar */}
        <div className="sticky top-0 z-10 bg-surface/90 backdrop-blur border-b border-border px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-cyan font-sans font-bold text-2xl tracking-wider uppercase">What-If Simulator</h1>
            <p className="text-muted font-sans text-sm mt-1">
              Model supply chain stress scenarios before they happen
            </p>
          </div>
        </div>

        <div className="p-6 max-w-6xl mx-auto w-full space-y-8 pb-16">
          {error && (
            <div className="bg-danger/10 border border-danger rounded p-4 text-danger text-sm font-mono flex items-center gap-2">
              <svg className="shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              {error}
            </div>
          )}

          {/* Scenario Configuration Panel */}
          <div className="bg-surface border border-border rounded p-6 shadow-sm">
            <h2 className="text-cyan text-sm uppercase tracking-widest font-sans font-semibold mb-6">
              Scenario Configuration
            </h2>

            <div className="space-y-6">
              {/* Scenario Type */}
              <div className="flex gap-4">
                <button
                  className={`flex-1 overflow-hidden relative p-4 text-center font-sans font-medium uppercase tracking-wide border rounded transition-all duration-200 ${
                    scenarioType === 'PAYMENT_DELAY'
                      ? 'bg-cyan text-navy border-cyan shadow-[0_0_15px_rgba(0,212,255,0.3)]'
                      : 'bg-transparent text-cyan border-border hover:border-cyan/50 hover:bg-cyan/5'
                  }`}
                  onClick={() => setScenarioType('PAYMENT_DELAY')}
                >
                  Payment Delay
                </button>
                <button
                  className={`flex-1 overflow-hidden relative p-4 text-center font-sans font-medium uppercase tracking-wide border rounded transition-all duration-200 ${
                    scenarioType === 'SUPPLIER_FAILURE'
                      ? 'bg-danger text-navy border-danger shadow-[0_0_15px_rgba(239,68,68,0.3)]'
                      : 'bg-transparent text-danger border-border hover:border-danger/50 hover:bg-danger/5'
                  }`}
                  onClick={() => setScenarioType('SUPPLIER_FAILURE')}
                >
                  Supplier Failure
                </button>
              </div>

              {/* Target Company & Details */}
              <div className="grid grid-cols-2 gap-6">
                <div className="flex flex-col gap-2">
                  <label className="text-muted text-xs uppercase tracking-widest font-sans font-medium">
                    Target Company
                  </label>
                  <select
                    value={targetCompanyId}
                    onChange={(e) => setTargetCompanyId(e.target.value)}
                    className="bg-navy text-text border border-border focus:border-cyan outline-none rounded p-3 font-sans w-full cursor-pointer appearance-none"
                    style={{ backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '16px' }}
                  >
                    {SUPPLIERS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                {scenarioType === 'PAYMENT_DELAY' ? (
                  <div className="flex flex-col gap-2 fade-in">
                    <label className="text-muted text-xs uppercase tracking-widest font-sans font-medium">
                      Delay Days
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={delayDays}
                      onChange={(e) => setDelayDays(parseInt(e.target.value) || 0)}
                      className="bg-navy text-text border border-border focus:border-cyan outline-none rounded p-3 font-mono w-full"
                    />
                  </div>
                ) : (
                  <div className="flex flex-col justify-end">
                    <p className="text-muted text-sm font-sans mb-3 text-opacity-80">
                      Simulates immediate bankruptcy or total operational failure of the supplier.
                    </p>
                  </div>
                )}
              </div>

              {/* Action Button */}
              <button
                className={`mt-4 w-full py-4 rounded font-sans font-bold text-lg uppercase tracking-wider transition-all duration-300
                  ${
                    loading
                      ? 'opacity-50 cursor-not-allowed bg-border text-muted border border-border'
                      : scenarioType === 'PAYMENT_DELAY'
                      ? 'bg-cyan text-navy hover:bg-[#33ddff] hover:shadow-[0_0_20px_rgba(0,212,255,0.4)]'
                      : 'bg-danger text-navy hover:bg-[#f87171] hover:shadow-[0_0_20px_rgba(2ef,68,68,0.4)]'
                  }`}
                onClick={handleRunSimulation}
                disabled={loading}
              >
                {loading ? (
                  <div className="flex items-center justify-center gap-3">
                    <svg className="animate-spin h-5 w-5 border-2 border-navy border-t-transparent rounded-full" viewBox="0 0 24 24"></svg>
                    SIMULATING...
                  </div>
                ) : (
                  'RUN SIMULATION'
                )}
              </button>
            </div>
          </div>

          {/* Results Panel */}
          {result && (
            <div className="animate-fade-in space-y-8">
              <div className="border-b border-border pb-4 flex flex-col gap-1">
                <h2 className="text-text font-sans font-bold text-xl tracking-wide uppercase">
                  SIMULATION RESULTS
                </h2>
                <p className="text-muted text-sm font-sans">
                  Scenario: <span className="text-text font-medium">{result.scenarioType.replace('_', ' ')}</span> &mdash; Target: <span className="text-text font-medium">{result.targetCompany}</span>
                </p>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-6">
                <div className="bg-surface border border-border rounded p-6 shadow-sm border-t-4 border-t-danger relative overflow-hidden group hover:border-border transition-colors">
                  <div className="absolute inset-0 bg-danger/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                  <p className="text-muted text-xs uppercase tracking-widest font-sans mb-3 font-medium">
                    Total Financial Exposure
                  </p>
                  <p className="font-mono text-3xl font-bold text-danger">
                    {formatINR(result.totalFinancialExposure ?? 0)}
                  </p>
                </div>

                <div className="bg-surface border border-border rounded p-6 shadow-sm border-t-4 border-t-amber relative overflow-hidden group hover:border-border transition-colors">
                  <div className="absolute inset-0 bg-amber/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                  <p className="text-muted text-xs uppercase tracking-widest font-sans mb-3 font-medium">
                    Cascade Depth
                  </p>
                  <div className="flex items-baseline gap-2">
                    <p className="font-mono text-3xl font-bold text-amber">
                      {result.cascadeDepth ?? 0}
                    </p>
                    <p className="text-muted text-sm font-sans">tiers deep</p>
                  </div>
                </div>

                <div className="bg-surface border border-border rounded p-6 shadow-sm border-t-4 border-t-cyan relative overflow-hidden group hover:border-border transition-colors">
                  <div className="absolute inset-0 bg-cyan/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                  <p className="text-muted text-xs uppercase tracking-widest font-sans mb-3 font-medium">
                    Network Resilience Score
                  </p>
                  <p
                    className={`font-mono text-3xl font-bold ${
                      (result.networkResilienceScore ?? 0) > 70
                        ? 'text-success'
                        : (result.networkResilienceScore ?? 0) >= 40
                        ? 'text-amber'
                        : 'text-danger'
                    }`}
                  >
                    {(result.networkResilienceScore ?? 0).toFixed(1)}
                  </p>
                </div>
              </div>

              {/* Impact Analysis Table */}
              <div className="bg-surface border border-border rounded shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-border bg-[#0f1629]">
                  <h3 className="text-cyan text-sm uppercase tracking-widest font-sans font-semibold">
                    Impacted Companies
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left font-sans text-sm">
                    <thead className="bg-[#151f32] text-muted border-b border-border font-medium">
                      <tr>
                        <th className="px-6 py-4 uppercase tracking-wider">Company Name</th>
                        <th className="px-6 py-4 uppercase tracking-wider">Current Risk</th>
                        <th className="px-6 py-4 uppercase tracking-wider">Projected Risk</th>
                        <th className="px-6 py-4 uppercase tracking-wider">Risk Increase</th>
                        <th className="px-6 py-4 uppercase tracking-wider">Severity</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {[...(result.impactedCompanies ?? [])]
                        .sort((a, b) => (b.riskIncrease ?? 0) - (a.riskIncrease ?? 0))
                        .map((company) => {
                          const isCritical = company.impactSeverity === 'CRITICAL';
                          return (
                            <tr
                              key={company.companyId}
                              className={`transition-colors hover:bg-[#1a253c] ${
                                isCritical ? 'bg-danger/5 hover:bg-danger/10' : ''
                              }`}
                            >
                              <td className="px-6 py-4 text-text font-medium">{company.companyName}</td>
                              <td className="px-6 py-4 font-mono text-cyan">{(company.currentRiskScore ?? 0).toFixed(1)}</td>
                              <td className="px-6 py-4 font-mono text-danger font-medium">{(company.projectedRiskScore ?? 0).toFixed(1)}</td>
                              <td className="px-6 py-4 font-mono text-danger font-medium">
                                <div className="flex items-center gap-1.5">
                                  +{(company.riskIncrease ?? 0).toFixed(1)}
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-danger">
                                    <polyline points="18 15 12 9 6 15"></polyline>
                                  </svg>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <span
                                  className={`text-xs font-mono px-3 py-1 rounded border tracking-wider font-semibold ${
                                    company.impactSeverity === 'LOW'
                                      ? 'bg-cyan/10 text-cyan border-cyan/30'
                                      : company.impactSeverity === 'MEDIUM'
                                      ? 'bg-amber/10 text-amber border-amber/30'
                                      : company.impactSeverity === 'HIGH'
                                      ? 'bg-orange-400/10 text-orange-400 border-orange-400/30'
                                      : 'bg-danger/10 text-danger border-danger/30'
                                  }`}
                                >
                                  {company.impactSeverity}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Recommendation Panel */}
              <div
                className={`bg-surface border rounded p-6 shadow-sm border-l-4 ${
                  scenarioType === 'SUPPLIER_FAILURE' ? 'border-l-danger' : 'border-l-amber'
                }`}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className={`p-2 rounded-full ${scenarioType === 'SUPPLIER_FAILURE' ? 'bg-danger/10 text-danger' : 'bg-amber/10 text-amber'}`}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                    </svg>
                  </div>
                  <h3 className="text-cyan text-sm uppercase tracking-widest font-sans font-bold">
                    AI Recommendation
                  </h3>
                </div>
                <p className="text-text tracking-wide text-lg font-sans leading-relaxed">
                  {result.recommendation}
                </p>
              </div>
            </div>
          )}
        </div>
      </main>
      
      {/* Add a global style for the simple fade-in if not in tailwind config */}
      <style>{`
        .animate-fade-in {
          animation: fadeIn 0.4s ease-out forwards;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
