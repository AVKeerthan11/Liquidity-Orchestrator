import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import AuthBackground from '../components/common/AuthBackground';

interface RegisterResponse {
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

const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

type RoleOption = 'SUPPLIER' | 'BUYER' | 'FINANCIER';

const ROLE_OPTIONS: { value: RoleOption; label: string; icon: React.ReactNode; desc: string }[] = [
  {
    value: 'SUPPLIER',
    label: 'Supplier',
    desc: 'I deliver goods and wait to get paid',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
        <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
      </svg>
    ),
  },
  {
    value: 'BUYER',
    label: 'Buyer',
    desc: 'I owe money to suppliers',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    ),
  },
  {
    value: 'FINANCIER',
    label: 'Financier',
    desc: 'I fund rescue operations',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="12" y1="1" x2="12" y2="23"/>
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
      </svg>
    ),
  },
];

export default function Register() {
  const navigate = useNavigate();
  const login    = useAuthStore((s) => s.login);

  const [companyName, setCompanyName] = useState('');
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [gstNumber,   setGstNumber]   = useState('');
  const [role,        setRole]        = useState<RoleOption>('SUPPLIER');
  const [showPass,    setShowPass]    = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!companyName.trim()) errs.companyName = 'Company name is required';
    if (!email.trim())       errs.email = 'Email is required';
    if (!password)           errs.password = 'Password is required';
    if (password.length < 6) errs.password = 'Password must be at least 6 characters';
    if (password !== confirmPass) errs.confirmPass = 'Passwords do not match';
    if (!gstNumber.trim())   errs.gstNumber = 'GST number is required';
    else if (!GST_REGEX.test(gstNumber.toUpperCase())) errs.gstNumber = 'Invalid GST format (e.g. 22AAAAA0000A1Z5)';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post<RegisterResponse>('/api/auth/register', {
        companyName: companyName.trim(),
        email: email.trim(),
        password,
        gstNumber: gstNumber.toUpperCase().trim(),
        role,
      });
      login(data.token, data.role, data.companyId, data.companyName);
      navigate(ROLE_ROUTES[data.role] ?? '/login', { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fe = fieldErrors;

  return (
    <div className="min-h-screen flex bg-navy">
      <AuthBackground />

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center px-8 py-12 bg-navy overflow-y-auto">
        <div className="w-full max-w-[420px]">
          <div className="bg-surface border border-border rounded-lg p-8">
            <div className="flex flex-col items-center mb-7">
              <div className="w-10 h-10 rounded-full bg-cyan/10 border border-cyan flex items-center justify-center mb-3">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="4" fill="#00d4ff"/>
                  <circle cx="10" cy="10" r="8" stroke="#00d4ff" strokeWidth="1.5" strokeDasharray="3 2"/>
                </svg>
              </div>
              <h1 className="text-cyan font-sans font-bold text-2xl tracking-tight">Create Account</h1>
              <p className="text-muted text-xs mt-1 text-center">Join the liquidity network</p>
            </div>

            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              {/* Company Name */}
              <div>
                <label className="block text-muted text-xs font-sans uppercase tracking-widest mb-1.5">Full Company Name</label>
                <input type="text" value={companyName}
                  onChange={e => { setCompanyName(e.target.value); setFieldErrors(p => ({...p, companyName: ''})); }}
                  placeholder="Acme Textiles Pvt Ltd"
                  className="w-full bg-navy border border-border rounded px-3 py-2.5 font-mono text-sm text-text placeholder:text-muted focus:outline-none focus:border-cyan transition-colors"/>
                {fe.companyName && <p className="text-danger text-xs mt-1">{fe.companyName}</p>}
              </div>

              {/* Email */}
              <div>
                <label className="block text-muted text-xs font-sans uppercase tracking-widest mb-1.5">Work Email</label>
                <input type="email" value={email}
                  onChange={e => { setEmail(e.target.value); setFieldErrors(p => ({...p, email: ''})); }}
                  placeholder="you@company.in"
                  className="w-full bg-navy border border-border rounded px-3 py-2.5 font-mono text-sm text-text placeholder:text-muted focus:outline-none focus:border-cyan transition-colors"/>
                {fe.email && <p className="text-danger text-xs mt-1">{fe.email}</p>}
              </div>

              {/* Password */}
              <div>
                <label className="block text-muted text-xs font-sans uppercase tracking-widest mb-1.5">Password</label>
                <div className="relative">
                  <input type={showPass ? 'text' : 'password'} value={password}
                    onChange={e => { setPassword(e.target.value); setFieldErrors(p => ({...p, password: ''})); }}
                    placeholder="Min 6 characters"
                    className="w-full bg-navy border border-border rounded px-3 py-2.5 pr-10 font-mono text-sm text-text placeholder:text-muted focus:outline-none focus:border-cyan transition-colors"/>
                  <button type="button" onClick={() => setShowPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-cyan transition-colors">
                    {showPass ? (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    ) : (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    )}
                  </button>
                </div>
                {fe.password && <p className="text-danger text-xs mt-1">{fe.password}</p>}
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-muted text-xs font-sans uppercase tracking-widest mb-1.5">Confirm Password</label>
                <input type="password" value={confirmPass}
                  onChange={e => { setConfirmPass(e.target.value); setFieldErrors(p => ({...p, confirmPass: ''})); }}
                  placeholder="••••••••"
                  className="w-full bg-navy border border-border rounded px-3 py-2.5 font-mono text-sm text-text placeholder:text-muted focus:outline-none focus:border-cyan transition-colors"/>
                {fe.confirmPass && <p className="text-danger text-xs mt-1">{fe.confirmPass}</p>}
              </div>

              {/* GST Number */}
              <div>
                <label className="block text-muted text-xs font-sans uppercase tracking-widest mb-1.5">GST Number</label>
                <input type="text" value={gstNumber}
                  onChange={e => { setGstNumber(e.target.value.toUpperCase()); setFieldErrors(p => ({...p, gstNumber: ''})); }}
                  placeholder="22AAAAA0000A1Z5" maxLength={15}
                  className="w-full bg-navy border border-border rounded px-3 py-2.5 font-mono text-sm text-text placeholder:text-muted focus:outline-none focus:border-cyan transition-colors uppercase"/>
                {fe.gstNumber && <p className="text-danger text-xs mt-1">{fe.gstNumber}</p>}
              </div>

              {/* Account Type — segmented control */}
              <div>
                <label className="block text-muted text-xs font-sans uppercase tracking-widest mb-2">Account Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {ROLE_OPTIONS.map(opt => (
                    <button key={opt.value} type="button" onClick={() => setRole(opt.value)}
                      className={`flex flex-col items-center gap-1.5 px-2 py-3 rounded border text-xs font-sans transition-all ${
                        role === opt.value
                          ? 'border-cyan bg-cyan/10 text-cyan'
                          : 'border-border bg-navy text-muted hover:border-border/80 hover:text-text'
                      }`}>
                      <span className={role === opt.value ? 'text-cyan' : 'text-muted'}>{opt.icon}</span>
                      <span className="font-semibold">{opt.label}</span>
                    </button>
                  ))}
                </div>
                <p className="text-muted text-xs mt-1.5 text-center">
                  {ROLE_OPTIONS.find(o => o.value === role)?.desc}
                </p>
              </div>

              {error && (
                <div className="px-3 py-2.5 rounded border border-danger bg-danger/10 text-danger text-sm font-mono">
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading}
                className="w-full bg-cyan text-navy font-sans font-semibold text-sm uppercase tracking-widest py-3 rounded transition-all hover:shadow-[0_0_20px_rgba(0,212,255,0.4)] disabled:opacity-60 disabled:cursor-not-allowed mt-2">
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                    </svg>
                    Creating Account...
                  </span>
                ) : 'Create Account'}
              </button>
            </form>

            <p className="mt-5 text-center text-xs text-muted">
              Already have an account?{' '}
              <Link to="/login" className="text-cyan hover:underline">Sign in</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
