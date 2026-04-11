import { useEffect, useState } from 'react';
import { api } from '../api';
import { Select } from '../components/Select';

const DAYS = [
  { value: 'all', label: 'Щодня' },
  { value: 'mon,tue,wed,thu,fri', label: 'Пн–Пт' },
  { value: 'sat,sun', label: 'Сб–Нд' },
  { value: 'mon', label: 'Понеділок' },
  { value: 'tue', label: 'Вівторок' },
  { value: 'wed', label: 'Середа' },
  { value: 'thu', label: 'Четвер' },
  { value: 'fri', label: "П'ятниця" },
  { value: 'sat', label: 'Субота' },
  { value: 'sun', label: 'Неділя' },
];

const empty = { region_id: '', playlist_id: '', days: 'all', times: [''], enabled: true };

function ConfirmDialog({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-[#212126] border border-[#383840] rounded-2xl p-6 w-80 shadow-2xl">
        <p className="text-white text-sm mb-6 leading-relaxed">{message}</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="px-4 py-2 rounded-xl text-xs text-[#9a9aa5] hover:text-white hover:bg-[#383840] transition-colors">Скасувати</button>
          <button onClick={onConfirm} className="px-4 py-2 rounded-xl text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 hover:text-red-300 transition-colors">Видалити</button>
        </div>
      </div>
    </div>
  );
}

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<any[]>([]);
  const [regions, setRegions] = useState<any[]>([]);
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [modal, setModal] = useState<null | 'create' | number>(null);
  const [form, setForm] = useState<any>(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ message: string; onConfirm: () => void } | null>(null);

  const load = async () => {
    const [s, r, p] = await Promise.all([api.getSchedules(), api.getRegions(), api.getPlaylists()]);
    setSchedules(s); setRegions(r); setPlaylists(p);
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => { setForm({ ...empty, times: [''] }); setModal('create'); };
  const openEdit = (s: any) => {
    let times: string[] = [];
    try { times = JSON.parse(s.times); } catch {}
    setForm({ region_id: String(s.region_id), playlist_id: String(s.playlist_id),
      days: s.days, times: times.length ? times : [''], enabled: s.enabled });
    setModal(s.id);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const data = { ...form, region_id: +form.region_id, playlist_id: +form.playlist_id,
        times: form.times.filter((t: string) => t.trim()) };
      if (modal === 'create') await api.createSchedule(data);
      else await api.updateSchedule(modal as number, data);
      setModal(null); await load();
    } catch (e: any) {
      setError(e.message);
      setTimeout(() => setError(null), 4000);
    } finally { setSaving(false); }
  };

  const del = (id: number) => {
    setConfirm({
      message: 'Видалити розклад?',
      onConfirm: async () => {
        setConfirm(null);
        try { await api.deleteSchedule(id); await load(); }
        catch (e: any) { setError(e.message); setTimeout(() => setError(null), 4000); }
      },
    });
  };

  const parseTimes = (s: any): string[] => { try { return JSON.parse(s.times); } catch { return []; } };
  const f = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));
  const addTime = () => f('times', [...form.times, '']);
  const setTime = (i: number, v: string) => f('times', form.times.map((t: string, idx: number) => idx === i ? v : t));
  const removeTime = (i: number) => f('times', form.times.filter((_: any, idx: number) => idx !== i));

  const valid = form.region_id && form.playlist_id && form.times.some((t: string) => t.trim());

  return (
    <div className="p-4 sm:p-6">
      {error && (
        <div className="fixed top-4 right-4 z-50 bg-red-500/15 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-xl shadow-lg max-w-sm">
          {error}
        </div>
      )}
      {confirm && <ConfirmDialog message={confirm.message} onConfirm={confirm.onConfirm} onCancel={() => setConfirm(null)} />}
      <div className="page-header">
        <h1 className="page-title">Розклад</h1>
        <button onClick={openCreate} className="btn-primary">+ Додати</button>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3">
        {schedules.map(s => {
          const times = parseTimes(s);
          return (
            <div key={s.id} className="card p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="font-semibold text-white text-sm">{s.region_name}</div>
                  <div className="text-xs text-[#7a7a85] mt-0.5">{s.playlist_name}</div>
                </div>
                <span className={`badge ${s.enabled ? 'bg-emerald-500/15 text-emerald-400' : 'bg-[#383840] text-[#7a7a85]'}`}>
                  {s.enabled ? 'Активний' : 'Вимкнений'}
                </span>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs text-[#7a7a85]">{DAYS.find(d => d.value === s.days)?.label || s.days}</span>
                <span className="text-[#30303a]">·</span>
                <span className="text-xs font-mono text-[#ff732e]">{times.join(', ')}</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => openEdit(s)} className="btn-ghost flex-1 text-xs py-2">Редагувати</button>
                <button onClick={() => del(s.id)} className="btn-danger border border-[#383840] rounded-lg px-3 py-2">✕</button>
              </div>
            </div>
          );
        })}
        {!schedules.length && (
          <div className="card p-10 text-center text-[#7a7a85] text-sm">Немає розкладу</div>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#383840]">
                <th className="th">Регіон</th>
                <th className="th">Плейлист</th>
                <th className="th">Дні</th>
                <th className="th">Час</th>
                <th className="th">Статус</th>
                <th className="th w-28"></th>
              </tr>
            </thead>
            <tbody>
              {schedules.map(s => {
                const times = parseTimes(s);
                return (
                  <tr key={s.id} className="hover:bg-[#383840]/40 transition-colors">
                    <td className="td font-semibold text-white">{s.region_name}</td>
                    <td className="td text-[#7a7a85]">{s.playlist_name}</td>
                    <td className="td text-[#7a7a85] text-xs">{DAYS.find(d => d.value === s.days)?.label || s.days}</td>
                    <td className="td font-mono text-xs text-[#ff732e]">{times.join(', ')}</td>
                    <td className="td">
                      <span className={`badge ${s.enabled ? 'bg-emerald-500/15 text-emerald-400' : 'bg-[#383840] text-[#7a7a85]'}`}>
                        {s.enabled ? 'Активний' : 'Вимкнений'}
                      </span>
                    </td>
                    <td className="td text-right">
                      <button onClick={() => openEdit(s)} className="text-blue-400 hover:text-blue-300 text-xs mr-3">Редаг.</button>
                      <button onClick={() => del(s.id)} className="text-red-400 hover:text-red-300 text-xs">Видалити</button>
                    </td>
                  </tr>
                );
              })}
              {!schedules.length && (
                <tr><td colSpan={6} className="td text-center py-10 text-[#7a7a85]">Немає розкладу</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal-box max-h-[90vh] overflow-y-auto">
            <div className="px-5 pt-5 pb-4 border-b border-[#383840]">
              <h2 className="text-base font-bold text-white">
                {modal === 'create' ? 'Новий розклад' : 'Редагувати розклад'}
              </h2>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs text-[#7a7a85] mb-1.5 block">Регіон *</label>
                <Select value={form.region_id} onChange={e => f('region_id', e.target.value)}>
                  <option value="">— оберіть регіон —</option>
                  {regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </Select>
              </div>
              <div>
                <label className="text-xs text-[#7a7a85] mb-1.5 block">Плейлист реклами *</label>
                <Select value={form.playlist_id} onChange={e => f('playlist_id', e.target.value)}>
                  <option value="">— оберіть плейлист —</option>
                  {playlists.filter(p => p.type === 'ad').map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="text-xs text-[#7a7a85] mb-1.5 block">Дні тижня</label>
                <Select value={form.days} onChange={e => f('days', e.target.value)}>
                  {DAYS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </Select>
              </div>
              <div>
                <label className="text-xs text-[#7a7a85] mb-1.5 block">Час виходу</label>
                <div className="space-y-2">
                  {form.times.map((t: string, i: number) => (
                    <div key={i} className="flex gap-2">
                      <input type="text" value={t} onChange={e => setTime(i, e.target.value)}
                        placeholder="HH:MM" maxLength={5} className="input flex-1 font-mono" />
                      {form.times.length > 1 && (
                        <button onClick={() => removeTime(i)} className="px-3 text-red-400 hover:text-red-300 text-sm">✕</button>
                      )}
                    </div>
                  ))}
                  <button onClick={addTime} className="text-xs text-[#ff732e] hover:text-yellow-300 py-1">+ Додати час</button>
                </div>
              </div>
              <label className="flex items-center gap-3 cursor-pointer py-1" onClick={() => f('enabled', !form.enabled)}>
                <div className={`w-9 h-5 rounded-full transition-colors relative ${form.enabled ? 'bg-[#ff732e]' : 'bg-[#383840]'}`}>
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.enabled ? 'left-4' : 'left-0.5'}`} />
                </div>
                <span className="text-sm text-gray-300">Активний</span>
              </label>
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button onClick={save} disabled={saving || !valid} className="btn-primary flex-1">
                {saving ? 'Збереження...' : 'Зберегти'}
              </button>
              <button onClick={() => setModal(null)} className="btn-ghost">Скасувати</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
