import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Select } from '../components/Select';

const RETURN_MODES = [
  { value: 'signal', label: 'Чекати сигнал (API / тон)' },
  { value: 'playlist_end', label: 'Автоповернення після плейлиста' },
  { value: 'timer', label: 'За таймером' },
];

const empty = {
  name: '', slug: '', icecast_mount: '',
  crossfade_sec: 3, return_mode: 'signal', return_timer_sec: 0, enabled: true,
};

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

export default function RegionsPage() {
  const navigate = useNavigate();
  const [regions, setRegions] = useState<any[]>([]);
  const [modal, setModal] = useState<null | 'create' | number>(null);
  const [form, setForm] = useState({ ...empty });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ message: string; onConfirm: () => void } | null>(null);

  const load = async () => setRegions(await api.getRegions());
  useEffect(() => { load(); }, []);

  const openCreate = () => { setForm({ ...empty }); setModal('create'); };
  const openEdit = (r: any) => {
    setForm({ name: r.name, slug: r.slug, icecast_mount: r.icecast_mount,
      crossfade_sec: r.crossfade_sec, return_mode: r.return_mode,
      return_timer_sec: r.return_timer_sec, enabled: r.enabled });
    setModal(r.id);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      if (modal === 'create') await api.createRegion(form);
      else await api.updateRegion(modal as number, form);
      setModal(null); await load();
    } catch (e: any) {
      setError(e.message);
      setTimeout(() => setError(null), 4000);
    } finally { setSaving(false); }
  };

  const del = (id: number) => {
    setConfirm({
      message: 'Видалити регіон? Це також видалить всі пов\'язані розклади та призначення.',
      onConfirm: async () => {
        setConfirm(null);
        try { await api.deleteRegion(id); await load(); }
        catch (e: any) { setError(e.message); setTimeout(() => setError(null), 4000); }
      },
    });
  };

  const f = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));
  const valid = form.name && form.slug && form.icecast_mount;

  return (
    <div className="p-4 sm:p-6">
      {error && (
        <div className="fixed top-4 right-4 z-50 bg-red-500/15 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-xl shadow-lg max-w-sm">
          {error}
        </div>
      )}
      {confirm && <ConfirmDialog message={confirm.message} onConfirm={confirm.onConfirm} onCancel={() => setConfirm(null)} />}
      <div className="page-header">
        <h1 className="page-title">Регіони</h1>
        <button onClick={openCreate} className="btn-primary">+ Додати</button>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3">
        {regions.map(r => (
          <div key={r.id} className="card p-4 cursor-pointer hover:border-[#ff732e]/20 transition-colors"
            onClick={() => navigate(`/regions/${r.id}`)}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="font-semibold text-white">{r.name}</div>
                <div className="text-xs text-[#5a5a62] font-mono mt-0.5">{r.icecast_mount}</div>
              </div>
              <span className={`badge mt-0.5 ${r.enabled ? 'bg-emerald-500/15 text-emerald-400' : 'bg-[#383840] text-[#7a7a85]'}`}>
                {r.enabled ? 'Активний' : 'Вимкнений'}
              </span>
            </div>
            <div className="text-xs text-[#7a7a85] mb-3">
              Crossfade: {r.crossfade_sec}с · {RETURN_MODES.find(m => m.value === r.return_mode)?.label}
            </div>
            <div className="flex gap-2">
              <button onClick={e => { e.stopPropagation(); navigate(`/regions/${r.id}`); }} className="btn-ghost flex-1 text-xs py-2">Відкрити</button>
              <button onClick={e => { e.stopPropagation(); openEdit(r); }} className="btn-ghost text-xs py-2 px-3">✎</button>
              <button onClick={e => { e.stopPropagation(); del(r.id); }} className="btn-danger border border-[#383840] rounded-lg px-3 py-2">✕</button>
            </div>
          </div>
        ))}
        {!regions.length && (
          <div className="card p-10 text-center text-[#7a7a85] text-sm">Немає регіонів</div>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#383840]">
                <th className="th">Назва</th>
                <th className="th">Icecast маунт</th>
                <th className="th">Статус</th>
                <th className="th">Crossfade</th>
                <th className="th">Повернення</th>
                <th className="th w-24"></th>
              </tr>
            </thead>
            <tbody>
              {regions.map(r => (
                <tr key={r.id} className="hover:bg-[#383840]/40 transition-colors cursor-pointer"
                  onClick={() => navigate(`/regions/${r.id}`)}>
                  <td className="td font-semibold text-white hover:text-[#ff732e] transition-colors">{r.name}</td>
                  <td className="td font-mono text-xs text-[#7a7a85]">{r.icecast_mount}</td>
                  <td className="td">
                    <span className={`badge ${r.enabled ? 'bg-emerald-500/15 text-emerald-400' : 'bg-[#383840] text-[#7a7a85]'}`}>
                      {r.enabled ? 'Активний' : 'Вимкнений'}
                    </span>
                  </td>
                  <td className="td text-[#7a7a85]">{r.crossfade_sec}с</td>
                  <td className="td text-[#7a7a85] text-xs max-w-[180px] truncate">
                    {RETURN_MODES.find(m => m.value === r.return_mode)?.label}
                    {r.return_mode === 'timer' && ` (${r.return_timer_sec}с)`}
                  </td>
                  <td className="td text-right" onClick={e => e.stopPropagation()}>
                    <button onClick={() => openEdit(r)} className="text-blue-400 hover:text-blue-300 text-xs mr-3">Редаг.</button>
                    <button onClick={() => del(r.id)} className="text-red-400 hover:text-red-300 text-xs">Видалити</button>
                  </td>
                </tr>
              ))}
              {!regions.length && (
                <tr><td colSpan={6} className="td text-center py-10 text-[#7a7a85]">Немає регіонів</td></tr>
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
                {modal === 'create' ? 'Новий регіон' : 'Редагувати регіон'}
              </h2>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs text-[#7a7a85] mb-1.5 block">Назва *</label>
                <input value={form.name} onChange={e => f('name', e.target.value)} className="input" placeholder="Схід" />
              </div>
              <div>
                <label className="text-xs text-[#7a7a85] mb-1.5 block">Slug (латиниця) *</label>
                <input value={form.slug}
                  onChange={e => f('slug', e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                  className="input" placeholder="east" />
              </div>
              <div>
                <label className="text-xs text-[#7a7a85] mb-1.5 block">Icecast маунт *</label>
                <input value={form.icecast_mount} onChange={e => f('icecast_mount', e.target.value)} className="input" placeholder="/region_east" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#7a7a85] mb-1.5 block">Crossfade (сек)</label>
                  <input type="number" min={0} max={10} value={form.crossfade_sec}
                    onChange={e => f('crossfade_sec', +e.target.value)} className="input" />
                </div>
                <div>
                  <label className="text-xs text-[#7a7a85] mb-1.5 block">Повернення в ефір</label>
                  <Select value={form.return_mode} onChange={e => f('return_mode', e.target.value)}>
                    {RETURN_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </Select>
                </div>
              </div>
              {form.return_mode === 'timer' && (
                <div>
                  <label className="text-xs text-[#7a7a85] mb-1.5 block">Таймер (сек)</label>
                  <input type="number" min={0} value={form.return_timer_sec}
                    onChange={e => f('return_timer_sec', +e.target.value)} className="input" />
                </div>
              )}
              <label className="flex items-center gap-3 cursor-pointer py-1">
                <div className={`w-9 h-5 rounded-full transition-colors relative ${form.enabled ? 'bg-[#ff732e]' : 'bg-[#383840]'}`}
                  onClick={() => f('enabled', !form.enabled)}>
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.enabled ? 'left-4' : 'left-0.5'}`} />
                </div>
                <span className="text-sm text-gray-300">Регіон активний</span>
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
