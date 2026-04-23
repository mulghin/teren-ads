import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { useRegionConfig, useRegionUpdates, useSocket } from '../hooks/useSocket';
import {
  Badge,
  BadgeTone,
  Button,
  Card,
  DropdownSelect,
  Field,
  Icon,
  IconName,
  KpiCard,
  Modal,
  PageHeader,
  useToast,
} from '../components/ui';

type Mode = 'main' | 'ad' | 'filler' | 'stopped';

type Region = {
  id: number;
  name: string;
  icecast_mount?: string;
  enabled?: boolean;
  status?: Mode;
  live?: { mode?: Mode; currentFile?: string | null };
};

type Playlist = { id: number; name: string; type: 'ad' | 'filler' | string; item_count?: number };

const MODE_META: Record<Mode, { label: string; tone: BadgeTone; icon: IconName }> = {
  main:    { label: 'Ефір',    tone: 'success', icon: 'broadcast' },
  ad:      { label: 'Реклама', tone: 'accent',  icon: 'megaphone' },
  filler:  { label: 'Філер',   tone: 'info',    icon: 'playlist' },
  stopped: { label: 'Стоп',    tone: 'neutral', icon: 'stop' },
};

const modeOf = (r: Region): Mode => (r.live?.mode || r.status || 'stopped') as Mode;

