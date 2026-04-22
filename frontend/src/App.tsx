import { Component, ReactNode, useEffect, useMemo, useState } from 'react';
import { Routes, Route, useLocation, useNavigate, matchPath } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import RegionsPage from './pages/RegionsPage';
import RegionDetailPage from './pages/RegionDetailPage';
import PlaylistsPage from './pages/PlaylistsPage';
import SchedulesPage from './pages/SchedulesPage';
import SettingsPage from './pages/SettingsPage';
import LogsPage from './pages/LogsPage';
import ReportsPage from './pages/ReportsPage';
import { api } from './api';
import { Icon, IconName, ToastProvider } from './components/ui';

type NavItem = { to: string; label: string; icon: IconName; live?: boolean };

const NAV_ITEMS: NavItem[] = [
  { to: '/',          label: 'Dashboard', icon: 'dashboard' },
  { to: '/regions',   label: 'Regions',   icon: 'broadcast' },
  { to: '/playlists', label: 'Playlists', icon: 'playlist' },
  { to: '/schedules', label: 'Schedules', icon: 'schedule' },
  { to: '/reports',   label: 'Reports',   icon: 'report' },
  { to: '/logs',      label: 'Logs',      icon: 'logs', live: true },
  { to: '/settings',  label: 'Settings',  icon: 'settings' },
];

const CRUMB_MAP: Record<string, string> = {
  '/':          'Dashboard',
  '/regions':   'Regions',
  '/playlists': 'Playlists',
  '/schedules': 'Schedules',
  '/reports':   'Reports',
  '/logs':      'Logs',
  '/settings':  'Settings',
};

const MOBILE_BREAKPOINT = 820;

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return isMobile;
}

class ErrorBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidCatch(err: Error, info: { componentStack: string }) {
    console.error('[ErrorBoundary]', err, info.componentStack);
  }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 520, textAlign: 'center' }}>
          <h1 style={{ fontSize: 28, marginBottom: 12 }}>Щось пішло не так</h1>
          <p style={{ opacity: 0.7, marginBottom: 24 }}>
            Сталася помилка при рендерингу сторінки. Спробуйте перезавантажити.
          </p>
          <pre style={{ fontSize: 12, opacity: 0.5, whiteSpace: 'pre-wrap', marginBottom: 24 }}>
            {this.state.err.message}
          </pre>
          <button onClick={() => window.location.reload()} className="btn btn-primary">
            Перезавантажити
          </button>
        </div>
      </div>
    );
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </ErrorBoundary>
  );
}

