import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

interface NavItem {
  label: string;
  path: string;
  roles: string[];
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Dashboard', path: '/__role__', roles: [],
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
  },
  {
    label: 'Invoices', path: '/invoices', roles: ['SUPPLIER', 'BUYER'],
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  },
  {
    label: 'Alerts', path: '/alerts', roles: [],
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  },
  {
    label: 'Financing', path: '/financing', roles: ['SUPPLIER', 'FINANCIER'],
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  },
  {
    label: 'Simulator', path: '/simulation', roles: ['BUYER'],
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 2v7.5l-4.8 7.2a2 2 0 0 0 1.7 3.3h12.2a2 2 0 0 0 1.7-3.3L15 9.5V2"/><path d="M8.5 2h7"/><path d="M6 14h12"/></svg>,
  },
];

const ROLE_DASH: Record<string, string> = {
  SUPPLIER: '/supplier', BUYER: '/buyer', FINANCIER: '/financier',
};

interface SidebarProps { companyName?: string; }

export default function Sidebar({ companyName }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const logout   = useAuthStore((s) => s.logout);
  const role     = useAuthStore((s) => s.role) ?? '';
  const authName = useAuthStore((s) => s.companyName);

  const displayName = authName || companyName || 'Liquidity Orchestrator';
  const handleLogout = () => { logout(); navigate('/login', { replace: true }); };

  const visibleItems = NAV_ITEMS.filter(item =>
    item.roles.length === 0 || item.roles.includes(role)
  );

  return (
    <aside className="w-56 min-h-screen bg-surface border-r border-border flex flex-col shrink-0">
      {/* Logo */}
      <div className="px-5 py-6 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-cyan/10 border border-cyan flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="4" fill="#00d4ff"/>
              <circle cx="10" cy="10" r="8" stroke="#00d4ff" strokeWidth="1.5" strokeDasharray="3 2"/>
            </svg>
          </div>
          <span className="text-cyan font-sans font-bold text-base tracking-tight">Liquidity Orchestrator</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {visibleItems.map((item) => {
          const path = item.path === '/__role__' ? (ROLE_DASH[role] ?? '/login') : item.path;
          const active = item.path === '/__role__'
            ? location.pathname === path
            : location.pathname.startsWith(item.path);
          return (
            <button key={item.label} onClick={() => navigate(path)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm font-sans transition-colors text-left ${
                active
                  ? 'bg-cyan/10 text-cyan border border-cyan/20'
                  : 'text-muted hover:text-text hover:bg-border/40'
              }`}>
              <span className={active ? 'text-cyan' : 'text-muted'}>{item.icon}</span>
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-border">
        <p className="text-xs text-muted font-mono truncate mb-1">{displayName}</p>
        <p className="text-xs text-cyan/60 font-mono mb-3">{role}</p>
        <button onClick={handleLogout}
          className="w-full flex items-center gap-2 text-xs text-muted hover:text-danger transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Logout
        </button>
      </div>
    </aside>
  );
}
