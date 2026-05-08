import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  SupplierDashboard,
  BuyerDashboardData,
  FinancierDashboardData,
  GraphNetwork,
} from '../types/api';

export const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface DashboardCache {
  supplierData: SupplierDashboard | null;
  supplierFetchedAt: number | null;

  buyerData: BuyerDashboardData | null;
  buyerNetwork: GraphNetwork | null;
  buyerFetchedAt: number | null;

  financierData: FinancierDashboardData | null;
  financierFetchedAt: number | null;

  setSupplierData:  (data: SupplierDashboard) => void;
  setBuyerData:     (data: BuyerDashboardData, network: GraphNetwork | null) => void;
  setFinancierData: (data: FinancierDashboardData) => void;
  clearCache:       () => void;
}

export const useDashboardStore = create<DashboardCache>()(
  persist(
    (set) => ({
      supplierData:       null,
      supplierFetchedAt:  null,
      buyerData:          null,
      buyerNetwork:       null,
      buyerFetchedAt:     null,
      financierData:      null,
      financierFetchedAt: null,

      setSupplierData:  (data) => set({ supplierData: data, supplierFetchedAt: Date.now() }),
      setBuyerData:     (data, network) => set({ buyerData: data, buyerNetwork: network, buyerFetchedAt: Date.now() }),
      setFinancierData: (data) => set({ financierData: data, financierFetchedAt: Date.now() }),

      clearCache: () => set({
        supplierData: null, supplierFetchedAt: null,
        buyerData:    null, buyerNetwork: null, buyerFetchedAt: null,
        financierData: null, financierFetchedAt: null,
      }),
    }),
    { 
      name: 'netcredix-dashboard-cache',
      // Only persist data fields — functions are not serializable
      partialize: (state) => ({
        supplierData:       state.supplierData,
        supplierFetchedAt:  state.supplierFetchedAt,
        buyerData:          state.buyerData,
        buyerNetwork:       state.buyerNetwork,
        buyerFetchedAt:     state.buyerFetchedAt,
        financierData:      state.financierData,
        financierFetchedAt: state.financierFetchedAt,
      }),
    }
  )
);

export function isCacheFresh(fetchedAt: number | null): boolean {
  if (!fetchedAt) return false;
  return (Date.now() - fetchedAt) < CACHE_TTL_MS;
}

export function timeAgo(fetchedAt: number | null): string {
  if (!fetchedAt) return '';
  const diffMs  = Date.now() - fetchedAt;
  const diffMin = Math.floor(diffMs / 60000);
  const diffSec = Math.floor((diffMs % 60000) / 1000);
  if (diffMin === 0) return `${diffSec}s ago`;
  return `${diffMin}m ago`;
}
