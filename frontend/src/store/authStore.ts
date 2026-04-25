import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  token: string | null;
  role: string | null;
  companyId: string | null;
  companyName: string | null;
  isAuthenticated: boolean;
  login: (token: string, role: string, companyId: string, companyName: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      role: null,
      companyId: null,
      companyName: null,
      isAuthenticated: false,

      login: (token, role, companyId, companyName) =>
        set({ token, role, companyId, companyName, isAuthenticated: true }),

      logout: () =>
        set({ token: null, role: null, companyId: null, companyName: null, isAuthenticated: false }),
    }),
    {
      name: 'auth-storage',
    }
  )
);
