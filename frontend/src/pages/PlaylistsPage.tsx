import { useEffect, useRef, useState } from 'react';
import { api, uploadFiles } from '../api';
import {
  Badge,
  Button,
  DropdownSelect,
  Field,
  Icon,
  Modal,
  PageHeader,
  useToast,
} from '../components/ui';

const BACKEND = '';

const fmtDur = (sec: number) => {
  if (!sec) return '—';
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export default function PlaylistsPage() {
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

  const [confirm, setConfirm] = useState<null | { title: string; body: string; action: () => void }>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  const loadPlaylists = async () => setPlaylists(await api.getPlaylists());
  const loadItems = async (id: number) => { const p = await api.getPlaylist(id); setItems(p.items || []); };

  useEffect(() => { loadPlaylists(); }, []);
  useEffect(() => { if (selected) loadItems(selected.id); setRenaming(false); }, [selected?.id]);
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const playItem = (item: any) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.ontimeupdate = null;
      audioRef.current.onended = null;
      audioRef.current = null;
    }
    if (playingItem?.id === item.id) {
      setPlayingItem(null); setCurrentTime(0); setAudioDuration(0); return;
    }
    const uploadsIdx = item.filepath.indexOf('/uploads/');
    const relPath = uploadsIdx !== -1 ? item.filepath.slice(uploadsIdx) : '';
    const audio = new Audio(`${BACKEND}${relPath}`);
    audioRef.current = audio;
    setPlayingItem(item); setCurrentTime(0);
    audio.play();
    audio.onloadedmetadata = () => setAudioDuration(audio.duration);
    audio.ontimeupdate = () => setCurrentTime(audio.currentTime);
    audio.onended = () => { setPlayingItem(null); setCurrentTime(0); setAudioDuration(0); };
    audio.onerror = () => { setPlayingItem(null); setCurrentTime(0); setAudioDuration(0); };
  };

  const seek = (val: number) => {
    if (audioRef.current) audioRef.current.currentTime = val;
    setCurrentTime(val);
  };

  const openCreate = () => { setNewName(''); setNewType('ad'); setCreateOpen(true); };

  const create = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const p = await api.createPlaylist({ name: newName, type: newType, shuffle: false });
      await loadPlaylists();
      setSelected(p);
      setCreateOpen(false);
      notify({ title: 'Плейлист створено', tone: 'success', icon: 'check' });
    } catch (e: any) {
      notify({ title: 'Помилка', body: e?.message, tone: 'error', icon: 'warn' });
    } finally { setCreating(false); }
  };

  const askDeletePlaylist = (p: any) => setConfirm({
    title: 'Видалити плейлист?',
    body: `«${p.name}» буде видалено разом з усіма файлами. Дію неможливо скасувати.`,
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
      await loadItems(selected.id);
      await loadPlaylists();
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
      await loadItems(selected.id);
      await loadPlaylists();
      notify({ title: `Завантажено ${files.length} файл(ів)`, tone: 'success', icon: 'check' });
    } catch (e: any) {
      notify({ title: 'Помилка завантаження', body: e?.message, tone: 'error', icon: 'warn' });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const toggleShuffle = async () => {
    const updated = { ...selected, shuffle: !selected.shuffle };
    await api.updatePlaylist(selected.id, updated);
    setSelected(updated);
    setPlaylists(prev => prev.map(p => p.id === updated.id ? { ...p, shuffle: updated.shuffle } : p));
  };

  const startRename = () => {
    setRenameValue(selected?.name || '');
    setRenaming(true);
  };

  const commitRename = async () => {
    if (!renaming) return;
    const next = renameValue.trim();
    if (!next || !selected || next === selected.name) { setRenaming(false); return; }
    try {
      await api.updatePlaylist(selected.id, { ...selected, name: next });
      setSelected({ ...selected, name: next });
      setPlaylists(prev => prev.map(p => p.id === selected.id ? { ...p, name: next } : p));
      notify({ title: 'Перейменовано', tone: 'success', icon: 'check' });
    } catch (e: any) {
      notify({ title: 'Помилка', body: e?.message, tone: 'error', icon: 'warn' });
    } finally {
      setRenaming(false);
    }
  };

  const totalDur = items.reduce((s, i) => s + (i.duration_sec || 0), 0);

  const adCount = playlists.filter(p => p.type === 'ad').length;
  const fillerCount = playlists.filter(p => p.type === 'filler').length;

  return (
    <div className="page">
      <PageHeader
        title="Плейлисти"
        subtitle={`${playlists.length} плейлистів · ${adCount} реклама · ${fillerCount} філер`}
        actions={<Button variant="primary" icon="plus" onClick={openCreate}>Новий плейлист</Button>}
      />

      <div className="split-sidebar">
        <div className="card" style={{ padding: 6, maxHeight: 'calc(100vh - 180px)', overflow: 'auto' }}>
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
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div style={{
                      width: 28, height: 28, borderRadius: 6, flex: 'none',
                      display: 'grid', placeItems: 'center',
                      background: p.type === 'ad' ? 'var(--accent-dim)' : 'var(--info-dim)',
                      color: p.type === 'ad' ? 'var(--accent)' : 'var(--info)',
                    }}>
                      <Icon name={p.type === 'ad' ? 'megaphone' : 'playlist'} size={14} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: active ? 'var(--accent)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.name}
                      </div>
                      <div className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                        {p.item_count || 0} файл{(p.item_count || 0) === 1 ? '' : 'ів'}
                      </div>
                    </div>
                    <Button
                      variant="ghost" size="sm" icon="trash"
                      onClick={(e) => { e.stopPropagation(); askDeletePlaylist(p); }}
                    />
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
                  <Icon name="playlist" size={32} />
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                  Оберіть плейлист зліва або створіть новий
                </div>
              </div>
            </div>
          ) : (
            <>
              <div style={{
                padding: 20, borderBottom: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {renaming ? (
                      <input
                        className="input"
                        autoFocus
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                          if (e.key === 'Escape') setRenaming(false);
                        }}
                        style={{ fontSize: 18, fontWeight: 600, height: 'auto', padding: '4px 8px', maxWidth: 360 }}
                      />
                    ) : (
                      <>
                        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>
                          {selected.name}
                        </h2>
                        <Button
                          variant="ghost" size="sm" icon="edit"
                          onClick={startRename}
                          aria-label="Перейменувати"
                        />
                      </>
                    )}
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
                    position: 'relative', transition: 'background 0.15s', flex: 'none',
                  }}>
                    <div style={{
                      position: 'absolute', top: 2, left: selected.shuffle ? 16 : 2,
                      width: 14, height: 14, borderRadius: 999, background: '#fff',
                      transition: 'left 0.15s', boxShadow: '0 1px 2px rgba(0,0,0,0.35)',
                    }} />
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Shuffle</span>
                </label>

                <input ref={fileRef} type="file" multiple accept="audio/*" style={{ display: 'none' }} onChange={handleUpload} />
                <Button variant="primary" icon="upload" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? 'Завантаження…' : 'Завантажити'}
                </Button>
              </div>

              <div style={{ flex: 1, overflow: 'auto' }}>
                {items.length === 0 ? (
                  <div style={{ padding: '60px 24px', textAlign: 'center' }}>
                    <div style={{ color: 'var(--text-muted)', marginBottom: 8 }}>
                      <Icon name="upload" size={28} />
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                      Натисніть «Завантажити», щоб додати аудіо
                    </div>
                  </div>
                ) : (
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th style={{ width: 40 }}>#</th>
                        <th style={{ width: 36 }}></th>
                        <th>Файл</th>
                        <th className="col-right" style={{ width: 100 }}>Тривалість</th>
                        <th style={{ width: 60 }}></th>
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
                              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 460 }} title={item.filename}>
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
                  padding: '12px 16px', borderTop: '1px solid var(--border)',
                  background: 'var(--bg-elevated)',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <Button variant="ghost" size="sm" icon="stop" onClick={() => playItem(playingItem)} style={{ color: 'var(--accent)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {playingItem.filename}
                    </div>
                    <input
                      type="range" min={0} max={audioDuration || 1} step={0.1}
                      value={currentTime}
                      onChange={e => seek(Number(e.target.value))}
                      style={{ width: '100%', accentColor: 'var(--accent)' }}
                    />
                  </div>
                  <div className="mono tabular" style={{ fontSize: 11, color: 'var(--text-muted)', width: 90, textAlign: 'right' }}>
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
                { value: 'filler', label: 'Філер (музична підкладка)' },
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
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {confirm?.body}
        </p>
      </Modal>
    </div>
  );
}

