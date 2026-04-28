import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const api = axios.create({
  baseURL: 'http://localhost:8081',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ── Typed helpers ──────────────────────────────────────────────────────────────

export const invoiceApi = {
  getByCompany: (companyId: string) =>
    api.get(`/api/invoices/company/${companyId}`),
  create: (payload: Record<string, unknown>) =>
    api.post('/api/invoices', payload),
};

export const alertApi = {
  getActive: (companyId: string) =>
    api.get(`/api/alerts/active/${companyId}`),
};

export const financingApi = {
  getOptions: (companyId: string) =>
    api.get(`/api/financing/options/${companyId}`),
  accept: (optionId: string) =>
    api.post(`/api/financing/accept/${optionId}`),
};

export default api;
