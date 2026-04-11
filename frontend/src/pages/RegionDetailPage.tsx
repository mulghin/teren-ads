import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, uploadFiles } from '../api';
import { Select } from '../components/Select';

const BACKEND = '';
const DAYS_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

const fmtDur = (sec: number) => {
  if (!sec) return '—';
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

function ConfirmDialog({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-[#212126] border border-[#383840] rounded-2xl p-6 w-80 shadow-2xl">
        <p className="text-white text-sm mb-6 leading-relaxed">{message}</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel}
            className="px-4 py-2 rounded-xl text-xs text-[#9a9aa5] hover:text-white hover:bg-[#383840] transition-colors">
            Скасувати
          </button>
          <button onClick={onConfirm}
            className="px-4 py-2 rounded-xl text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 hover:text-red-300 transition-colors">
            Видалити
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── PLAYLISTS TAB ───────────────────────────────────────────────────────────

function PlaylistsTab({ regionId }: { regionId: number }) {
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('ad');
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [playingItem, setPlayingItem] = useState<any>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirm, setConfirm] = useState<{ message: string; onConfirm: () => void } | null>(null);

  const loadPlaylists = async () => setPlaylists(await api.getPlaylists(regionId));
  const loadItems = async (id: number) => { const p = await api.getPlaylist(id); setItems(p.items || []); };

  useEffect(() => { loadPlaylists(); }, [regionId]);
  useEffect(() => { if (selected) loadItems(selected.id); }, [selected?.id]);

  const playItem = (item: any) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.ontimeupdate = null;
      audioRef.current.onended = null;
      audioRef.current = null;
    }
    if (playingItem?.id === item.id) { setPlayingItem(null); setCurrentTime(0); setAudioDuration(0); return; }
    const uploadsIdx = item.filepath.indexOf('/uploads/');
    const url = `${BACKEND}${uploadsIdx !== -1 ? item.filepath.slice(uploadsIdx) : ''}`;
    const audio = new Audio(url);
    audioRef.current = audio;
    setPlayingItem(item); setCurrentTime(0);
    audio.play();
    audio.onloadedmetadata = () => setAudioDuration(audio.duration);
    audio.ontimeupdate = () => setCurrentTime(audio.currentTime);
    audio.onended = () => { setPlayingItem(null); setCurrentTime(0); setAudioDuration(0); };
    audio.onerror = () => { setPlayingItem(null); setCurrentTime(0); setAudioDuration(0); };
  };

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const create = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const p = await api.createPlaylist({ name: newName, type: newType, shuffle: false, region_id: regionId });
      await loadPlaylists(); setSelected(p); setNewName('');
    } finally { setCreating(false); }
  };

  const del = (id: number) => {
    setConfirm({ message: 'Видалити плейлист разом з усіма файлами?', onConfirm: async () => {
      setConfirm(null);
      await api.deletePlaylist(id);
      if (selected?.id === id) setSelected(null);
      await loadPlaylists();
    }});
  };

  const delItem = (itemId: number, filename: string) => {
    setConfirm({ message: `Видалити файл «${filename}»?`, onConfirm: async () => {
      setConfirm(null);
      if (playingItem?.id === itemId) playItem(playingItem);
      await api.deleteItem(selected.id, itemId);
      await loadItems(selected.id); await loadPlaylists();
    }});
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !selected) return;
    setUploading(true);
    try {
      await uploadFiles(selected.id, files);
      await loadItems(selected.id); await loadPlaylists();
    } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const toggleShuffle = async () => {
    const updated = { ...selected, shuffle: !selected.shuffle };
    await api.updatePlaylist(selected.id, updated);
    setSelected(updated);
    setPlaylists(prev => prev.map(p => p.id === updated.id ? { ...p, shuffle: updated.shuffle } : p));
  };

  const totalDur = items.reduce((s, i) => s + (i.duration_sec || 0), 0);

  return (
    <div className="flex h-full overflow-hidden">
      {confirm && <ConfirmDialog message={confirm.message} onConfirm={confirm.onConfirm} onCancel={() => setConfirm(null)} />}

      {/* Sidebar */}
      <div className="flex flex-col w-64 flex-shrink-0 border-r border-[#383840] p-4 overflow-hidden">
        <div className="card p-3 space-y-2 flex-shrink-0 mb-3">
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Назва плейлиста"
            className="input text-sm" onKeyDown={e => e.key === 'Enter' && create()} />
          <div className="grid grid-cols-2 gap-2">
            <Select value={newType} onChange={e => setNewType(e.target.value)}>
              <option value="ad">📣 Реклама</option>
              <option value="filler">🎵 Філер</option>
            </Select>
            <button onClick={create} disabled={creating || !newName.trim()} className="btn-primary text-xs py-2">
              {creating ? '...' : 'Створити'}
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto space-y-1">
          {playlists.map(p => (
            <div key={p.id} onClick={() => setSelected(p)}
              className={`rounded-xl px-3 py-3 cursor-pointer flex items-center justify-between group transition-all border ` +
                (selected?.id === p.id
                  ? 'bg-[#ff732e]/8 border-[#ff732e]/25 text-[#ff732e]'
                  : 'border-transparent hover:bg-[#383840] text-[#9a9aa5] hover:text-white')}>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{p.name}</div>
                <div className="text-xs text-[#7a7a85] mt-0.5">{p.type === 'ad' ? '📣' : '🎵'} {p.item_count} файлів</div>
              </div>
              <button onClick={e => { e.stopPropagation(); del(p.id); }}
                className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 text-sm ml-2 flex-shrink-0 transition-opacity">✕</button>
            </div>
          ))}
          {!playlists.length && <div className="text-center py-6 text-[#5a5a62] text-sm">Немає плейлистів</div>}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden p-4">
        {!selected ? (
          <div className="card flex-1 flex items-center justify-center text-[#7a7a85] text-sm">
            Оберіть або створіть плейлист
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-white truncate">{selected.name}</h3>
                {items.length > 0 && <div className="text-xs text-[#7a7a85] mt-0.5">{items.length} файлів · {fmtDur(totalDur)}</div>}
              </div>
              <label className="flex items-center gap-2 cursor-pointer flex-shrink-0" onClick={toggleShuffle}>
                <div className={`w-8 h-4 rounded-full transition-colors relative ${selected.shuffle ? 'bg-[#ff732e]' : 'bg-[#383840]'}`}>
                  <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${selected.shuffle ? 'left-4' : 'left-0.5'}`} />
                </div>
                <span className="text-xs text-[#9a9aa5]">Shuffle</span>
              </label>
              <input ref={fileRef} type="file" multiple accept="audio/*" className="hidden" onChange={handleUpload} />
              <button onClick={() => fileRef.current?.click()} disabled={uploading} className="btn-primary text-xs py-2">
                {uploading ? 'Завантаження...' : '+ Файли'}
              </button>
            </div>
            <div className="card flex-1 overflow-hidden flex flex-col min-h-0">
              {items.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center"><div className="text-3xl mb-3">🎵</div>
                    <div className="text-[#7a7a85] text-sm">Натисніть «+ Файли» для завантаження</div></div>
                </div>
              ) : (
                <>
                  <div className="overflow-auto flex-1">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-[#212126]">
                        <tr className="border-b border-[#383840]">
                          <th className="th w-10">#</th>
                          <th className="th w-8"></th>
                          <th className="th">Файл</th>
                          <th className="th text-right w-20">Тривалість</th>
                          <th className="th w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, i) => (
                          <tr key={item.id} className={`transition-colors ${playingItem?.id === item.id ? 'bg-[#ff732e]/5' : 'hover:bg-[#383840]/40'}`}>
                            <td className="td text-[#7a7a85] w-10">{i + 1}</td>
                            <td className="td w-8">
                              <button onClick={() => playItem(item)}
                                className={`text-base leading-none transition-colors ${playingItem?.id === item.id ? 'text-[#ff732e]' : 'text-[#7a7a85] hover:text-white'}`}>
                                {playingItem?.id === item.id ? '⏹' : '▶'}
                              </button>
                            </td>
                            <td className="td font-medium text-white">
                              <div className="truncate max-w-[200px]" title={item.filename}>{item.filename}</div>
                            </td>
                            <td className="td text-right text-[#7a7a85] font-mono text-xs w-20">{fmtDur(item.duration_sec)}</td>
                            <td className="td w-10 text-right">
                              <button onClick={() => delItem(item.id, item.filename)} className="text-red-400 hover:text-red-300 text-xs">✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {playingItem && (
                    <div className="border-t border-[#383840] px-4 py-3 flex-shrink-0 bg-[#121214]">
                      <div className="flex items-center gap-3">
                        <button onClick={() => playItem(playingItem)} className="text-[#ff732e] text-base flex-shrink-0">⏹</button>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-[#9a9aa5] truncate mb-1">{playingItem.filename}</div>
                          <input type="range" min={0} max={audioDuration || 1} step={0.1} value={currentTime}
                            onChange={e => { const v = Number(e.target.value); if (audioRef.current) audioRef.current.currentTime = v; setCurrentTime(v); }}
                            className="w-full h-1 accent-[#ff732e] cursor-pointer" />
                        </div>
                        <div className="text-xs font-mono text-[#7a7a85] flex-shrink-0 w-20 text-right">
                          {fmtDur(currentTime)} / {fmtDur(audioDuration)}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── SCHEDULES TAB ───────────────────────────────────────────────────────────

const emptySchedule = {
  label: '', time_hhmm: '13:00', tolerance_minutes: 10,
  playlist_id: '', filler_playlist_id: '', days: '1234567', is_active: true,
};

function SchedulesTab({ regionId }: { regionId: number }) {
  const [schedules, setSchedules] = useState<any[]>([]);
  const [allPlaylists, setAllPlaylists] = useState<any[]>([]);
  const [modal, setModal] = useState<null | 'create' | number>(null);
  const [form, setForm] = useState({ ...emptySchedule });
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<{ message: string; onConfirm: () => void } | null>(null);

  const load = async () => {
    const [s, p] = await Promise.all([api.getRegionSchedules(regionId), api.getPlaylists()]);
    setSchedules(s); setAllPlaylists(p);
  };
  useEffect(() => { load(); }, [regionId]);

  const f = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const openCreate = () => { setForm({ ...emptySchedule }); setModal('create'); };
  const openEdit = (s: any) => {
    setForm({
      label: s.label, time_hhmm: s.time_hhmm, tolerance_minutes: s.tolerance_minutes,
      playlist_id: String(s.playlist_id), filler_playlist_id: s.filler_playlist_id ? String(s.filler_playlist_id) : '',
      days: s.days, is_active: s.is_active,
    });
    setModal(s.id);
  };

  const save = async () => {
    setSaving(true);
    try {
      const data = {
        ...form,
        playlist_id: Number(form.playlist_id),
        filler_playlist_id: form.filler_playlist_id ? Number(form.filler_playlist_id) : null,
        tolerance_minutes: Number(form.tolerance_minutes),
      };
      if (modal === 'create') await api.createRegionSchedule(regionId, data);
      else await api.updateRegionSchedule(regionId, modal as number, data);
      setModal(null); await load();
    } finally { setSaving(false); }
  };

  const del = (id: number) => {
    setConfirm({ message: 'Видалити запис розкладу?', onConfirm: async () => {
      setConfirm(null);
      await api.deleteRegionSchedule(regionId, id); await load();
    }});
  };

  const toggleDay = (day: string) => {
    const cur = form.days;
    const next = cur.includes(day) ? cur.replace(day, '') : (cur + day).split('').sort().join('');
    f('days', next);
  };

  const valid = form.time_hhmm && form.playlist_id;

  const fmtDays = (days: string) => {
    if (days === '1234567') return 'Щодня';
    if (days === '12345') return 'Пн–Пт';
    if (days === '67') return 'Сб–Нд';
    return DAYS_LABELS.filter((_, i) => days.includes(String(i + 1))).join(', ');
  };

  return (
    <div className="p-4 sm:p-6">
      {confirm && <ConfirmDialog message={confirm.message} onConfirm={confirm.onConfirm} onCancel={() => setConfirm(null)} />}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-base font-semibold text-white">Розклад за часом</h3>
          <p className="text-xs text-[#7a7a85] mt-1">
            Коли тоновий сигнал приходить у вказаний час ±допуск — автоматично запускається цей плейлист
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary text-sm">+ Додати</button>
      </div>

      {schedules.length === 0 ? (
        <div className="card p-10 text-center text-[#7a7a85] text-sm">Немає записів розкладу</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#383840]">
                <th className="th">Назва</th>
                <th className="th">Час</th>
                <th className="th">Допуск</th>
                <th className="th">Дні</th>
                <th className="th">Плейлист</th>
                <th className="th">Філер</th>
                <th className="th w-20">Стан</th>
                <th className="th w-24"></th>
              </tr>
            </thead>
            <tbody>
              {schedules.map(s => (
                <tr key={s.id} className="hover:bg-[#383840]/40 transition-colors">
                  <td className="td text-white">{s.label || '—'}</td>
                  <td className="td font-mono text-[#ff732e] font-semibold">{s.time_hhmm}</td>
                  <td className="td text-[#7a7a85]">±{s.tolerance_minutes} хв</td>
                  <td className="td text-[#7a7a85] text-xs">{fmtDays(s.days)}</td>
                  <td className="td text-white">{s.playlist_name}</td>
                  <td className="td text-[#7a7a85] text-xs">{s.filler_playlist_name || '—'}</td>
                  <td className="td">
                    <span className={`badge ${s.is_active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-[#383840] text-[#7a7a85]'}`}>
                      {s.is_active ? 'Активний' : 'Вимкнений'}
                    </span>
                  </td>
                  <td className="td text-right">
                    <button onClick={() => openEdit(s)} className="text-blue-400 hover:text-blue-300 text-xs mr-3">Редаг.</button>
                    <button onClick={() => del(s.id)} className="text-red-400 hover:text-red-300 text-xs">Видалити</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal-box max-h-[90vh] overflow-y-auto">
            <div className="px-5 pt-5 pb-4 border-b border-[#383840]">
              <h2 className="text-base font-bold text-white">{modal === 'create' ? 'Новий запис розкладу' : 'Редагувати'}</h2>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs text-[#7a7a85] mb-1.5 block">Назва (опціонально)</label>
                <input value={form.label} onChange={e => f('label', e.target.value)} className="input" placeholder="Обід, Ранок…" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#7a7a85] mb-1.5 block">Час запуску *</label>
                  <input type="time" value={form.time_hhmm} onChange={e => f('time_hhmm', e.target.value)} className="input" />
                </div>
                <div>
                  <label className="text-xs text-[#7a7a85] mb-1.5 block">Допуск (хвилин)</label>
                  <input type="number" min={0} max={60} value={form.tolerance_minutes}
                    onChange={e => f('tolerance_minutes', e.target.value)} className="input" />
                </div>
              </div>
              <div>
                <label className="text-xs text-[#7a7a85] mb-2 block">Дні тижня</label>
                <div className="flex gap-1.5 flex-wrap">
                  {DAYS_LABELS.map((d, i) => (
                    <button key={i} type="button" onClick={() => toggleDay(String(i + 1))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ` +
                        (form.days.includes(String(i + 1))
                          ? 'bg-[#ff732e]/15 border-[#ff732e]/40 text-[#ff732e]'
                          : 'bg-transparent border-[#383840] text-[#7a7a85] hover:border-[#5a5a62] hover:text-[#9a9aa5]')}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-[#7a7a85] mb-1.5 block">Плейлист *</label>
                <Select value={form.playlist_id} onChange={e => f('playlist_id', e.target.value)}>
                  <option value="">— оберіть —</option>
                  {allPlaylists.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </div>
              <div>
                <label className="text-xs text-[#7a7a85] mb-1.5 block">Філер (опціонально)</label>
                <Select value={form.filler_playlist_id} onChange={e => f('filler_playlist_id', e.target.value)}>
                  <option value="">— без філера —</option>
                  {allPlaylists.filter(p => p.type === 'filler').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </div>
              <label className="flex items-center gap-3 cursor-pointer py-1">
                <div className={`w-9 h-5 rounded-full transition-colors relative ${form.is_active ? 'bg-[#ff732e]' : 'bg-[#383840]'}`}
                  onClick={() => f('is_active', !form.is_active)}>
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.is_active ? 'left-4' : 'left-0.5'}`} />
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

// ─── ASSIGNMENTS TAB ─────────────────────────────────────────────────────────

function AssignmentsTab({ regionId }: { regionId: number }) {
  const [assignments, setAssignments] = useState<any[]>([]);
  const [allPlaylists, setAllPlaylists] = useState<any[]>([]);
  const [form, setForm] = useState({ playlist_id: '', filler_playlist_id: '', priority: 0, active: true });
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<{ message: string; onConfirm: () => void } | null>(null);

  const load = async () => {
    const [a, p] = await Promise.all([api.getAssignments(regionId), api.getPlaylists()]);
    setAssignments(a); setAllPlaylists(p);
  };
  useEffect(() => { load(); }, [regionId]);

  const f = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const add = async () => {
    if (!form.playlist_id) return;
    setSaving(true);
    try {
      await api.addAssignment(regionId, {
        playlist_id: Number(form.playlist_id),
        filler_playlist_id: form.filler_playlist_id ? Number(form.filler_playlist_id) : null,
        priority: Number(form.priority),
        active: form.active,
      });
      setForm({ playlist_id: '', filler_playlist_id: '', priority: 0, active: true });
      await load();
    } finally { setSaving(false); }
  };

  const del = (aid: number) => {
    setConfirm({ message: 'Видалити призначення?', onConfirm: async () => {
      setConfirm(null);
      await api.deleteAssignment(regionId, aid); await load();
    }});
  };

  const playlists = allPlaylists;

  return (
    <div className="p-4 sm:p-6">
      {confirm && <ConfirmDialog message={confirm.message} onConfirm={confirm.onConfirm} onCancel={() => setConfirm(null)} />}
      <div className="mb-5">
        <h3 className="text-base font-semibold text-white">Призначення плейлистів</h3>
        <p className="text-xs text-[#7a7a85] mt-1">
          Запасний плейлист при тоновому сигналі, якщо жоден рядок розкладу не підходить за часом
        </p>
      </div>

      {/* Add form */}
      <div className="card p-4 mb-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          <div>
            <label className="text-xs text-[#7a7a85] mb-1 block">Плейлист *</label>
            <Select value={form.playlist_id} onChange={e => f('playlist_id', e.target.value)}>
              <option value="">— оберіть —</option>
              {playlists.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-xs text-[#7a7a85] mb-1 block">Філер</label>
            <Select value={form.filler_playlist_id} onChange={e => f('filler_playlist_id', e.target.value)}>
              <option value="">— без філера —</option>
              {playlists.filter(p => p.type === 'filler').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-xs text-[#7a7a85] mb-1 block">Пріоритет</label>
            <input type="number" value={form.priority} onChange={e => f('priority', +e.target.value)} className="input" />
          </div>
          <div className="flex items-end">
            <button onClick={add} disabled={saving || !form.playlist_id} className="btn-primary w-full text-sm">
              {saving ? '...' : '+ Додати'}
            </button>
          </div>
        </div>
      </div>

      {assignments.length === 0 ? (
        <div className="card p-8 text-center text-[#7a7a85] text-sm">Немає призначень</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#383840]">
                <th className="th">Плейлист</th>
                <th className="th">Філер</th>
                <th className="th">Пріоритет</th>
                <th className="th w-20">Стан</th>
                <th className="th w-16"></th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a: any) => {
                const pl = playlists.find((p: any) => p.id === a.playlist_id);
                const fl = playlists.find((p: any) => p.id === a.filler_playlist_id);
                return (
                  <tr key={a.id} className="hover:bg-[#383840]/40 transition-colors">
                    <td className="td text-white">{pl?.name ?? `#${a.playlist_id}`}</td>
                    <td className="td text-[#7a7a85]">{fl?.name ?? '—'}</td>
                    <td className="td text-[#7a7a85]">{a.priority}</td>
                    <td className="td">
                      <span className={`badge ${a.active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-[#383840] text-[#7a7a85]'}`}>
                        {a.active ? 'Активне' : 'Вимкнено'}
                      </span>
                    </td>
                    <td className="td text-right">
                      <button onClick={() => del(a.id)} className="text-red-400 hover:text-red-300 text-xs">Видалити</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

const TABS = ['Плейлисти', 'Розклад', 'Призначення'] as const;
type Tab = typeof TABS[number];

export default function RegionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const regionId = Number(id);

  const [region, setRegion] = useState<any>(null);
  const [tab, setTab] = useState<Tab>('Плейлисти');

  useEffect(() => {
    api.getRegion(regionId).then(setRegion).catch(() => navigate('/regions'));
  }, [regionId]);

  if (!region) return <div className="p-8 text-[#7a7a85] text-sm">Завантаження...</div>;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 sm:px-6 py-4 border-b border-[#383840] flex-shrink-0">
        <button onClick={() => navigate('/regions')}
          className="text-[#7a7a85] hover:text-white transition-colors text-sm flex items-center gap-1.5">
          ← Регіони
        </button>
        <span className="text-[#383840]">/</span>
        <div className="flex-1 min-w-0">
          <span className="text-white font-semibold">{region.name}</span>
          <span className="ml-2 text-xs font-mono text-[#7a7a85]">{region.icecast_mount}</span>
        </div>
        <span className={`badge flex-shrink-0 ${region.enabled ? 'bg-emerald-500/15 text-emerald-400' : 'bg-[#383840] text-[#7a7a85]'}`}>
          {region.enabled ? 'Активний' : 'Вимкнений'}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 sm:px-6 pt-3 border-b border-[#383840] flex-shrink-0">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2 -mb-px ` +
              (tab === t
                ? 'text-[#ff732e] border-[#ff732e]'
                : 'text-[#7a7a85] border-transparent hover:text-[#9a9aa5]')}>
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {tab === 'Плейлисти'  && <PlaylistsTab  regionId={regionId} />}
        {tab === 'Розклад'    && <SchedulesTab   regionId={regionId} />}
        {tab === 'Призначення' && <AssignmentsTab regionId={regionId} />}
      </div>
    </div>
  );
}
