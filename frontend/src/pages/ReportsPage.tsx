import { useEffect, useState } from 'react';
import { api } from '../api';
import {
  Badge,
  BadgeTone,
  Button,
  PageHeader,
  Tabs,
  useToast,
} from '../components/ui';

const fmtDate = (iso: string) => iso ? new Date(iso).toLocaleString('uk-UA') : '—';
const fmtDur = (sec: number) => {
  if (!sec) return '—';
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

type Tab = 'campaigns' | 'regions' | 'plays';

const TRIGGER_TONE: Record<string, BadgeTone> = {
  tone: 'info',
  api: 'accent',
  schedule: 'success',
};

const STATUS_TONE: Record<string, BadgeTone> = {
  completed: 'success',
  interrupted: 'error',
};

export default function ReportsPage() {
  const notify = useToast();
  const [tab, setTab] = useState<Tab>('campaigns');
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());
  const [campaigns, setCampaigns] = useState<any>(null);
  const [regionStats, setRegionStats] = useState<any>(null);
  const [plays, setPlays] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        if (tab === 'campaigns')      setCampaigns(await api.getCampaignReport(from, to));
        else if (tab === 'regions')   setRegionStats(await api.getRegionStats(from, to));
        else                          setPlays(await api.getPlayLog({ from, to }));
      } catch (e: any) {
        notify({ title: 'Помилка', body: e?.message, tone: 'error', icon: 'warn' });
      } finally {
        setLoading(false);
      }
    })();
  }, [tab, from, to]);

  const downloadXlsx = async () => {
    if (downloading) return;
    setDownloading(true);
    try { await api.downloadMediaPlanXlsx(); }
    catch (e: any) { notify({ title: 'Помилка', body: e?.message, tone: 'error', icon: 'warn' }); }
    finally { setDownloading(false); }
  };

  return (
    <div className="page">
      <PageHeader
        title="Звіти"
        subtitle="Аналітика кампаній, регіонів та журнал виходів"
        actions={
          <Button variant="primary" icon="download" onClick={downloadXlsx} disabled={downloading}>
            {downloading ? 'Формування…' : 'Медіаплан · XLSX'}
          </Button>
        }
      />

      <div className="report-filter-bar">
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          items={[
            { value: 'campaigns', label: 'Кампанії' },
            { value: 'regions',   label: 'Регіони' },
            { value: 'plays',     label: 'Виходи' },
          ]}
        />
        <div className="report-filter-bar__spacer" />
        <div className="report-filter-bar__dates">
          <Field label="Від">
            <input type="date" className="input" value={from} onChange={e => setFrom(e.target.value)} />
          </Field>
          <Field label="До">
            <input type="date" className="input" value={to} onChange={e => setTo(e.target.value)} />
          </Field>
        </div>
      </div>

      {loading && (
        <div className="card" style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
          Завантаження…
        </div>
      )}

      {!loading && tab === 'campaigns' && campaigns && (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Плейлист</th>
                <th className="col-right">Виходи</th>
                <th className="col-right">Завершено</th>
                <th className="col-right">Перервано</th>
                <th className="col-right">Ефірний час</th>
                <th>Перший вихід</th>
                <th>Останній вихід</th>
                <th className="col-right">Ліміт/день</th>
                <th>Кампанія</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.campaigns.map((c: any) => (
                <tr key={c.playlist_id}>
                  <td style={{ fontWeight: 500 }}>{c.playlist_name}</td>
                  <td className="col-right tabular" style={{ color: 'var(--accent)', fontWeight: 600 }}>{c.total_plays || 0}</td>
                  <td className="col-right tabular" style={{ color: 'var(--success)' }}>{c.completed || 0}</td>
                  <td className="col-right tabular" style={{ color: 'var(--error)' }}>{c.interrupted || 0}</td>
                  <td className="col-right col-muted tabular">{fmtDur(c.total_duration_sec)}</td>
                  <td className="mono col-muted" style={{ fontSize: 11 }}>{fmtDate(c.first_play)}</td>
                  <td className="mono col-muted" style={{ fontSize: 11 }}>{fmtDate(c.last_play)}</td>
                  <td className="col-right col-muted">{c.max_plays_per_day > 0 ? c.max_plays_per_day : '∞'}</td>
                  <td className="col-muted" style={{ fontSize: 11 }}>
                    {c.start_date ? `${c.start_date} → ${c.end_date || '∞'}` : '∞'}
                  </td>
                </tr>
              ))}
              {campaigns.campaigns.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Немає даних за вибраний період</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && tab === 'regions' && regionStats && (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Регіон</th>
                <th>Дата</th>
                <th className="col-right">Виходи</th>
                <th className="col-right">Ефірний час</th>
                <th className="col-right">Тон</th>
                <th className="col-right">API</th>
                <th className="col-right">Планувальник</th>
              </tr>
            </thead>
            <tbody>
              {regionStats.rows.filter((r: any) => r.date).map((r: any, i: number) => (
                <tr key={i}>
                  <td style={{ fontWeight: 500 }}>{r.region_name}</td>
                  <td className="mono col-muted" style={{ fontSize: 12 }}>{r.date?.slice(0, 10)}</td>
                  <td className="col-right tabular" style={{ color: 'var(--accent)', fontWeight: 600 }}>{r.plays}</td>
                  <td className="col-right col-muted tabular">{fmtDur(r.total_sec)}</td>
                  <td className="col-right tabular" style={{ color: 'var(--info)' }}>{r.tone_plays}</td>
                  <td className="col-right tabular" style={{ color: 'var(--accent)' }}>{r.api_plays}</td>
                  <td className="col-right tabular" style={{ color: 'var(--success)' }}>{r.schedule_plays}</td>
                </tr>
              ))}
              {regionStats.rows.filter((r: any) => r.date).length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Немає даних за вибраний період</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && tab === 'plays' && (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Час</th>
                <th>Регіон</th>
                <th>Плейлист</th>
                <th>Тригер</th>
                <th className="col-right">Тривалість</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {plays.map(p => (
                <tr key={p.id}>
                  <td className="mono col-muted" style={{ fontSize: 11 }}>{fmtDate(p.start_time)}</td>
                  <td style={{ fontWeight: 500 }}>{p.region_name}</td>
                  <td className="col-muted">{p.playlist_name}</td>
                  <td>
                    <Badge tone={TRIGGER_TONE[p.trigger_type] || 'neutral'}>{p.trigger_type}</Badge>
                  </td>
                  <td className="col-right col-muted tabular">{fmtDur(p.duration_sec)}</td>
                  <td>
                    <Badge tone={STATUS_TONE[p.status] || 'warn'} dot>{p.status}</Badge>
                  </td>
                </tr>
              ))}
              {plays.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Немає виходів за вибраний період</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        {label}
      </span>
      {children}
    </label>
  );
}
