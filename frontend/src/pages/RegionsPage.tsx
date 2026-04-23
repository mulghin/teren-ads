import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import {
  Badge,
  Button,
  DropdownSelect,
  Field,
  Icon,
  Modal,
  PageHeader,
  Toggle,
  useToast,
} from '../components/ui';

const RETURN_MODES = [
  { value: 'signal',       label: 'Чекати сигнал (API / тон)' },
  { value: 'playlist_end', label: 'Автоповернення після плейлиста' },
  { value: 'timer',        label: 'За таймером' },
];

type Region = {
  id: number;
  name: string;
  slug: string;
  icecast_mount: string;
  crossfade_sec: number;
  return_mode: string;
  return_timer_sec: number;
  enabled: boolean;
};

const empty = {
  name: '', slug: '', icecast_mount: '',
  crossfade_sec: 3, return_mode: 'signal', return_timer_sec: 0, enabled: true,
};

export default function RegionsPage() {
  const navigate = useNavigate();
  const notify = useToast();
  const [regions, setRegions] = useState<Region[]>([]);
  const [modal, setModal] = useState<null | 'create' | number>(null);
  const [form, setForm] = useState({ ...empty });
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<null | { id: number; name: string }>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'enabled' | 'disabled'>('all');

  const load = async () => setRegions(await api.getRegions());
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let list = regions;
    if (filter === 'enabled') list = list.filter(r => r.enabled);
    if (filter === 'disabled') list = list.filter(r => !r.enabled);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.name.toLowerCase().includes(q) ||
        r.slug.toLowerCase().includes(q) ||
        r.icecast_mount.toLowerCase().includes(q)
      );
    }
    return list;
  }, [regions, filter, search]);

  const openCreate = () => { setForm({ ...empty }); setModal('create'); };
  const openEdit = (r: Region) => {
    setForm({
      name: r.name, slug: r.slug, icecast_mount: r.icecast_mount,
      crossfade_sec: r.crossfade_sec, return_mode: r.return_mode,
      return_timer_sec: r.return_timer_sec, enabled: r.enabled,
    });
    setModal(r.id);
  };

  const save = async () => {
    setSaving(true);
    try {
      if (modal === 'create') await api.createRegion(form);
      else await api.updateRegion(modal as number, form);
      setModal(null); await load();
      notify({ title: 'Збережено', tone: 'success', icon: 'check' });
    } catch (e: any) {
      notify({ title: 'Помилка', body: e?.message, tone: 'error', icon: 'warn' });
    } finally { setSaving(false); }
  };

  const doDelete = async () => {
    if (!confirm) return;
    try {
      await api.deleteRegion(confirm.id);
      notify({ title: 'Регіон видалено', tone: 'success', icon: 'check' });
      await load();
    } catch (e: any) {
      notify({ title: 'Помилка', body: e?.message, tone: 'error', icon: 'warn' });
    } finally { setConfirm(null); }
  };

  const f = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));
  const valid = form.name && form.slug && form.icecast_mount;

  const enabledCount = regions.filter(r => r.enabled).length;

  return (
    <div className="page">
      <PageHeader
        title="Регіони"
        subtitle={`${regions.length} регіонів · ${enabledCount} активних`}
        actions={
          <Button variant="primary" icon="plus" onClick={openCreate}>Додати регіон</Button>
        }
      />

      <div className="filters-row">
        <div className="search-box">
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
            <Icon name="search" size={14} />
          </span>
          <input
            className="input input-with-icon"
            placeholder="Пошук по назві, slug або mount…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 3 }}>
          {([
            { v: 'all',      label: 'Всі',       count: regions.length },
            { v: 'enabled',  label: 'Активні',   count: enabledCount },
            { v: 'disabled', label: 'Вимкнені',  count: regions.length - enabledCount },
          ] as const).map(t => (
            <button
              key={t.v}
              onClick={() => setFilter(t.v)}
              style={{
                padding: '6px 12px', borderRadius: 7,
                fontSize: 12, fontWeight: 500,
                color: filter === t.v ? 'var(--text)' : 'var(--text-secondary)',
                background: filter === t.v ? 'var(--bg-hover)' : 'transparent',
                display: 'flex', alignItems: 'center', gap: 6,
                border: 'none', cursor: 'pointer',
              }}
            >
              {t.label}
              <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t.count}</span>
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card" style={{ padding: '60px 24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
          {regions.length === 0 ? 'Немає регіонів. Натисніть «Додати регіон», щоб створити перший.' : 'Нічого не знайдено.'}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 36 }}></th>
                <th>Назва</th>
                <th>Icecast mount</th>
                <th>Crossfade</th>
                <th>Повернення</th>
                <th>Статус</th>
                <th style={{ width: 120 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr
                  key={r.id}
                  onClick={() => navigate(`/regions/${r.id}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <td>
                    <span
                      className={`live-dot${r.enabled ? '' : ' muted'}`}
                      style={{ width: 8, height: 8 }}
                    />
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontWeight: 500 }}>{r.name}</span>
                      <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
                        {r.slug}
                      </span>
                    </div>
                  </td>
                  <td className="mono col-muted" style={{ fontSize: 12 }}>{r.icecast_mount}</td>
                  <td className="col-muted">{r.crossfade_sec}с</td>
                  <td className="col-muted" style={{ fontSize: 12 }}>
                    {RETURN_MODES.find(m => m.value === r.return_mode)?.label}
                    {r.return_mode === 'timer' && ` (${r.return_timer_sec}с)`}
                  </td>
                  <td>
                    <Badge tone={r.enabled ? 'success' : 'neutral'} dot>
                      {r.enabled ? 'активний' : 'вимкнений'}
                    </Badge>
                  </td>
                  <td onClick={e => e.stopPropagation()} style={{ textAlign: 'right' }}>
                    <Button variant="ghost" size="sm" icon="edit" onClick={() => openEdit(r)} aria-label="Редагувати" />
                    <Button variant="ghost" size="sm" icon="trash" onClick={() => setConfirm({ id: r.id, name: r.name })} aria-label="Видалити" />
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
        title={modal === 'create' ? 'Новий регіон' : 'Редагувати регіон'}
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
          <Field label="Назва" required>
            <input className="input" value={form.name} onChange={e => f('name', e.target.value)} placeholder="Схід" />
          </Field>
          <Field label="Slug (латиниця)" required>
            <input
              className="input"
              value={form.slug}
              onChange={e => f('slug', e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
              placeholder="east"
            />
          </Field>
          <Field label="Icecast mount" required>
            <input className="input" value={form.icecast_mount} onChange={e => f('icecast_mount', e.target.value)} placeholder="/region_east" />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Crossfade, сек">
              <input
                type="number" min={0} max={10}
                className="input"
                value={form.crossfade_sec}
                onChange={e => f('crossfade_sec', Number(e.target.value))}
              />
            </Field>
            <Field label="Повернення в ефір">
              <DropdownSelect
                value={form.return_mode}
                onChange={v => f('return_mode', v)}
                options={RETURN_MODES}
              />
            </Field>
          </div>
          {form.return_mode === 'timer' && (
            <Field label="Таймер, сек">
              <input
                type="number" min={0}
                className="input"
                value={form.return_timer_sec}
                onChange={e => f('return_timer_sec', Number(e.target.value))}
              />
            </Field>
          )}
          <Toggle label="Регіон активний" value={form.enabled} onChange={v => f('enabled', v)} />
        </div>
      </Modal>

      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title="Видалити регіон?"
        subtitle={confirm?.name}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>Скасувати</Button>
            <Button variant="danger" icon="trash" onClick={doDelete}>Видалити</Button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Це також видалить усі пов'язані розклади та призначення. Дію неможливо скасувати.
        </p>
      </Modal>
    </div>
  );
}

