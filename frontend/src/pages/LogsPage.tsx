import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useLogEntries } from '../hooks/useSocket';

const STATUS: Record<string, { label: string; cls: string }> = {
  running:     { label: '▶ Грає',      cls: 'text-[#f5a623]' },
  completed:   { label: '✓ Завершено', cls: 'text-emerald-400' },
  interrupted: { label: '✕ Перервано', cls: 'text-red-400' },
};
const TRIGGER: Record<string, string> = { api: 'API', tone: 'Тон', schedule: 'Розклад' };

const LEVEL_CLS: Record<string, string> = {
  error: 'text-red-400 bg-red-400/8 border-red-400/20',
  warn:  'text-[#f5a623] bg-[#f5a623]/8 border-[#f5a623]/20',
  info:  'text-[#5a5a8a] bg-transparent border-transparent',
};
const LEVEL_DOT: Record<string, string> = {
  error: 'bg-red-400',
  warn:  'bg-[#f5a623]',
  info:  'bg-[#3a3a5c]',
};

const fmt = (dt: string) => {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
};
const dur = (start: string, end: string) => {
  if (!end) return '—';
  const s = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
  return s < 60 ? `${s}с` : `${Math.floor(s / 60)}хв ${s % 60}с`;
};

export default function LogsPage() {
  const [tab, setTab] = useState<'ad' | 'system'>('ad');
  const [adLogs, setAdLogs] = useState<any[]>([]);
  const [sysLogs, setSysLogs] = useState<any[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const reloadAd = () => api.getLogs(300).then(setAdLogs);
  const reloadSys = () => api.getSystemLogs(300).then(setSysLogs);

  useEffect(() => {
    reloadAd();
    reloadSys();
    const t = setInterval(reloadAd, 10000);
    return () => clearInterval(t);
  }, []);

  useLogEntries((entry) => {
    setSysLogs(prev => [entry, ...prev].slice(0, 500));
  });

  const reload = () => { reloadAd(); reloadSys(); };

  return (
    <div className="p-4 sm:p-6">
      <div className="page-header">
        <h1 className="page-title">Логи</h1>
        <button onClick={reload} className="btn-ghost text-xs py-2">↻ Оновити</button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-[#0c0c1e] border border-[#1a1a30] rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab('ad')}
          className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${tab === 'ad' ? 'bg-[#1a1a30] text-white' : 'text-[#4a4a7a] hover:text-[#8888aa]'}`}
        >
          Врізки
        </button>
        <button
          onClick={() => setTab('system')}
          className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${tab === 'system' ? 'bg-[#1a1a30] text-white' : 'text-[#4a4a7a] hover:text-[#8888aa]'}`}
        >
          Система
          {sysLogs.some(l => l.level === 'error') && (
            <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
          )}
        </button>
      </div>

      {/* Ad Logs Tab */}
      {tab === 'ad' && (
        <>
          {/* Mobile cards */}
          <div className="sm:hidden space-y-3">
            {adLogs.map(l => {
              const st = STATUS[l.status] || { label: l.status, cls: 'text-[#4a4a7a]' };
              return (
                <div key={l.id} className="card p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-semibold text-white text-sm">{l.region_name || `#${l.region_id}`}</div>
                      <div className="text-xs text-[#5a5a8a] mt-0.5">{l.playlist_name || '—'}</div>
                    </div>
                    <span className={`text-xs font-bold ${st.cls}`}>{st.label}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-[#4a4a7a]">
                    <div>Тригер: <span className="text-[#8888aa]">{TRIGGER[l.trigger_type] || l.trigger_type}</span></div>
                    <div>Тривалість: <span className="text-[#8888aa]">{dur(l.start_time, l.end_time)}</span></div>
                    <div className="col-span-2">Початок: <span className="text-[#8888aa] font-mono">{fmt(l.start_time)}</span></div>
                  </div>
                </div>
              );
            })}
            {!adLogs.length && (
              <div className="card p-10 text-center text-[#4a4a7a] text-sm">Немає записів</div>
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#1a1a30]">
                    <th className="th">Регіон</th>
                    <th className="th">Плейлист</th>
                    <th className="th">Тригер</th>
                    <th className="th">Початок</th>
                    <th className="th">Кінець</th>
                    <th className="th">Тривалість</th>
                    <th className="th">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {adLogs.map(l => {
                    const st = STATUS[l.status] || { label: l.status, cls: 'text-[#4a4a7a]' };
                    return (
                      <tr key={l.id} className="hover:bg-[#1a1a30]/40 transition-colors">
                        <td className="td font-semibold text-white">{l.region_name || `#${l.region_id}`}</td>
                        <td className="td text-[#5a5a8a] max-w-[150px] truncate">{l.playlist_name || '—'}</td>
                        <td className="td">
                          <span className="badge bg-[#1a1a30] text-[#8888aa]">{TRIGGER[l.trigger_type] || l.trigger_type}</span>
                        </td>
                        <td className="td font-mono text-xs text-[#5a5a8a]">{fmt(l.start_time)}</td>
                        <td className="td font-mono text-xs text-[#5a5a8a]">{fmt(l.end_time)}</td>
                        <td className="td text-[#5a5a8a] text-xs">{dur(l.start_time, l.end_time)}</td>
                        <td className={`td text-xs font-bold ${st.cls}`}>{st.label}</td>
                      </tr>
                    );
                  })}
                  {!adLogs.length && (
                    <tr><td colSpan={7} className="td text-center py-10 text-[#4a4a7a]">Немає записів</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* System Logs Tab */}
      {tab === 'system' && (
        <div className="space-y-1">
          {sysLogs.map((l, i) => {
            const lvl = l.level as string;
            const dotCls = LEVEL_DOT[lvl] || 'bg-[#3a3a5c]';
            const rowCls = LEVEL_CLS[lvl] || 'text-[#5a5a8a] bg-transparent border-transparent';
            return (
              <div key={l.id ?? i} className={`flex items-start gap-3 px-3 py-2 rounded-lg border text-xs font-mono ${rowCls}`}>
                <div className={`w-2 h-2 rounded-full mt-0.5 flex-shrink-0 ${dotCls}`} />
                <span className="text-[#3a3a5c] flex-shrink-0 tabular-nums">{fmt(l.ts)}</span>
                {l.region_name && (
                  <span className="text-[#4a4a7a] flex-shrink-0">[{l.region_name}]</span>
                )}
                <span className="break-all">{l.message}</span>
              </div>
            );
          })}
          {!sysLogs.length && (
            <div className="card p-10 text-center text-[#4a4a7a] text-sm">Немає записів</div>
          )}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
