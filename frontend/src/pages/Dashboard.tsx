import { useEffect, useState } from 'react';
import { api } from '../api';
import { useRegionUpdates } from '../hooks/useSocket';
import { Select } from '../components/Select';

const MODE: Record<string, { label: string; dot: string; text: string; bg: string }> = {
  main:    { label: 'ЕФІР',     dot: 'bg-emerald-400',              text: 'text-emerald-400',  bg: 'bg-emerald-400/10' },
  ad:      { label: 'РЕКЛАМА',  dot: 'bg-[#ff732e] animate-pulse',  text: 'text-[#ff732e]',   bg: 'bg-[#ff732e]/10'   },
  filler:  { label: 'ФІЛЕР',    dot: 'bg-purple-400',               text: 'text-purple-400',  bg: 'bg-purple-400/10'  },
  stopped: { label: 'СТОП',     dot: 'bg-[#30303a]',               text: 'text-[#7a7a85]',   bg: 'bg-[#383840]'      },
};

export default function Dashboard() {
  const [regions, setRegions] = useState<any[]>([]);
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggerModal, setTriggerModal] = useState<any>(null);
  const [selPlaylist, setSelPlaylist] = useState('');
  const [selFiller, setSelFiller] = useState('');
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const [r, p] = await Promise.all([api.getRegions(), api.getPlaylists()]);
    setRegions(r); setPlaylists(p); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  useRegionUpdates((u) => {
    setRegions(prev => prev.map(r => r.id === u.id ? { ...r, live: u, status: u.mode } : r));
  });

  const mode = (r: any) => r.live?.mode || r.status || 'stopped';

  const action = async (fn: () => Promise<any>, id: number) => {
    setBusy(id);
    try { await fn(); } catch (e: any) { setError(e.message); setTimeout(() => setError(null), 4000); }
    finally { setBusy(null); }
  };

  const handleTrigger = async () => {
    if (!triggerModal || !selPlaylist) return;
    await api.triggerAd(triggerModal.id, +selPlaylist, selFiller ? +selFiller : undefined);
    setTriggerModal(null);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-[#7a7a85] text-sm">Завантаження...</div>
  );

  const counts = { main: 0, ad: 0, filler: 0, stopped: 0 };
  regions.forEach(r => { const m = mode(r); if (m in counts) counts[m as keyof typeof counts]++; });

  return (
    <div className="p-4 sm:p-6">
      {error && (
        <div className="fixed top-4 right-4 z-50 bg-red-500/15 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-xl shadow-lg max-w-sm">
          {error}
        </div>
      )}
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">Дашборд</h1>
        <span className="text-[#7a7a85] text-sm">{regions.length} регіонів</span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {(Object.keys(MODE) as (keyof typeof MODE)[]).map(m => (
          <div key={m} className={`card p-4 ${counts[m] > 0 ? MODE[m].bg : ''}`}>
            <div className="text-xs text-[#7a7a85] mb-1">{MODE[m].label}</div>
            <div className={`text-3xl font-black ${counts[m] > 0 ? MODE[m].text : 'text-[#30303a]'}`}>
              {counts[m]}
            </div>
          </div>
        ))}
      </div>

      {/* Grid */}
      {regions.length === 0 ? (
        <div className="card p-10 text-center text-[#7a7a85] text-sm">
          Немає регіонів. Додайте їх у розділі «Регіони».
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {regions.map(r => {
            const m = mode(r);
            const M = MODE[m] || MODE.stopped;
            const isBusy = busy === r.id;
            return (
              <div key={r.id} className={`card p-4 flex flex-col gap-3 transition-all ${m !== 'stopped' ? 'border-[#383840]' : ''}`}>
                {/* Top row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-white truncate">{r.name}</div>
                    <div className="text-xs text-[#5a5a62] font-mono mt-0.5 truncate">{r.icecast_mount}</div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <div className={`w-2 h-2 rounded-full ${M.dot}`} />
                    <span className={`text-xs font-bold ${M.text}`}>{M.label}</span>
                  </div>
                </div>

                {/* Current file */}
                {r.live?.currentFile && (
                  <div className="flex items-center gap-2 bg-[#ff732e]/8 border border-[#ff732e]/20 rounded-lg px-2.5 py-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#ff732e] animate-pulse flex-shrink-0" />
                    <span className="text-xs text-[#ff732e] truncate">{r.live.currentFile}</span>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 mt-auto">
                  {m === 'stopped' && (
                    <button disabled={isBusy}
                      onClick={() => action(() => api.startMain(r.id), r.id)}
                      className="flex-1 py-2 text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/20 rounded-lg transition-colors disabled:opacity-50">
                      {isBusy ? '...' : '▶ Запустити'}
                    </button>
                  )}
                  {m === 'main' && (
                    <>
                      <button disabled={isBusy}
                        onClick={() => { setTriggerModal(r); setSelPlaylist(''); setSelFiller(''); }}
                        className="flex-1 py-2 text-xs font-semibold bg-[#ff732e]/15 hover:bg-[#ff732e]/25 text-[#ff732e] border border-[#ff732e]/20 rounded-lg transition-colors">
                        📣 Реклама
                      </button>
                      <button disabled={isBusy}
                        onClick={() => action(() => api.stopRegion(r.id), r.id)}
                        className="py-2 px-3 text-xs bg-[#383840] hover:bg-red-900/30 text-[#7a7a85] hover:text-red-400 border border-[#383840] rounded-lg transition-colors">
                        ■
                      </button>
                    </>
                  )}
                  {(m === 'ad' || m === 'filler') && (
                    <>
                      <button disabled={isBusy}
                        onClick={() => action(() => api.returnToMain(r.id), r.id)}
                        className="flex-1 py-2 text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/20 rounded-lg transition-colors disabled:opacity-50">
                        {isBusy ? '...' : '↩ В ефір'}
                      </button>
                      <button disabled={isBusy}
                        onClick={() => action(() => api.stopRegion(r.id), r.id)}
                        className="py-2 px-3 text-xs bg-[#383840] hover:bg-red-900/30 text-[#7a7a85] hover:text-red-400 border border-[#383840] rounded-lg transition-colors">
                        ■
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Trigger Modal */}
      {triggerModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setTriggerModal(null)}>
          <div className="modal-box">
            <div className="px-5 pt-5 pb-4 border-b border-[#383840]">
              <div className="text-xs text-[#7a7a85] mb-1">Регіон</div>
              <h2 className="text-base font-bold text-white">{triggerModal.name}</h2>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs text-[#7a7a85] mb-2 block">Плейлист реклами *</label>
                <Select value={selPlaylist} onChange={e => setSelPlaylist(e.target.value)}>
                  <option value="">— оберіть плейлист —</option>
                  {playlists.filter(p => p.type === 'ad').map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.item_count} файлів)</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="text-xs text-[#7a7a85] mb-2 block">Філер після реклами</label>
                <Select value={selFiller} onChange={e => setSelFiller(e.target.value)}>
                  <option value="">— без філера (повернення в ефір) —</option>
                  {playlists.filter(p => p.type === 'filler').map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button onClick={handleTrigger} disabled={!selPlaylist} className="btn-primary flex-1">
                Запустити рекламу
              </button>
              <button onClick={() => setTriggerModal(null)} className="btn-ghost">
                Скасувати
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
