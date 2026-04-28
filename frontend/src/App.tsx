import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './router/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import Register from './pages/Register';
import SupplierDashboard from './pages/SupplierDashboard';
import BuyerDashboard from './pages/BuyerDashboard';
import FinancierDashboard from './pages/FinancierDashboard';
import WhatIfSimulator from './pages/WhatIfSimulator';
import InvoicesPage from './pages/InvoicesPage';
import AlertsPage from './pages/AlertsPage';
import FinancingPage from './pages/FinancingPage';
import ErrorBoundary from './components/common/ErrorBoundary';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login"    element={<LoginPage />} />
        <Route path="/register" element={<Register />} />

        {/* Role dashboards */}
        <Route path="/supplier"  element={<ProtectedRoute><ErrorBoundary><SupplierDashboard /></ErrorBoundary></ProtectedRoute>} />
        <Route path="/buyer"     element={<ProtectedRoute><ErrorBoundary><BuyerDashboard /></ErrorBoundary></ProtectedRoute>} />
        <Route path="/financier" element={<ProtectedRoute><ErrorBoundary><FinancierDashboard /></ErrorBoundary></ProtectedRoute>} />
        <Route path="/simulation" element={<ProtectedRoute><ErrorBoundary><WhatIfSimulator /></ErrorBoundary></ProtectedRoute>} />

        {/* Sidebar pages */}
        <Route path="/invoices"  element={<ProtectedRoute><ErrorBoundary><InvoicesPage /></ErrorBoundary></ProtectedRoute>} />
        <Route path="/alerts"    element={<ProtectedRoute><ErrorBoundary><AlertsPage /></ErrorBoundary></ProtectedRoute>} />
        <Route path="/financing" element={<ProtectedRoute><ErrorBoundary><FinancingPage /></ErrorBoundary></ProtectedRoute>} />

        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
