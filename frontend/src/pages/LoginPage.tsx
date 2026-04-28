import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import AuthBackground from '../components/common/AuthBackground';

interface LoginResponse {
  token: string;
  role: string;
  companyId: string;
  companyName: string;
}

const ROLE_ROUTES: Record<string, string> = {
  SUPPLIER: '/supplier',
  BUYER: '/buyer',
  FINANCIER: '/financier',
};

export default function LoginPage() {
  const navigate = useNavigate();
  const login    = useAuthStore((s) => s.login);

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const clearError = () => { if (error) setError(null); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post<LoginResponse>('/api/auth/login', { email, password });
      login(data.token, data.role, data.companyId, data.companyName);
      navigate(ROLE_ROUTES[data.role] ?? '/login', { replace: true });
    } catch {
      setError('Invalid credentials. Access denied.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-navy">
      <AuthBackground />

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center px-8 py-12 bg-navy">
        <div className="w-full max-w-[380px]">
          <div className="bg-surface border border-border rounded-lg p-8 glow-cyan">
            {/* Logo */}
            <div className="flex flex-col items-center mb-8">
              <div className="w-10 h-10 rounded-full bg-cyan/10 border border-cyan flex items-center justify-center mb-3">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="4" fill="#00d4ff" />
                  <circle cx="10" cy="10" r="8" stroke="#00d4ff" strokeWidth="1.5" strokeDasharray="3 2" />
                </svg>
              </div>
              <h1 className="text-cyan font-sans font-bold text-2xl tracking-tight">Liquidity Orchestrator</h1>
              <p className="text-muted text-xs mt-1 text-center tracking-wide">
                Real-Time Supply Chain Liquidity Intelligence
              </p>
            </div>

            <form onSubmit={handleSubmit} noValidate>
              <div className="mb-4">
                <label className="block text-muted text-xs font-sans uppercase tracking-widest mb-1.5">Email</label>
                <input
                  type="email" value={email}
                  onChange={(e) => { setEmail(e.target.value); clearError(); }}
                  placeholder="user@company.in" required autoComplete="email"
                  className="w-full bg-navy border border-border rounded px-3 py-2.5 font-mono text-sm text-text placeholder:text-muted focus:outline-none focus:border-cyan transition-colors"
                />
              </div>

              <div className="mb-6">
                <label className="block text-muted text-xs font-sans uppercase tracking-widest mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'} value={password}
                    onChange={(e) => { setPassword(e.target.value); clearError(); }}
                    placeholder="••••••••" required autoComplete="current-password"
                    className="w-full bg-navy border border-border rounded px-3 py-2.5 pr-10 font-mono text-sm text-text placeholder:text-muted focus:outline-none focus:border-cyan transition-colors"
                  />
                  <button type="button" onClick={() => setShowPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-cyan transition-colors"
                    aria-label={showPass ? 'Hide password' : 'Show password'}>
                    {showPass ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <div className="mb-4 px-3 py-2.5 rounded border border-danger bg-danger/10 text-danger text-sm font-mono">
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading}
                className="w-full bg-cyan text-navy font-sans font-semibold text-sm uppercase tracking-widest py-3 rounded transition-all hover:shadow-[0_0_20px_rgba(0,212,255,0.4)] disabled:opacity-60 disabled:cursor-not-allowed">
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                    </svg>
                    Authenticating...
                  </span>
                ) : 'Sign In'}
              </button>
            </form>

            <p className="mt-5 text-center text-xs text-muted">
              Don't have an account?{' '}
              <Link to="/register" className="text-cyan hover:underline">Sign up</Link>
            </p>

            <div className="mt-4 flex items-center justify-center gap-1.5 text-muted text-xs">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <span>Secured with JWT Authentication</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
