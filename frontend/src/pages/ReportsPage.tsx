import { useEffect, useState } from 'react';
import { api } from '../api';

const fmtDate = (iso: string) => iso ? new Date(iso).toLocaleString('uk-UA') : '—';
const fmtDur = (sec: number) => {
  if (!sec) return '—';
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

type Tab = 'campaigns' | 'regions' | 'plays';

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>('campaigns');
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());
  const [campaigns, setCampaigns] = useState<any>(null);
  const [regionStats, setRegionStats] = useState<any>(null);
  const [plays, setPlays] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showError = (msg: string) => { setError(msg); setTimeout(() => setError(null), 4000); };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === 'campaigns') setCampaigns(await api.getCampaignReport(from, to));
      else if (tab === 'regions') setRegionStats(await api.getRegionStats(from, to));
      else setPlays(await api.getPlayLog({ from, to }));
    } catch (e: any) { showError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [tab, from, to]);

  const downloadXlsx = async () => {
    try { await api.downloadMediaPlanXlsx(); }
    catch (e: any) { showError(e.message); }
  };

  return (
    <div className="p-4 sm:p-6">
      {error && (
        <div className="fixed top-4 right-4 z-50 bg-red-500/15 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-xl shadow-lg max-w-sm">
          {error}
        </div>
      )}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="page-title">Звіти</h1>
        <button onClick={downloadXlsx} className="btn-primary text-sm py-2 px-4">
          ↓ Медіаплан Excel
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 p-1 bg-[#0a0a15] rounded-xl w-fit">
        {(['campaigns', 'regions', 'plays'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm transition-colors ${tab === t ? 'bg-[#1a1a30] text-white' : 'text-[#5a5a8a] hover:text-white'}`}>
            {t === 'campaigns' ? 'Кампанії' : t === 'regions' ? 'Регіони' : 'Виходи'}
          </button>
        ))}
      </div>

      {/* Date range */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div>
          <label className="text-xs text-[#5a5a8a] block mb-1">Від</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input text-sm py-1.5" />
        </div>
        <div>
          <label className="text-xs text-[#5a5a8a] block mb-1">До</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="input text-sm py-1.5" />
        </div>
      </div>

      {loading && <div className="text-[#5a5a8a] text-sm">Завантаження...</div>}

      {/* Campaigns tab */}
      {tab === 'campaigns' && campaigns && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1a1a30] text-[#4a4a7a] text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-3">Плейлист</th>
                  <th className="text-center px-3 py-3">Виходи</th>
                  <th className="text-center px-3 py-3">Завершено</th>
                  <th className="text-center px-3 py-3">Перервано</th>
                  <th className="text-center px-3 py-3">Ефірний час</th>
                  <th className="text-center px-3 py-3">Перший вихід</th>
                  <th className="text-center px-3 py-3">Останній вихід</th>
                  <th className="text-center px-3 py-3">Ліміт/день</th>
                  <th className="text-center px-3 py-3">Кампанія</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.campaigns.map((c: any) => (
                  <tr key={c.playlist_id} className="border-b border-[#0d0d20] hover:bg-[#0d0d20] transition-colors">
                    <td className="px-4 py-3 font-medium text-white">{c.playlist_name}</td>
                    <td className="px-3 py-3 text-center">
                      <span className="text-[#f5a623] font-semibold">{c.total_plays || 0}</span>
                    </td>
                    <td className="px-3 py-3 text-center text-green-400">{c.completed || 0}</td>
                    <td className="px-3 py-3 text-center text-red-400">{c.interrupted || 0}</td>
                    <td className="px-3 py-3 text-center text-[#8888aa]">{fmtDur(c.total_duration_sec)}</td>
                    <td className="px-3 py-3 text-center text-[#5a5a8a] text-xs">{fmtDate(c.first_play)}</td>
                    <td className="px-3 py-3 text-center text-[#5a5a8a] text-xs">{fmtDate(c.last_play)}</td>
                    <td className="px-3 py-3 text-center text-[#5a5a8a]">
                      {c.max_plays_per_day > 0 ? c.max_plays_per_day : '∞'}
                    </td>
                    <td className="px-3 py-3 text-center text-xs text-[#5a5a8a]">
                      {c.start_date ? `${c.start_date} → ${c.end_date || '∞'}` : '∞'}
                    </td>
                  </tr>
                ))}
                {campaigns.campaigns.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-[#3a3a5a]">Немає даних за вибраний період</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Regions tab */}
      {tab === 'regions' && regionStats && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1a1a30] text-[#4a4a7a] text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-3">Регіон</th>
                  <th className="text-center px-3 py-3">Дата</th>
                  <th className="text-center px-3 py-3">Виходи</th>
                  <th className="text-center px-3 py-3">Ефірний час</th>
                  <th className="text-center px-3 py-3">Тон</th>
                  <th className="text-center px-3 py-3">API</th>
                  <th className="text-center px-3 py-3">Планувальник</th>
                </tr>
              </thead>
              <tbody>
                {regionStats.rows.filter((r: any) => r.date).map((r: any, i: number) => (
                  <tr key={i} className="border-b border-[#0d0d20] hover:bg-[#0d0d20] transition-colors">
                    <td className="px-4 py-3 font-medium text-white">{r.region_name}</td>
                    <td className="px-3 py-3 text-center text-[#8888aa]">{r.date?.slice(0, 10)}</td>
                    <td className="px-3 py-3 text-center text-[#f5a623] font-semibold">{r.plays}</td>
                    <td className="px-3 py-3 text-center text-[#8888aa]">{fmtDur(r.total_sec)}</td>
                    <td className="px-3 py-3 text-center text-blue-400">{r.tone_plays}</td>
                    <td className="px-3 py-3 text-center text-purple-400">{r.api_plays}</td>
                    <td className="px-3 py-3 text-center text-green-400">{r.schedule_plays}</td>
                  </tr>
                ))}
                {regionStats.rows.filter((r: any) => r.date).length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-[#3a3a5a]">Немає даних за вибраний період</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Plays tab */}
      {tab === 'plays' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1a1a30] text-[#4a4a7a] text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-3">Час</th>
                  <th className="text-left px-3 py-3">Регіон</th>
                  <th className="text-left px-3 py-3">Плейлист</th>
                  <th className="text-center px-3 py-3">Тригер</th>
                  <th className="text-center px-3 py-3">Тривалість</th>
                  <th className="text-center px-3 py-3">Статус</th>
                </tr>
              </thead>
              <tbody>
                {plays.map((p: any) => (
                  <tr key={p.id} className="border-b border-[#0d0d20] hover:bg-[#0d0d20] transition-colors">
                    <td className="px-4 py-3 text-xs text-[#8888aa]">{fmtDate(p.start_time)}</td>
                    <td className="px-3 py-3 text-white">{p.region_name}</td>
                    <td className="px-3 py-3 text-[#8888aa]">{p.playlist_name}</td>
                    <td className="px-3 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        p.trigger_type === 'tone' ? 'bg-blue-500/15 text-blue-400' :
                        p.trigger_type === 'api' ? 'bg-purple-500/15 text-purple-400' :
                        'bg-green-500/15 text-green-400'
                      }`}>{p.trigger_type}</span>
                    </td>
                    <td className="px-3 py-3 text-center text-[#8888aa]">{fmtDur(p.duration_sec)}</td>
                    <td className="px-3 py-3 text-center">
                      <span className={`text-xs ${p.status === 'completed' ? 'text-green-400' : p.status === 'interrupted' ? 'text-red-400' : 'text-yellow-400'}`}>
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {plays.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-[#3a3a5a]">Немає виходів за вибраний період</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
