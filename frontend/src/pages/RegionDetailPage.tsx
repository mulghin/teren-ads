import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, uploadFiles } from '../api';
import {
  Badge,
  Button,
  DropdownSelect,
  Field,
  Icon,
  Modal,
  PageHeader,
  Tabs,
  Toggle,
  useToast,
} from '../components/ui';

const BACKEND = '';
const DAYS_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

const fmtDur = (sec: number) => {
  if (!sec) return '—';
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

// ─── PLAYLISTS TAB ───────────────────────────────────────────────────────────

function PlaylistsTab({ regionId }: { regionId: number }) {
  const notify = useToast();
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('ad');
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [playingItem, setPlayingItem] = useState<any>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirm, setConfirm] = useState<null | { title: string; body: string; action: () => Promise<void> }>(null);

  const loadPlaylists = async () => setPlaylists(await api.getPlaylists(regionId));
  const loadItems = async (id: number) => { const p = await api.getPlaylist(id); setItems(p.items || []); };

  useEffect(() => { loadPlaylists(); }, [regionId]);
  useEffect(() => { if (selected) loadItems(selected.id); }, [selected?.id]);
  useEffect(() => () => { audioRef.current?.pause(); }, []);

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

  const seek = (val: number) => { if (audioRef.current) audioRef.current.currentTime = val; setCurrentTime(val); };

  const openCreate = () => { setNewName(''); setNewType('ad'); setCreateOpen(true); };

  const create = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const p = await api.createPlaylist({ name: newName, type: newType, shuffle: false, region_id: regionId });
      await loadPlaylists(); setSelected(p); setCreateOpen(false);
      notify({ title: 'Плейлист створено', tone: 'success', icon: 'check' });
    } catch (e: any) {
      notify({ title: 'Помилка', body: e?.message, tone: 'error', icon: 'warn' });
    } finally { setCreating(false); }
  };

  const askDeletePlaylist = (p: any) => setConfirm({
    title: 'Видалити плейлист?',
    body: `«${p.name}» буде видалено разом з усіма файлами.`,
    action: async () => {
      await api.deletePlaylist(p.id);
      if (selected?.id === p.id) setSelected(null);
      await loadPlaylists();
      notify({ title: 'Плейлист видалено', tone: 'success', icon: 'check' });
    },
  });

  const askDeleteItem = (item: any) => setConfirm({
    title: 'Видалити файл?',
    body: `«${item.filename}» буде видалено з плейлиста.`,
    action: async () => {
      if (playingItem?.id === item.id) playItem(playingItem);
      await api.deleteItem(selected.id, item.id);
      await loadItems(selected.id); await loadPlaylists();
    },
  });

  const doConfirm = async () => {
    if (!confirm) return;
    try { await confirm.action(); }
    catch (e: any) { notify({ title: 'Помилка', body: e?.message, tone: 'error', icon: 'warn' }); }
    finally { setConfirm(null); }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !selected) return;
    setUploading(true);
    try {
      await uploadFiles(selected.id, files);
      await loadItems(selected.id); await loadPlaylists();
      notify({ title: `Завантажено ${files.length} файл(ів)`, tone: 'success', icon: 'check' });
    } catch (e: any) {
      notify({ title: 'Помилка', body: e?.message, tone: 'error', icon: 'warn' });
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
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Плейлисти регіону</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
            Реклама та філери, прив'язані до цього регіону
          </p>
        </div>
        <Button variant="primary" icon="plus" onClick={openCreate}>Новий плейлист</Button>
      </div>

      <div className="split-sidebar narrow">
        <div className="card" style={{ padding: 6, maxHeight: 520, overflow: 'auto' }}>
          {playlists.length === 0 ? (
            <div style={{ padding: '30px 12px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12 }}>
              Немає плейлистів
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {playlists.map(p => {
                const active = selected?.id === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => setSelected(p)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                      background: active ? 'var(--accent-dim)' : 'transparent',
                      border: active ? '1px solid rgba(255,106,26,0.25)' : '1px solid transparent',
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div style={{
                      width: 26, height: 26, borderRadius: 6, flex: 'none',
                      display: 'grid', placeItems: 'center',
                      background: p.type === 'ad' ? 'var(--accent-dim)' : 'var(--info-dim)',
                      color: p.type === 'ad' ? 'var(--accent)' : 'var(--info)',
                    }}>
                      <Icon name={p.type === 'ad' ? 'megaphone' : 'playlist'} size={13} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: active ? 'var(--accent)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.name}
                      </div>
                      <div className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                        {p.item_count || 0} файл(ів)
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" icon="trash" onClick={(e) => { e.stopPropagation(); askDeletePlaylist(p); }} />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card" style={{ padding: 0, minHeight: 400, display: 'flex', flexDirection: 'column' }}>
          {!selected ? (
            <div style={{ padding: '60px 24px', textAlign: 'center', flex: 1, display: 'grid', placeItems: 'center' }}>
              <div>
                <div style={{ color: 'var(--text-muted)', marginBottom: 8 }}>
                  <Icon name="playlist" size={28} />
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                  Оберіть плейлист або створіть новий
                </div>
              </div>
            </div>
          ) : (
            <>
              <div style={{
                padding: 16, borderBottom: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{selected.name}</h4>
                    <Badge tone={selected.type === 'ad' ? 'accent' : 'info'}>
                      {selected.type === 'ad' ? 'Реклама' : 'Філер'}
                    </Badge>
                  </div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    {items.length} файл(ів) · {fmtDur(totalDur)}
                  </div>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={toggleShuffle}>
                  <div style={{
                    width: 32, height: 18, borderRadius: 999,
                    background: selected.shuffle ? 'var(--accent)' : 'var(--bg-elevated)',
                    position: 'relative', flex: 'none',
                  }}>
                    <div style={{
                      position: 'absolute', top: 2, left: selected.shuffle ? 16 : 2,
                      width: 14, height: 14, borderRadius: 999, background: '#fff',
                      transition: 'left 0.15s',
                    }} />
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Shuffle</span>
                </label>

                <input ref={fileRef} type="file" multiple accept="audio/*" style={{ display: 'none' }} onChange={handleUpload} />
                <Button variant="primary" size="sm" icon="upload" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? 'Завантаження…' : 'Файли'}
                </Button>
              </div>

              <div style={{ flex: 1, overflow: 'auto', maxHeight: 400 }}>
                {items.length === 0 ? (
                  <div style={{ padding: '50px 24px', textAlign: 'center' }}>
                    <div style={{ color: 'var(--text-muted)', marginBottom: 8 }}>
                      <Icon name="upload" size={24} />
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                      Натисніть «Файли», щоб завантажити
                    </div>
                  </div>
                ) : (
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th style={{ width: 36 }}>#</th>
                        <th style={{ width: 36 }}></th>
                        <th>Файл</th>
                        <th className="col-right" style={{ width: 90 }}>Тривал.</th>
                        <th style={{ width: 50 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, i) => {
                        const isPlaying = playingItem?.id === item.id;
                        return (
                          <tr key={item.id} style={{ background: isPlaying ? 'var(--accent-dim)' : undefined }}>
                            <td className="col-muted mono" style={{ fontSize: 11 }}>{i + 1}</td>
                            <td>
                              <Button
                                variant="ghost" size="sm"
                                icon={isPlaying ? 'stop' : 'play'}
                                onClick={() => playItem(item)}
                                style={isPlaying ? { color: 'var(--accent)' } : undefined}
                              />
                            </td>
                            <td style={{ fontWeight: 500, color: isPlaying ? 'var(--accent)' : undefined }}>
                              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 360 }} title={item.filename}>
                                {item.filename}
                              </div>
                            </td>
                            <td className="col-right col-muted mono" style={{ fontSize: 11 }}>{fmtDur(item.duration_sec)}</td>
                            <td style={{ textAlign: 'right' }}>
                              <Button variant="ghost" size="sm" icon="trash" onClick={() => askDeleteItem(item)} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {playingItem && (
                <div style={{
                  padding: '10px 14px', borderTop: '1px solid var(--border)',
                  background: 'var(--bg-elevated)',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <Button variant="ghost" size="sm" icon="stop" onClick={() => playItem(playingItem)} style={{ color: 'var(--accent)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {playingItem.filename}
                    </div>
                    <input
                      type="range" min={0} max={audioDuration || 1} step={0.1}
                      value={currentTime}
                      onChange={e => seek(Number(e.target.value))}
                      style={{ width: '100%', accentColor: 'var(--accent)' }}
                    />
                  </div>
                  <div className="mono tabular" style={{ fontSize: 11, color: 'var(--text-muted)', width: 88, textAlign: 'right' }}>
                    {fmtDur(currentTime)} / {fmtDur(audioDuration)}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Новий плейлист"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Скасувати</Button>
            <Button variant="primary" onClick={create} disabled={!newName.trim() || creating}>
              {creating ? 'Створення…' : 'Створити'}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Назва" required>
            <input
              className="input" autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Наприклад: Ранковий блок"
              onKeyDown={e => { if (e.key === 'Enter') create(); }}
            />
          </Field>
          <Field label="Тип">
            <DropdownSelect
              value={newType}
              onChange={setNewType}
              options={[
                { value: 'ad',     label: 'Реклама' },
                { value: 'filler', label: 'Філер' },
              ]}
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm?.title || ''}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>Скасувати</Button>
            <Button variant="danger" icon="trash" onClick={doConfirm}>Видалити</Button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
          {confirm?.body}
        </p>
      </Modal>
    </div>
  );
}

// ─── SCHEDULES TAB ───────────────────────────────────────────────────────────

const emptySchedule = {
  label: '', time_hhmm: '13:00', tolerance_minutes: 10,
  playlist_id: '', filler_playlist_id: '', days: '1234567', is_active: true,
};

function SchedulesTab({ regionId }: { regionId: number }) {
  const notify = useToast();
  const [schedules, setSchedules] = useState<any[]>([]);
  const [allPlaylists, setAllPlaylists] = useState<any[]>([]);
  const [modal, setModal] = useState<null | 'create' | number>(null);
  const [form, setForm] = useState({ ...emptySchedule });
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<number | null>(null);

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
      notify({ title: 'Збережено', tone: 'success', icon: 'check' });
    } catch (e: any) {
      notify({ title: 'Помилка', body: e?.message, tone: 'error', icon: 'warn' });
    } finally { setSaving(false); }
  };

  const doDelete = async () => {
    if (!confirm) return;
    try {
      await api.deleteRegionSchedule(regionId, confirm);
      await load();
      notify({ title: 'Видалено', tone: 'success', icon: 'check' });
    } catch (e: any) {
      notify({ title: 'Помилка', body: e?.message, tone: 'error', icon: 'warn' });
    } finally { setConfirm(null); }
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
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Розклад за часом</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)', maxWidth: 620 }}>
            Коли тоновий сигнал приходить у вказаний час ±допуск — автоматично запускається цей плейлист
          </p>
        </div>
        <Button variant="primary" icon="plus" onClick={openCreate}>Додати запис</Button>
      </div>

      {schedules.length === 0 ? (
        <div className="card" style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
          Немає записів розкладу
        </div>
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Назва</th>
                <th>Час</th>
                <th>Допуск</th>
                <th>Дні</th>
                <th>Плейлист</th>
                <th>Філер</th>
                <th>Стан</th>
                <th style={{ width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {schedules.map(s => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 500 }}>{s.label || '—'}</td>
                  <td className="mono" style={{ color: 'var(--accent)', fontWeight: 600 }}>{s.time_hhmm}</td>
                  <td className="col-muted">±{s.tolerance_minutes} хв</td>
                  <td className="col-muted" style={{ fontSize: 12 }}>{fmtDays(s.days)}</td>
                  <td>{s.playlist_name}</td>
                  <td className="col-muted">{s.filler_playlist_name || '—'}</td>
                  <td>
                    <Badge tone={s.is_active ? 'success' : 'neutral'} dot>
                      {s.is_active ? 'активний' : 'вимкнений'}
                    </Badge>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Button variant="ghost" size="sm" icon="edit" onClick={() => openEdit(s)} />
                    <Button variant="ghost" size="sm" icon="trash" onClick={() => setConfirm(s.id)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal === 'create' ? 'Новий запис розкладу' : 'Редагувати запис'}
        width={520}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(null)}>Скасувати</Button>
            <Button variant="primary" onClick={save} disabled={!valid || saving}>
              {saving ? 'Збереження…' : 'Зберегти'}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Назва (опціонально)">
            <input className="input" value={form.label} onChange={e => f('label', e.target.value)} placeholder="Обід, Ранок…" />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Час запуску" required>
              <input type="time" className="input" value={form.time_hhmm} onChange={e => f('time_hhmm', e.target.value)} />
            </Field>
            <Field label="Допуск, хв">
              <input
                type="number" min={0} max={60}
                className="input"
                value={form.tolerance_minutes}
                onChange={e => f('tolerance_minutes', e.target.value)}
              />
            </Field>
          </div>
          <Field label="Дні тижня">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {DAYS_LABELS.map((d, i) => {
                const active = form.days.includes(String(i + 1));
                return (
                  <button
                    key={i} type="button"
                    onClick={() => toggleDay(String(i + 1))}
                    style={{
                      padding: '6px 12px', borderRadius: 8,
                      fontSize: 12, fontWeight: 500,
                      cursor: 'pointer',
                      background: active ? 'var(--accent-dim)' : 'transparent',
                      border: `1px solid ${active ? 'rgba(255,106,26,0.4)' : 'var(--border)'}`,
                      color: active ? 'var(--accent)' : 'var(--text-secondary)',
                      transition: 'all 0.12s',
                    }}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Плейлист" required>
            <DropdownSelect
              value={form.playlist_id}
              onChange={v => f('playlist_id', v)}
              options={[
                { value: '', label: '— оберіть —' },
                ...allPlaylists.map(p => ({ value: String(p.id), label: p.name })),
              ]}
            />
          </Field>
          <Field label="Філер (опціонально)">
            <DropdownSelect
              value={form.filler_playlist_id}
              onChange={v => f('filler_playlist_id', v)}
              options={[
                { value: '', label: '— без філера —' },
                ...allPlaylists.filter(p => p.type === 'filler').map(p => ({ value: String(p.id), label: p.name })),
              ]}
            />
          </Field>
          <Toggle label="Активний" value={form.is_active} onChange={v => f('is_active', v)} />
        </div>
      </Modal>

      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title="Видалити запис?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>Скасувати</Button>
            <Button variant="danger" icon="trash" onClick={doDelete}>Видалити</Button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
          Дію неможливо скасувати.
        </p>
      </Modal>
    </div>
  );
}

// ─── ASSIGNMENTS TAB ─────────────────────────────────────────────────────────

function AssignmentsTab({ regionId }: { regionId: number }) {
  const notify = useToast();
  const [assignments, setAssignments] = useState<any[]>([]);
  const [allPlaylists, setAllPlaylists] = useState<any[]>([]);
  const [form, setForm] = useState({ playlist_id: '', filler_playlist_id: '', priority: 0, active: true });
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<number | null>(null);

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
      notify({ title: 'Додано', tone: 'success', icon: 'check' });
    } catch (e: any) {
      notify({ title: 'Помилка', body: e?.message, tone: 'error', icon: 'warn' });
    } finally { setSaving(false); }
  };

  const doDelete = async () => {
    if (!confirm) return;
    try {
      await api.deleteAssignment(regionId, confirm);
      await load();
      notify({ title: 'Видалено', tone: 'success', icon: 'check' });
    } catch (e: any) {
      notify({ title: 'Помилка', body: e?.message, tone: 'error', icon: 'warn' });
    } finally { setConfirm(null); }
  };

  return (
    <div style={{ padding: 20 }}>
      <div style={{ marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Призначення плейлистів</h3>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)', maxWidth: 620 }}>
          Запасний плейлист при тоновому сигналі, якщо жоден рядок розкладу не підходить за часом
        </p>
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1.5fr 1fr auto', gap: 12, alignItems: 'end' }}>
          <Field label="Плейлист" required>
            <DropdownSelect
              value={form.playlist_id}
              onChange={v => f('playlist_id', v)}
              options={[
                { value: '', label: '— оберіть —' },
                ...allPlaylists.map(p => ({ value: String(p.id), label: p.name })),
              ]}
            />
          </Field>
          <Field label="Філер">
            <DropdownSelect
              value={form.filler_playlist_id}
              onChange={v => f('filler_playlist_id', v)}
              options={[
                { value: '', label: '— без філера —' },
                ...allPlaylists.filter(p => p.type === 'filler').map(p => ({ value: String(p.id), label: p.name })),
              ]}
            />
          </Field>
          <Field label="Пріоритет">
            <input
              type="number" className="input"
              value={form.priority}
              onChange={e => f('priority', +e.target.value)}
            />
          </Field>
          <Button variant="primary" icon="plus" onClick={add} disabled={saving || !form.playlist_id}>
            {saving ? '…' : 'Додати'}
          </Button>
        </div>
      </div>

      {assignments.length === 0 ? (
        <div className="card" style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
          Немає призначень
        </div>
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Плейлист</th>
                <th>Філер</th>
                <th className="col-right">Пріоритет</th>
                <th>Стан</th>
                <th style={{ width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a: any) => {
                const pl = allPlaylists.find((p: any) => p.id === a.playlist_id);
                const fl = allPlaylists.find((p: any) => p.id === a.filler_playlist_id);
                return (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 500 }}>{pl?.name ?? `#${a.playlist_id}`}</td>
                    <td className="col-muted">{fl?.name ?? '—'}</td>
                    <td className="col-right tabular">{a.priority}</td>
                    <td>
                      <Badge tone={a.active ? 'success' : 'neutral'} dot>
                        {a.active ? 'активне' : 'вимкнено'}
                      </Badge>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Button variant="ghost" size="sm" icon="trash" onClick={() => setConfirm(a.id)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title="Видалити призначення?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>Скасувати</Button>
            <Button variant="danger" icon="trash" onClick={doDelete}>Видалити</Button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
          Дію неможливо скасувати.
        </p>
      </Modal>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

type Tab = 'playlists' | 'schedules' | 'assignments';

export default function RegionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const regionId = Number(id);

  const [region, setRegion] = useState<any>(null);
  const [tab, setTab] = useState<Tab>('playlists');

  useEffect(() => {
    api.getRegion(regionId).then(setRegion).catch(() => navigate('/regions'));
  }, [regionId]);

  if (!region) {
    return (
      <div style={{ padding: 40, color: 'var(--text-secondary)', fontSize: 13 }}>
        Завантаження…
      </div>
    );
  }

  return (
    <div style={{ padding: '0 24px 40px' }}>
      <PageHeader
        title={region.name}
        subtitle={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <span className="mono" style={{ color: 'var(--text-muted)' }}>{region.icecast_mount}</span>
            <Badge tone={region.enabled ? 'success' : 'neutral'} dot>
              {region.enabled ? 'активний' : 'вимкнений'}
            </Badge>
          </span>
        }
        actions={
          <Button variant="secondary" icon="chevronLeft" onClick={() => navigate('/regions')}>
            До списку
          </Button>
        }
      />

      <div style={{ marginBottom: 14 }}>
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          items={[
            { value: 'playlists',   label: 'Плейлисти' },
            { value: 'schedules',   label: 'Розклад' },
            { value: 'assignments', label: 'Призначення' },
          ]}
        />
      </div>

      <div className="card" style={{ padding: 0 }}>
        {tab === 'playlists'   && <PlaylistsTab   regionId={regionId} />}
        {tab === 'schedules'   && <SchedulesTab   regionId={regionId} />}
        {tab === 'assignments' && <AssignmentsTab regionId={regionId} />}
      </div>
    </div>
  );
}