export default function Dashboard() {
  const notify = useToast();
  const { connected } = useSocket();

  const [regions, setRegions] = useState<Region[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const busyRef = useRef<number | null>(null);
  const [filter, setFilter] = useState<'all' | Mode>('all');

  const [triggerModal, setTriggerModal] = useState<Region | null>(null);
  const [selPlaylist, setSelPlaylist] = useState<number | ''>('');
  const [selFiller, setSelFiller] = useState<number | ''>('');

  useEffect(() => {
    (async () => {
      try {
        const [r, p] = await Promise.all([api.getRegions(), api.getPlaylists()]);
        setRegions(r);
        setPlaylists(p);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useRegionUpdates((u: any) => {
    setRegions(prev => prev.map(r => (r.id === u.id ? { ...r, live: u, status: u.mode } : r)));
  });

  useRegionConfig((cfg: any) => {
    setRegions(prev => {
      if (cfg.event === 'deleted') return prev.filter(r => r.id !== cfg.id);
      const idx = prev.findIndex(r => r.id === cfg.id);
      if (idx === -1) return [...prev, cfg];
      const next = prev.slice();
      // Preserve the live field — it's a separate stream of updates
      next[idx] = { ...next[idx], ...cfg, live: next[idx].live };
      return next;
    });
  });

  const action = async (fn: () => Promise<any>, id: number, successTitle: string) => {
    if (busyRef.current !== null) return; // ref-guard: blocks fast double-clicks before re-render
    busyRef.current = id;
    setBusy(id);
    try {
      await fn();
      notify({ title: successTitle, tone: 'success', icon: 'check' });
    } catch (e: any) {
      notify({ title: 'Помилка', body: e?.message || 'Не вдалося виконати дію', tone: 'error', icon: 'warn' });
    } finally {
      busyRef.current = null;
      setBusy(null);
    }
  };

  const submitTrigger = async () => {
    if (!triggerModal || !selPlaylist) return;
    try {
      await api.triggerAd(triggerModal.id, Number(selPlaylist), selFiller ? Number(selFiller) : undefined);
      notify({ title: 'Рекламу запущено', body: triggerModal.name, tone: 'accent', icon: 'megaphone' });
      setTriggerModal(null);
      setSelPlaylist('');
      setSelFiller('');
    } catch (e: any) {
      notify({ title: 'Помилка', body: e?.message || 'Не вдалося запустити', tone: 'error', icon: 'warn' });
    }
  };

  // Disabled regions shouldn't appear on the live dashboard at all — the
  // stream is stopped, and leaving them in the grid contradicted the
  // "вимкнений" badge on the Regions page. Users toggle them back on from
  // /regions if they want them to reappear.
  const liveRegions = useMemo(() => regions.filter(r => r.enabled !== false), [regions]);

  const counts = useMemo(() => {
    const c: Record<Mode, number> = { main: 0, ad: 0, filler: 0, stopped: 0 };
    liveRegions.forEach(r => { c[modeOf(r)]++; });
    return c;
  }, [liveRegions]);

  const filtered = filter === 'all' ? liveRegions : liveRegions.filter(r => modeOf(r) === filter);

  if (loading) {
    return (
      <div style={{ padding: '80px 24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
        Завантаження…
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title="Мережевий дашборд"
        subtitle={`${regions.length} регіонів · керування вставкою реклами в реальному часі`}
        actions={
          <Badge tone={connected ? 'success' : 'error'} dot>
            {connected ? 'teren.fm' : 'offline'}
          </Badge>
        }
      />

      <div className="kpi-grid">
        <KpiCard
          label="В ефірі"
          value={`${counts.main} / ${liveRegions.length}`}
          tone="accent"
          icon="broadcast"
          sub="регіони в основному режимі"
        />
        <KpiCard
          label="Реклама"
          value={String(counts.ad)}
          tone="neutral"
          icon="megaphone"
          sub="активних рекламних вставок"
        />
        <KpiCard
          label="Філер"
          value={String(counts.filler)}
          tone="neutral"
          icon="playlist"
          sub="регіонів на філері"
        />
        <KpiCard
          label="Зупинено"
          value={String(counts.stopped)}
          tone="neutral"
          icon="stop"
          sub={counts.stopped > 0 ? 'потребує уваги' : 'усе працює'}
        />
      </div>

      <Card padding={0}>
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 18px', borderBottom: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Регіони · live</h3>
            <Badge tone="neutral">{liveRegions.length}</Badge>
          </div>
          <DropdownSelect
            size="sm"
            width={140}
            value={filter}
            onChange={v => setFilter(v)}
            options={[
              { value: 'all',     label: 'Всі' },
              { value: 'main',    label: 'Ефір' },
              { value: 'ad',      label: 'Реклама' },
              { value: 'filler',  label: 'Філер' },
              { value: 'stopped', label: 'Зупинено' },
            ]}
          />
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: '60px 24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
            {regions.length === 0 ? 'Немає регіонів. Додайте їх у розділі «Регіони».' : 'Нічого не знайдено за фільтром.'}
          </div>
        ) : (
          <div
            style={{
              padding: 14,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 12,
            }}
          >
            {filtered.map(r => (
              <RegionCard
                key={r.id}
                region={r}
                busy={busy === r.id}
                onStart={() => action(() => api.startMain(r.id), r.id, 'Регіон запущено')}
                onStop={() => action(() => api.stopRegion(r.id), r.id, 'Регіон зупинено')}
                onReturn={() => action(() => api.returnToMain(r.id), r.id, 'Повернуто в ефір')}
                onTrigger={() => { setTriggerModal(r); setSelPlaylist(''); setSelFiller(''); }}
              />
            ))}
          </div>
        )}
      </Card>

      <Modal
        open={!!triggerModal}
        onClose={() => setTriggerModal(null)}
        title="Запуск реклами"
        subtitle={triggerModal?.name}
        footer={
          <>
            <Button variant="ghost" onClick={() => setTriggerModal(null)}>Скасувати</Button>
            <Button variant="primary" icon="megaphone" onClick={submitTrigger} disabled={!selPlaylist}>
              Запустити
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Плейлист реклами" required>
            <DropdownSelect
              value={String(selPlaylist)}
              onChange={v => setSelPlaylist(v === '' ? '' : Number(v))}
              options={[
                { value: '', label: '— оберіть плейлист —' },
                ...playlists
                  .filter(p => p.type === 'ad')
                  .map(p => ({ value: String(p.id), label: `${p.name}${p.item_count != null ? ` (${p.item_count})` : ''}` })),
              ]}
            />
          </Field>
          <Field label="Філер після реклами" hint="Опціонально — без філера буде повернення в ефір">
            <DropdownSelect
              value={String(selFiller)}
              onChange={v => setSelFiller(v === '' ? '' : Number(v))}
              options={[
                { value: '', label: '— без філера —' },
                ...playlists.filter(p => p.type === 'filler').map(p => ({ value: String(p.id), label: p.name })),
              ]}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

function RegionCard({
  region, busy, onStart, onStop, onReturn, onTrigger,
}: {
  region: Region;
  busy: boolean;
  onStart: () => void;
  onStop: () => void;
  onReturn: () => void;
  onTrigger: () => void;
}) {
  const m = modeOf(region);
  const meta = MODE_META[m];
  const color =
    m === 'main'    ? 'var(--success)' :
    m === 'ad'      ? 'var(--accent)'  :
    m === 'filler'  ? 'var(--info)'    :
                      'var(--text-muted)';

  return (
    <div
      className="card"
      style={{
        display: 'flex', flexDirection: 'column', gap: 12,
        position: 'relative', overflow: 'hidden',
        padding: 14,
      }}
    >
      <span style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: color, opacity: m === 'stopped' ? 0.4 : 1,
      }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              className="live-dot"
              style={{
                width: 7, height: 7,
                background: color, color,
                ...(m === 'stopped' ? { animation: 'none' } : null),
              }}
            />
            <div style={{
              fontSize: 13, fontWeight: 500,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {region.name}
            </div>
          </div>
          {region.icecast_mount && (
            <div
              className="mono"
              style={{
                marginTop: 4, fontSize: 10,
                color: 'var(--text-muted)', letterSpacing: '0.06em',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {region.icecast_mount}
            </div>
          )}
        </div>
        <Badge tone={meta.tone}>
          <Icon name={meta.icon} size={11} stroke={1.8} />
          {meta.label}
        </Badge>
      </div>

      {region.live?.currentFile && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 10px',
            background: 'var(--accent-dim)',
            border: '1px solid rgba(255,106,26,0.22)',
            borderRadius: 8,
            minWidth: 0,
          }}
        >
          <Icon name="play" size={11} stroke={2} />
          <span
            className="mono"
            style={{
              fontSize: 11, color: 'var(--accent)', letterSpacing: '0.02em',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {region.live.currentFile}
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
        {m === 'stopped' && (
          <Button variant="success" size="sm" icon="play" onClick={onStart} disabled={busy} style={{ flex: 1 }}>
            Запустити
          </Button>
        )}
        {m === 'main' && (
          <>
            <Button variant="primary" size="sm" icon="megaphone" onClick={onTrigger} disabled={busy} style={{ flex: 1 }}>
              Реклама
            </Button>
            <Button variant="secondary" size="sm" icon="stop" onClick={onStop} disabled={busy} aria-label="Стоп" />
          </>
        )}
        {(m === 'ad' || m === 'filler') && (
          <>
            <Button variant="success" size="sm" icon="return" onClick={onReturn} disabled={busy} style={{ flex: 1 }}>
              В ефір
            </Button>
            <Button variant="secondary" size="sm" icon="stop" onClick={onStop} disabled={busy} aria-label="Стоп" />
          </>
        )}
      </div>
    </div>
  );
}