function Shell() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isMobile = useIsMobile();

  const [regions, setRegions] = useState<{ id: number; name: string }[]>([]);
  useEffect(() => {
    api.getRegions().then((r: any[]) => setRegions(r.map(x => ({ id: x.id, name: x.name })))).catch(() => {});
  }, []);

  useEffect(() => { if (!isMobile) setMobileOpen(false); }, [isMobile]);

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {isMobile && mobileOpen && (
        <div onClick={() => setMobileOpen(false)}
             style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 20 }} />
      )}
      <Sidebar
        collapsed={isMobile ? false : collapsed}
        isMobile={isMobile}
        mobileOpen={mobileOpen}
        onToggle={() => setCollapsed(v => !v)}
        onNavigate={() => setMobileOpen(false)}
      />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Header regions={regions} isMobile={isMobile} onOpenMobile={() => setMobileOpen(true)} />
        <main style={{ flex: 1, minWidth: 0 }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/regions" element={<RegionsPage />} />
            <Route path="/regions/:id" element={<RegionDetailPage />} />
            <Route path="/playlists" element={<PlaylistsPage />} />
            <Route path="/schedules" element={<SchedulesPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/logs" element={<LogsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: collapsed ? 0 : '0 4px', height: 40 }}>
      <div style={{
        width: 30, height: 30, borderRadius: 9,
        background: 'linear-gradient(145deg, #1f232c, #14171e)',
        border: '1px solid var(--border-strong)',
        display: 'grid', placeItems: 'center',
        flex: 'none',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 0 20px -4px var(--accent-glow)',
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M4 6h16" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M12 6v14" stroke="var(--text)" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="12" cy="6" r="1.8" fill="var(--accent)" />
        </svg>
      </div>
      {!collapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
          <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.005em' }}>Teren</span>
          <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            ADS · console
          </span>
        </div>
      )}
    </div>
  );
}

function Sidebar({
  collapsed, isMobile, mobileOpen, onToggle, onNavigate,
}: {
  collapsed: boolean;
  isMobile: boolean;
  mobileOpen: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const width = collapsed ? 68 : 240;

  const isActive = (to: string) => {
    if (to === '/') return location.pathname === '/';
    if (to === '/regions') return location.pathname.startsWith('/regions');
    return location.pathname === to;
  };

  if (isMobile && !mobileOpen) return null;

  const sidebarStyle: React.CSSProperties = isMobile
    ? {
        position: 'fixed', top: 0, left: 0, height: '100vh',
        width: 260, zIndex: 30,
        background: 'var(--bg-panel)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        animation: 'slide-in-left 0.2s ease',
      }
    : {
        width, flex: 'none',
        position: 'sticky', top: 0, height: '100vh',
        background: 'var(--bg-panel)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        transition: 'width 0.22s ease',
        zIndex: 10,
      };

  return (
    <aside style={sidebarStyle}>
      <div style={{ padding: collapsed ? '18px 12px' : '18px 16px', borderBottom: '1px solid var(--border)' }}>
        <Brand collapsed={collapsed} />
      </div>

      <nav style={{ flex: 1, padding: 10, display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
        {NAV_ITEMS.map(item => {
          const active = isActive(item.to);
          return (
            <button
              key={item.to}
              onClick={() => { navigate(item.to); onNavigate(); }}
              title={collapsed ? item.label : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: collapsed ? '9px 0' : '9px 12px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                borderRadius: 10,
                color: active ? 'var(--text)' : 'var(--text-secondary)',
                background: active ? 'var(--bg-hover)' : 'transparent',
                fontSize: 13, fontWeight: 500,
                position: 'relative',
                border: 'none', cursor: 'pointer',
                transition: 'background 0.15s, color 0.15s',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
            >
              {active && !collapsed && (
                <span style={{
                  position: 'absolute', left: 0, top: 8, bottom: 8, width: 2,
                  background: 'var(--accent)', borderRadius: 2,
                }} />
              )}
              <Icon name={item.icon} size={17} stroke={1.5} />
              {!collapsed && <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>}
              {!collapsed && item.live && <span className="live-dot" style={{ width: 6, height: 6 }} />}
            </button>
          );
        })}
      </nav>

      <div style={{ padding: 10, borderTop: '1px solid var(--border)' }}>
        {!collapsed ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px', borderRadius: 10,
            background: 'var(--bg-card)', border: '1px solid var(--border)',
          }}>
            <span className="live-dot" style={{ width: 7, height: 7 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Network</div>
              <div style={{ fontSize: 12, fontWeight: 500 }}>online</div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', placeItems: 'center', padding: '10px 0' }}>
            <span className="live-dot" style={{ width: 8, height: 8 }} />
          </div>
        )}
        {!isMobile && (
          <button
            onClick={onToggle}
            style={{
              marginTop: 8, width: '100%', height: 32,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              color: 'var(--text-muted)', fontSize: 12,
              borderRadius: 8, background: 'transparent', border: 'none', cursor: 'pointer',
              transition: 'color 0.15s, background 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.background = 'var(--bg-hover)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}
          >
            <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} size={14} />
            {!collapsed && <span>Collapse</span>}
          </button>
        )}
      </div>
    </aside>
  );
}

function fixLatin1Utf8(s: string): string {
  if (!s) return s;
  // Icecast status-json often serves UTF-8 bytes as latin1 → mojibake like "Ð¡ÐÐÐÌ"
  // Reinterpret: if string looks like mojibake (contains Ð/Ñ with byte-range chars), re-decode.
  if (!/[\u00C0-\u00FF]{2,}/.test(s)) return s;
  try {
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c > 0xFF) return s; // not pure latin1
      bytes[i] = c;
    }
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return decoded;
  } catch {
    return s;
  }
}

function NowPlaying() {
  const [title, setTitle] = useState<string>('');
  const [online, setOnline] = useState(false);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const s: any = await api.getStatus();
        if (!alive) return;
        setTitle(fixLatin1Utf8(String(s?.masterTitle || '')));
        setOnline(!!s?.ok);
      } catch {
        if (alive) setOnline(false);
      }
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (!title) return null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 'none',
      padding: '6px 12px', borderRadius: 999,
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      maxWidth: 420,
    }}>
      <span className="live-dot" style={{ width: 7, height: 7, flex: 'none', opacity: online ? 1 : 0.4 }} />
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, lineHeight: 1.15 }}>
        <span className="mono" style={{
          fontSize: 9, color: 'var(--text-muted)',
          letterSpacing: '0.14em', textTransform: 'uppercase',
        }}>Now playing</span>
        <span title={title} style={{
          fontSize: 12, fontWeight: 500,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{title}</span>
      </div>
    </div>
  );
}

