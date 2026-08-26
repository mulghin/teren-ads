import { useEffect, useState } from 'react';
import { api } from '../api';
import {
  Badge,
  BadgeTone,
  Button,
  DropdownSelect,
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

type Tab = 'campaigns' | 'regions' | 'plays' | 'tracks';

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
  const [tracks, setTracks] = useState<any>(null);
  const [regions, setRegions] = useState<any[]>([]);
  const [trackRegion, setTrackRegion] = useState('');
  const [trackQ, setTrackQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => { api.getRegions().then(setRegions).catch(() => {}); }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        if (tab === 'campaigns')      setCampaigns(await api.getCampaignReport(from, to));
        else if (tab === 'regions')   setRegionStats(await api.getRegionStats(from, to));
        else if (tab === 'tracks')    setTracks(await api.getTrackReport({ from, to, region_id: trackRegion ? Number(trackRegion) : undefined, q: trackQ }));
        else                          setPlays(await api.getPlayLog({ from, to }));
      } catch (e: any) {
        notify({ title: 'Помилка', body: e?.message, tone: 'error', icon: 'warn' });
      } finally {
        setLoading(false);
      }
    })();
  }, [tab, from, to, trackRegion, trackQ]);

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
            { value: 'tracks',    label: 'Ролики' },
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
                  <td className="cell-title" style={{ fontWeight: 500 }}>{c.playlist_name}</td>
                  <td data-label="Виходи" className="col-right tabular" style={{ color: 'var(--accent)', fontWeight: 600 }}>{c.total_plays || 0}</td>
                  <td data-label="Завершено" className="col-right tabular" style={{ color: 'var(--success)' }}>{c.completed || 0}</td>
                  <td data-label="Перервано" className="col-right tabular" style={{ color: 'var(--error)' }}>{c.interrupted || 0}</td>
                  <td data-label="Ефірний час" className="col-right col-muted tabular">{fmtDur(c.total_duration_sec)}</td>
                  <td data-label="Перший вихід" className="mono col-muted" style={{ fontSize: 11 }}>{fmtDate(c.first_play)}</td>
                  <td data-label="Останній вихід" className="mono col-muted" style={{ fontSize: 11 }}>{fmtDate(c.last_play)}</td>
                  <td data-label="Ліміт/день" className="col-right col-muted">{c.max_plays_per_day > 0 ? c.max_plays_per_day : '∞'}</td>
                  <td data-label="Період" className="col-muted" style={{ fontSize: 11 }}>
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
                  <td className="cell-title" style={{ fontWeight: 500 }}>{r.region_name}</td>
                  <td data-label="Дата" className="mono col-muted" style={{ fontSize: 12 }}>{r.date?.slice(0, 10)}</td>
                  <td data-label="Виходи" className="col-right tabular" style={{ color: 'var(--accent)', fontWeight: 600 }}>{r.plays}</td>
                  <td data-label="Ефірний час" className="col-right col-muted tabular">{fmtDur(r.total_sec)}</td>
                  <td data-label="Тон" className="col-right tabular" style={{ color: 'var(--info)' }}>{r.tone_plays}</td>
                  <td data-label="API" className="col-right tabular" style={{ color: 'var(--accent)' }}>{r.api_plays}</td>
                  <td data-label="Планувальник" className="col-right tabular" style={{ color: 'var(--success)' }}>{r.schedule_plays}</td>
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
                  <td data-label="Час" className="mono col-muted" style={{ fontSize: 11 }}>{fmtDate(p.start_time)}</td>
                  <td className="cell-title" style={{ fontWeight: 500 }}>{p.region_name}</td>
                  <td data-label="Плейлист" className="col-muted">{p.playlist_name}</td>
                  <td data-label="Тригер">
                    <Badge tone={TRIGGER_TONE[p.trigger_type] || 'neutral'}>{p.trigger_type}</Badge>
                  </td>
                  <td data-label="Тривалість" className="col-right col-muted tabular">{fmtDur(p.duration_sec)}</td>
                  <td data-label="Статус">
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

      {!loading && tab === 'tracks' && tracks && (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Field label="Регіон">
              <DropdownSelect
                value={trackRegion}
                onChange={setTrackRegion}
                options={[
                  { value: '', label: 'Всі регіони' },
                  ...regions.map((r: any) => ({ value: String(r.id), label: r.name })),
                ]}
              />
            </Field>
            <Field label="Пошук за назвою">
              <input
                className="input" placeholder="Назва ролика…"
                defaultValue={trackQ}
                onKeyDown={e => { if (e.key === 'Enter') setTrackQ((e.target as HTMLInputElement).value); }}
                onBlur={e => setTrackQ(e.target.value)}
                style={{ minWidth: 220 }}
              />
            </Field>
          </div>

          <div className="card" style={{ padding: 16, marginBottom: 14 }}>
            <h4 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600 }}>Зведення по роликах</h4>
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Ролик</th>
                    <th className="col-right">Виходів</th>
                    <th className="col-right">Сумарний час</th>
                    <th className="col-right">Регіонів</th>
                    <th>Перший вихід</th>
                    <th>Останній вихід</th>
                  </tr>
                </thead>
                <tbody>
                  {tracks.summary.map((s: any) => (
                    <tr key={s.filename}>
                      <td className="cell-title" style={{ fontWeight: 500 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 380 }} title={s.filename}>{s.filename}</div>
                      </td>
                      <td data-label="Виходів" className="col-right tabular" style={{ color: 'var(--accent)', fontWeight: 600 }}>{s.plays}</td>
                      <td data-label="Сумарний час" className="col-right col-muted tabular">{fmtDur(Number(s.total_sec))}</td>
                      <td data-label="Регіонів" className="col-right tabular">{s.regions}</td>
                      <td data-label="Перший вихід" className="mono col-muted" style={{ fontSize: 11 }}>{fmtDate(s.first_play)}</td>
                      <td data-label="Останній вихід" className="mono col-muted" style={{ fontSize: 11 }}>{fmtDate(s.last_play)}</td>
                    </tr>
                  ))}
                  {tracks.summary.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>Немає даних за вибраний період (журнал роликів ведеться з 26.08.2026)</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card" style={{ padding: 16 }}>
            <h4 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600 }}>
              Журнал виходів роликів
              <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 8 }}>{tracks.rows.length} запис(ів){tracks.rows.length === 2000 ? ' · показано перші 2000, звузь період' : ''}</span>
            </h4>
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Час виходу</th>
                    <th>Регіон</th>
                    <th>Ролик</th>
                    <th>Плейлист</th>
                    <th className="col-right">Тривалість</th>
                    <th>Тригер</th>
                  </tr>
                </thead>
                <tbody>
                  {tracks.rows.map((r: any) => (
                    <tr key={r.id}>
                      <td data-label="Час" className="mono" style={{ fontSize: 11, color: 'var(--accent)' }}>{fmtDate(r.started_at)}</td>
                      <td className="cell-title" style={{ fontWeight: 500 }}>{r.region_name || '—'}</td>
                      <td data-label="Ролик">
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 340 }} title={r.filename}>{r.filename}</div>
                      </td>
                      <td data-label="Плейлист" className="col-muted">{r.playlist_name || '—'}</td>
                      <td data-label="Тривалість" className="col-right col-muted tabular">{fmtDur(r.duration_sec)}</td>
                      <td data-label="Тригер">
                        <Badge tone={TRIGGER_TONE[r.trigger_type] || 'neutral'}>{r.trigger_type || '—'}</Badge>
                      </td>
                    </tr>
                  ))}
                  {tracks.rows.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>Немає виходів за вибраний період</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
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
