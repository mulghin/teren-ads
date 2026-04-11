import { useState } from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import RegionsPage from './pages/RegionsPage';
import RegionDetailPage from './pages/RegionDetailPage';
import PlaylistsPage from './pages/PlaylistsPage';
import SchedulesPage from './pages/SchedulesPage';
import SettingsPage from './pages/SettingsPage';
import LogsPage from './pages/LogsPage';
import ReportsPage from './pages/ReportsPage';

const navItems = [
  { to: '/', label: 'Дашборд', icon: GridIcon },
  { to: '/regions', label: 'Регіони', icon: RadioIcon },
  { to: '/playlists', label: 'Плейлисти', icon: MusicIcon },
  { to: '/schedules', label: 'Розклад', icon: ClockIcon },
  { to: '/reports', label: 'Звіти', icon: ChartIcon },
  { to: '/logs', label: 'Логи', icon: LogIcon },
  { to: '/settings', label: 'Налаштування', icon: SettingsIcon },
];

export default function App() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="flex h-screen overflow-hidden bg-[#17171a]">
      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 bg-black/60 z-20 sm:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Sidebar */}
      <nav className={`
        fixed sm:static inset-y-0 left-0 z-30 w-56 flex-shrink-0
        bg-[#121214] border-r border-[#383840]
        flex flex-col transition-transform duration-200
        ${open ? 'translate-x-0' : '-translate-x-full sm:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="px-5 py-4 border-b border-[#383840] flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#ff732e] flex items-center justify-center flex-shrink-0">
            <span className="text-black font-black text-xs">TA</span>
          </div>
          <div>
            <div className="text-white font-bold text-sm leading-tight">Teren Ads</div>
            <div className="text-[#7a7a85] text-xs">Регіональна реклама</div>
          </div>
        </div>

        {/* Nav */}
        <div className="flex-1 py-3 overflow-y-auto">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg text-sm transition-all ` +
                (isActive
                  ? 'bg-[#ff732e]/10 text-[#ff732e] font-medium'
                  : 'text-[#9a9aa5] hover:text-white hover:bg-[#383840]')
              }
            >
              <item.icon size={16} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-[#383840] text-xs text-[#5a5a62]">
          v1.2.1 · Teren FM
        </div>
      </nav>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <div className="sm:hidden flex items-center gap-3 px-4 py-3 bg-[#121214] border-b border-[#383840]">
          <button onClick={() => setOpen(true)} className="text-[#9a9aa5] hover:text-white">
            <HamburgerIcon size={20} />
          </button>
          <div className="text-white font-semibold text-sm">Teren Ads</div>
        </div>

        <main className="flex-1 overflow-auto">
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

// SVG Icons
function GridIcon({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
    <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
  </svg>;
}
function RadioIcon({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/>
    <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12" y2="20" strokeWidth={3}/>
  </svg>;
}
function MusicIcon({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
  </svg>;
}
function ClockIcon({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>;
}
function LogIcon({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
    <polyline points="10 9 9 9 8 9"/>
  </svg>;
}
function SettingsIcon({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>;
}
function ChartIcon({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
  </svg>;
}
function HamburgerIcon({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
    <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
  </svg>;
}
