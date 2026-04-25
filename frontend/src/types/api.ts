export interface CashFlowForecast {
  predictedShortfall: number | null;
  daysUntilShortfall: number | null;
  confidence: number | null;
}

export interface SupplierDashboard {
  companyName: string;
  totalInvoices: number;
  pendingInvoices: number;
  overdueInvoices: number;
  totalPendingAmount: number;
  riskScore: number;
  riskSeverity: Severity;
  activeAlerts: Alert[];
  financingOffers: FinancingOffer[];
  recentInvoices: Invoice[];
  cashFlowForecast?: CashFlowForecast | null;
}

export type Severity = 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';

export interface RiskScore {
  companyId: string;
  score: number;
  severity: Severity;
  calculatedAt: string;
}

export interface RiskHistoryPoint {
  score: number;
  calculatedAt: string;
}

export interface Alert {
  id: string;
  message: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  createdAt: string;
  companyId?: string;
}

export interface FinancingOffer {
  id: string;
  supplierId?: string;
  type: 'EARLY_PAYMENT' | 'INVOICE_DISCOUNTING' | 'MICRO_CREDIT';
  // Fields from FinancingOptionResponse (GET /api/financing/options)
  originalAmount?: number;
  receivableAmount?: number;
  // Fields from FinancingOfferResponse (GET /api/dashboard)
  amount?: number;
  cost: number;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  createdAt?: string;
  routingScore?: number;
  speedDays?: number;
  probability?: number;
  recommended?: boolean;
}

export interface Invoice {
  id: string;
  supplierId: string;
  supplierName: string;
  buyerId: string;
  buyerName: string;
  amount: number;
  dueDate: string;
  status: 'PENDING' | 'PAID' | 'OVERDUE';
  createdAt: string;
}

export interface BuyerSupplier {
  companyId: string;
  companyName: string;
  riskScore: number;
  severity: Severity;
  pendingAmount: number;
  overdueAmount: number;
}

export interface BuyerDashboardData {
  companyName: string;
  supplyChainHealthScore: number;
  totalSuppliers: number;
  atRiskSuppliers: number;
  totalOutstandingPayables: number;
  supplierNetwork: GraphNetwork;
  criticalAlerts: Alert[];
  r0Score: number;
  contagionStatus: string;
  contagionInterpretation: string;
  infectedSuppliers: number;
  exposedSuppliers: number;
}

export interface GraphNode {
  data: {
    id: string;
    label: string;
    type: 'SUPPLIER' | 'BUYER' | 'FINANCIER';
    riskScore: number;
  };
}

export interface GraphEdge {
  data: {
    source: string;
    target: string;
    amount: number;
    status: 'PENDING' | 'PAID' | 'OVERDUE';
  };
}

export interface GraphNetwork {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface ActiveOffer {
  id: string;
  supplierId: string;
  type: 'EARLY_PAYMENT' | 'INVOICE_DISCOUNTING' | 'MICRO_CREDIT';
  amount: number;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
}

export interface CoalitionFinancier {
  financierId: string;
  financierName: string;
  shapleyValue: number;
  allocation: number;
  percentage: number;
}

export interface FinancierCoalition {
  totalValue: number;
  financiers: CoalitionFinancier[];
}

export interface FinancierDashboardData {
  companyName: string;
  totalPortfolioValue: number;
  offersByType: Record<string, number>;
  averageRiskScore: number;
  totalOpportunities: number;
  activeOffers: ActiveOffer[];
  coalition: FinancierCoalition | null;
}

export interface ImpactedCompany {
  companyId: string;
  companyName: string;
  currentRiskScore: number;
  projectedRiskScore: number;
  riskIncrease: number;
  impactSeverity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface SimulationResult {
  scenarioType: string;
  targetCompany: string;
  impactedCompanies: ImpactedCompany[];
  totalFinancialExposure: number;
  cascadeDepth: string;
  networkResilienceScore: number;
  recommendation: string;
}

export interface SimulationRequest {
  scenarioType: 'PAYMENT_DELAY' | 'SUPPLIER_FAILURE';
  targetCompanyId: string;
  buyerId: string;
  delayDays?: number;
  supplierId?: string;
}

export interface FsriSupplier {
  supplierId: string;
  supplierName: string;
  fsriScore: number;
  directLoss: number;
  centralityScore: number;
  riskScore: number;
  criticalityLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface FsriResponse {
  totalNetworkValue: number;
  networkResilienceScore: number;
  suppliers: FsriSupplier[];
}

export interface ResearchComparisonResponse {
  companyId: string;
  companyName: string;
  traditionalScore: number;
  networkAwareScore: number;
  difference: number;
  underestimated: boolean;
  traditionalMethod: string;
  networkAwareMethod: string;
  riskFactors: {
    overdueRatio: number;
    avgDelayDays: number;
    neighborStress: number;
  };
  conclusion: string;
  paperReference: string;
}
