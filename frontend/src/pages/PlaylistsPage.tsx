import { useEffect, useRef, useState } from 'react';
import { api, uploadFiles } from '../api';
import { Select } from '../components/Select';

const BACKEND = '';

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

export default function PlaylistsPage() {
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('ad');
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);

  // Audio player
  const [playingItem, setPlayingItem] = useState<any>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Confirm dialog
  const [confirm, setConfirm] = useState<{ message: string; onConfirm: () => void } | null>(null);

  const showConfirm = (message: string, onConfirm: () => void) =>
    setConfirm({ message, onConfirm });

  const playItem = (item: any) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.ontimeupdate = null;
      audioRef.current.onended = null;
      audioRef.current = null;
    }
    if (playingItem?.id === item.id) {
      setPlayingItem(null);
      setCurrentTime(0);
      setAudioDuration(0);
      return;
    }
    const uploadsIdx = item.filepath.indexOf('/uploads/');
    const relPath = uploadsIdx !== -1 ? item.filepath.slice(uploadsIdx) : '';
    const url = `${BACKEND}${relPath}`;
    const audio = new Audio(url);
    audioRef.current = audio;
    setPlayingItem(item);
    setCurrentTime(0);
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

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const loadPlaylists = async () => { const p = await api.getPlaylists(); setPlaylists(p); };
  const loadItems = async (id: number) => { const p = await api.getPlaylist(id); setItems(p.items || []); };

  useEffect(() => { loadPlaylists(); }, []);
  useEffect(() => { if (selected) loadItems(selected.id); }, [selected?.id]);

  const selectPlaylist = (p: any) => { setSelected(p); setShowSidebar(false); };

  const create = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const p = await api.createPlaylist({ name: newName, type: newType, shuffle: false });
      await loadPlaylists();
      setSelected(p);
      setNewName('');
    } finally { setCreating(false); }
  };

  const del = (id: number) => {
    showConfirm('Видалити плейлист разом з усіма файлами?', async () => {
      setConfirm(null);
      await api.deletePlaylist(id);
      if (selected?.id === id) setSelected(null);
      await loadPlaylists();
    });
  };

  const delItem = (itemId: number, filename: string) => {
    showConfirm(`Видалити файл «${filename}»?`, async () => {
      setConfirm(null);
      if (playingItem?.id === itemId) playItem(playingItem); // stop if playing
      await api.deleteItem(selected.id, itemId);
      await loadItems(selected.id);
      await loadPlaylists();
    });
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !selected) return;
    setUploading(true);
    try {
      await uploadFiles(selected.id, files);
      await loadItems(selected.id);
      await loadPlaylists();
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

  const totalDur = items.reduce((s, i) => s + (i.duration_sec || 0), 0);

  const PlaylistList = () => (
    <div className="flex flex-col gap-3 h-full">
      <div className="card p-3 space-y-2 flex-shrink-0">
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
          <div key={p.id} onClick={() => selectPlaylist(p)}
            className={`rounded-xl px-3 py-3 cursor-pointer flex items-center justify-between group transition-all border ` +
              (selected?.id === p.id
                ? 'bg-[#ff732e]/8 border-[#ff732e]/25 text-[#ff732e]'
                : 'border-transparent hover:bg-[#383840] text-[#9a9aa5] hover:text-white')}>
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{p.name}</div>
              <div className="text-xs text-[#7a7a85] mt-0.5">
                {p.type === 'ad' ? '📣' : '🎵'} {p.item_count} файлів
              </div>
            </div>
            <button onClick={e => { e.stopPropagation(); del(p.id); }}
              className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 text-sm ml-2 flex-shrink-0 transition-opacity">
              ✕
            </button>
          </div>
        ))}
        {!playlists.length && (
          <div className="text-center py-6 text-[#5a5a62] text-sm">Немає плейлистів</div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-full overflow-hidden">
      {confirm && (
        <ConfirmDialog
          message={confirm.message}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}

      {showSidebar && (
        <div className="fixed inset-0 bg-black/60 z-20 sm:hidden" onClick={() => setShowSidebar(false)} />
      )}

      <div className="hidden sm:flex flex-col w-64 flex-shrink-0 border-r border-[#383840] p-4 overflow-hidden">
        <PlaylistList />
      </div>

      {showSidebar && (
        <div className="fixed inset-y-0 left-0 w-72 z-30 bg-[#121214] border-r border-[#383840] p-4 sm:hidden overflow-y-auto">
          <PlaylistList />
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden p-4 sm:p-6">
        {!selected ? (
          <div className="flex flex-col h-full">
            <div className="page-header">
              <h1 className="page-title">Плейлисти</h1>
              <button onClick={() => setShowSidebar(true)} className="btn-ghost sm:hidden text-xs">☰ Список</button>
            </div>
            <div className="card flex-1 flex items-center justify-center text-[#7a7a85] text-sm">
              Оберіть плейлист зліва
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <button onClick={() => setShowSidebar(true)} className="btn-ghost sm:hidden text-xs py-2">← Назад</button>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-white truncate">{selected.name}</h2>
                {items.length > 0 && (
                  <div className="text-xs text-[#7a7a85] mt-0.5">
                    {items.length} файлів · {fmtDur(totalDur)}
                  </div>
                )}
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
                  <div className="text-center">
                    <div className="text-3xl mb-3">🎵</div>
                    <div className="text-[#7a7a85] text-sm">Натисніть «+ Файли» для завантаження</div>
                  </div>
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
                          <tr key={item.id}
                            className={`transition-colors ${playingItem?.id === item.id ? 'bg-[#ff732e]/5' : 'hover:bg-[#383840]/40'}`}>
                            <td className="td text-[#7a7a85] w-10">{i + 1}</td>
                            <td className="td w-8">
                              <button onClick={() => playItem(item)}
                                className={`text-base leading-none transition-colors ${playingItem?.id === item.id ? 'text-[#ff732e]' : 'text-[#7a7a85] hover:text-white'}`}
                                title={playingItem?.id === item.id ? 'Зупинити' : 'Відтворити'}>
                                {playingItem?.id === item.id ? '⏹' : '▶'}
                              </button>
                            </td>
                            <td className="td font-medium text-white">
                              <div className="truncate max-w-[200px] sm:max-w-none" title={item.filename}>
                                {item.filename}
                              </div>
                            </td>
                            <td className="td text-right text-[#7a7a85] font-mono text-xs w-20">{fmtDur(item.duration_sec)}</td>
                            <td className="td w-10 text-right">
                              <button onClick={() => delItem(item.id, item.filename)}
                                className="text-red-400 hover:text-red-300 text-xs">✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Audio player bar */}
                  {playingItem && (
                    <div className="border-t border-[#383840] px-4 py-3 flex-shrink-0 bg-[#121214]">
                      <div className="flex items-center gap-3">
                        <button onClick={() => playItem(playingItem)}
                          className="text-[#ff732e] text-base flex-shrink-0">⏹</button>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-[#9a9aa5] truncate mb-1">{playingItem.filename}</div>
                          <input
                            type="range" min={0} max={audioDuration || 1} step={0.1}
                            value={currentTime}
                            onChange={e => seek(Number(e.target.value))}
                            className="w-full h-1 accent-[#ff732e] cursor-pointer"
                          />
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
