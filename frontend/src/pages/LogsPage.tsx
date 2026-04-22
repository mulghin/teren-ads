import { useEffect, useState } from 'react';
import { api } from '../api';
import { useLogEntries } from '../hooks/useSocket';
import {
  Badge,
  BadgeTone,
  Button,
  PageHeader,
  Tabs,
} from '../components/ui';

const STATUS_TONE: Record<string, BadgeTone> = {
  running: 'accent',
  completed: 'success',
  interrupted: 'error',
};
const STATUS_LABEL: Record<string, string> = {
  running: 'Грає',
  completed: 'Завершено',
  interrupted: 'Перервано',
};
const TRIGGER_LABEL: Record<string, string> = { api: 'API', tone: 'Тон', schedule: 'Розклад' };

const LEVEL_COLOR: Record<string, string> = {
  error: 'var(--error)',
  warn: 'var(--warn)',
  info: 'var(--text-muted)',
};
const LEVEL_BG: Record<string, string> = {
  error: 'var(--error-dim)',
  warn: 'var(--warn-dim)',
  info: 'transparent',
};

const fmt = (dt: string) => {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('uk-UA', {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
};
const dur = (start: string, end: string) => {
  if (!end) return '—';
  const s = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
  return s < 60 ? `${s}с` : `${Math.floor(s / 60)}хв ${s % 60}с`;
};

type Tab = 'ad' | 'system';

export default function LogsPage() {
  const [tab, setTab] = useState<Tab>('ad');
  const [adLogs, setAdLogs] = useState<any[]>([]);
  const [sysLogs, setSysLogs] = useState<any[]>([]);

  const reloadAd = () => api.getLogs(300).then(setAdLogs);
  const reloadSys = () => api.getSystemLogs(300).then(setSysLogs);

  useEffect(() => {
    reloadAd();
    reloadSys();
    const tAd = setInterval(reloadAd, 10000);
    const tSys = setInterval(reloadSys, 15000);
    return () => { clearInterval(tAd); clearInterval(tSys); };
  }, []);

  useLogEntries((entry: any) => {
    setSysLogs(prev => [entry, ...prev].slice(0, 500));
  });

  const hasErrors = sysLogs.some(l => l.level === 'error');

  return (
    <div style={{ padding: '0 24px 40px' }}>
      <PageHeader
        title="Логи"
        subtitle="Журнал врізок реклами та події системи"
        actions={
          <Button variant="secondary" icon="restart" onClick={() => { reloadAd(); reloadSys(); }}>
            Оновити
          </Button>
        }
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          items={[
            { value: 'ad',     label: 'Врізки',  count: adLogs.length },
            { value: 'system', label: 'Система', count: sysLogs.length },
          ]}
        />
        {hasErrors && tab !== 'system' && <Badge tone="error" dot>є помилки</Badge>}
      </div>

      {tab === 'ad' && (
        adLogs.length === 0 ? (
          <div className="card" style={{ padding: '60px 24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
            Немає записів
          </div>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Регіон</th>
                  <th>Плейлист</th>
                  <th>Тригер</th>
                  <th>Початок</th>
                  <th>Кінець</th>
                  <th className="col-right">Тривалість</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {adLogs.map(l => (
                  <tr key={l.id}>
                    <td style={{ fontWeight: 500 }}>{l.region_name || `#${l.region_id}`}</td>
                    <td className="col-muted" style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {l.playlist_name || '—'}
                    </td>
                    <td><Badge tone="neutral">{TRIGGER_LABEL[l.trigger_type] || l.trigger_type}</Badge></td>
                    <td className="mono col-muted" style={{ fontSize: 11 }}>{fmt(l.start_time)}</td>
                    <td className="mono col-muted" style={{ fontSize: 11 }}>{fmt(l.end_time)}</td>
                    <td className="col-right col-muted" style={{ fontSize: 12 }}>{dur(l.start_time, l.end_time)}</td>
                    <td>
                      <Badge tone={STATUS_TONE[l.status] || 'neutral'} dot>
                        {STATUS_LABEL[l.status] || l.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === 'system' && (
        sysLogs.length === 0 ? (
          <div className="card" style={{ padding: '60px 24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
            Немає записів
          </div>
        ) : (
          <div className="card" style={{ padding: 6 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: '70vh', overflow: 'auto' }}>
              {sysLogs.map((l, i) => {
                const lvl = (l.level as string) || 'info';
                return (
                  <div
                    key={l.id ?? i}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                      padding: '6px 10px', borderRadius: 6,
                      background: LEVEL_BG[lvl] || 'transparent',
                      fontFamily: 'var(--font-mono)', fontSize: 12,
                      border: lvl === 'info' ? '1px solid transparent' : '1px solid rgba(255,255,255,0.04)',
                    }}
                  >
                    <span
                      style={{
                        width: 6, height: 6, borderRadius: 999, marginTop: 6,
                        background: LEVEL_COLOR[lvl] || 'var(--text-muted)',
                        flex: 'none',
                      }}
                    />
                    <span className="tabular" style={{ color: 'var(--text-muted)', flex: 'none' }}>{fmt(l.ts)}</span>
                    {l.region_name && (
                      <span style={{ color: 'var(--text-secondary)', flex: 'none' }}>[{l.region_name}]</span>
                    )}
                    <span style={{ color: LEVEL_COLOR[lvl] || 'var(--text)', wordBreak: 'break-all', flex: 1 }}>
                      {l.message}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )
      )}
    </div>
  );
}