function Header({
  regions, isMobile, onOpenMobile,
}: {
  regions: { id: number; name: string }[];
  isMobile: boolean;
  onOpenMobile: () => void;
}) {
  const location = useLocation();
  const crumbs = useMemo(() => buildCrumbs(location.pathname, regions), [location.pathname, regions]);

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 9,
      background: 'rgba(14,16,21,0.78)',
      backdropFilter: 'blur(16px) saturate(140%)',
      WebkitBackdropFilter: 'blur(16px) saturate(140%)',
      borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 24px', height: 56 }}>
        {isMobile && (
          <button
            onClick={onOpenMobile}
            aria-label="Menu"
            style={{
              width: 36, height: 36, borderRadius: 10,
              color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
              background: 'var(--bg-card)',
              display: 'grid', placeItems: 'center',
              cursor: 'pointer', flex: 'none',
            }}
          >
            <Icon name="menu" size={16} />
          </button>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1, overflow: 'hidden' }}>
          {crumbs.map((c, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              {i > 0 && <Icon name="chevronRight" size={12} stroke={1.5} />}
              <span style={{
                fontSize: 13,
                color: i === crumbs.length - 1 ? 'var(--text)' : 'var(--text-muted)',
                fontWeight: i === crumbs.length - 1 ? 500 : 400,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{c}</span>
            </span>
          ))}
        </div>

        {!isMobile && <NowPlaying />}

        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '4px 10px 4px 4px',
            borderRadius: 999,
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            flex: 'none',
          }}
        >
          <div style={{
            width: 28, height: 28, borderRadius: 999,
            background: 'linear-gradient(135deg, var(--accent), #b85210)',
            display: 'grid', placeItems: 'center',
            color: '#fff', fontWeight: 600, fontSize: 11, letterSpacing: '0.05em',
          }}>OP</div>
          {!isMobile && (
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
              <span style={{ fontSize: 12, fontWeight: 500 }}>Operator</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Network admin</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function buildCrumbs(pathname: string, regions: { id: number; name: string }[]): string[] {
  if (pathname === '/') return ['Dashboard'];

  const regionMatch = matchPath('/regions/:id', pathname);
  if (regionMatch) {
    const id = Number(regionMatch.params.id);
    const name = regions.find(r => r.id === id)?.name;
    return ['Regions', name || `#${id}`];
  }

  const label = CRUMB_MAP[pathname];
  return label ? [label] : ['Dashboard'];
}
