import { useEffect, useState } from 'react';
import { api } from '../api';
import {
  Badge,
  Button,
  DropdownSelect,
  Field,
  Modal,
  PageHeader,
  Toggle,
  useToast,
} from '../components/ui';

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

type FormShape = {
  region_id: string;
  playlist_id: string;
  days: string;
  times: string[];
  enabled: boolean;
};

const empty: FormShape = { region_id: '', playlist_id: '', days: 'all', times: [''], enabled: true };

export default function SchedulesPage() {
  const notify = useToast();
  const [schedules, setSchedules] = useState<any[]>([]);
  const [regions, setRegions] = useState<any[]>([]);
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [modal, setModal] = useState<null | 'create' | number>(null);
  const [form, setForm] = useState<FormShape>(empty);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<number | null>(null);

  const load = async () => {
    const [s, r, p] = await Promise.all([api.getSchedules(), api.getRegions(), api.getPlaylists()]);
    setSchedules(s); setRegions(r); setPlaylists(p);
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => { setForm({ ...empty, times: [''] }); setModal('create'); };
  const openEdit = (s: any) => {
    let times: string[] = [];
    try { times = JSON.parse(s.times); } catch {}
    setForm({
      region_id: String(s.region_id),
      playlist_id: String(s.playlist_id),
      days: s.days,
      times: times.length ? times : [''],
      enabled: s.enabled,
    });
    setModal(s.id);
  };

  const save = async () => {
    setSaving(true);
    try {
      const data = {
        ...form,
        region_id: Number(form.region_id),
        playlist_id: Number(form.playlist_id),
        times: form.times.filter(t => t.trim()),
      };
      if (modal === 'create') await api.createSchedule(data);
      else await api.updateSchedule(modal as number, data);
      setModal(null); await load();
      notify({ title: 'Збережено', tone: 'success', icon: 'check' });
    } catch (e: any) {
      notify({ title: 'Помилка', body: e?.message, tone: 'error', icon: 'warn' });
    } finally { setSaving(false); }
  };

  const doDelete = async () => {
    if (!confirm) return;
    try {
      await api.deleteSchedule(confirm);
      notify({ title: 'Розклад видалено', tone: 'success', icon: 'check' });
      await load();
    } catch (e: any) {
      notify({ title: 'Помилка', body: e?.message, tone: 'error', icon: 'warn' });
    } finally { setConfirm(null); }
  };

  const parseTimes = (s: any): string[] => { try { return JSON.parse(s.times); } catch { return []; } };
  const f = <K extends keyof FormShape>(k: K, v: FormShape[K]) => setForm(p => ({ ...p, [k]: v }));
  const setTime = (i: number, v: string) => f('times', form.times.map((t, idx) => idx === i ? v : t));

  const valid = form.region_id && form.playlist_id && form.times.some(t => t.trim());

  return (
    <div className="page">
      <PageHeader
        title="Розклад"
        subtitle={`${schedules.length} записів · автоматичні запуски за часом`}
        actions={<Button variant="primary" icon="plus" onClick={openCreate}>Додати розклад</Button>}
      />

      {schedules.length === 0 ? (
        <div className="card" style={{ padding: '60px 24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
          Немає записів розкладу. Натисніть «Додати розклад», щоб створити перший.
        </div>
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Регіон</th>
                <th>Плейлист</th>
                <th>Дні</th>
                <th>Час</th>
                <th>Статус</th>
                <th style={{ width: 120 }}></th>
              </tr>
            </thead>
            <tbody>
              {schedules.map(s => {
                const times = parseTimes(s);
                return (
                  <tr key={s.id}>
                    <td className="cell-title" style={{ fontWeight: 500 }}>{s.region_name}</td>
                    <td data-label="Плейлист" className="col-muted">{s.playlist_name}</td>
                    <td data-label="Дні" className="col-muted" style={{ fontSize: 12 }}>
                      {DAYS.find(d => d.value === s.days)?.label || s.days}
                    </td>
                    <td data-label="Час" className="mono" style={{ fontSize: 12, color: 'var(--accent)' }}>
                      {times.join(', ')}
                    </td>
                    <td data-label="Статус">
                      <Badge tone={s.enabled ? 'success' : 'neutral'} dot>
                        {s.enabled ? 'активний' : 'вимкнений'}
                      </Badge>
                    </td>
                    <td className="cell-actions" style={{ textAlign: 'right' }}>
                      <Button variant="ghost" size="sm" icon="edit" onClick={() => openEdit(s)} />
                      <Button variant="ghost" size="sm" icon="trash" onClick={() => setConfirm(s.id)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal === 'create' ? 'Новий розклад' : 'Редагувати розклад'}
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
          <Field label="Регіон" required>
            <DropdownSelect
              value={form.region_id}
              onChange={v => f('region_id', v)}
              options={[
                { value: '', label: '— оберіть регіон —' },
                ...regions.map(r => ({ value: String(r.id), label: r.name })),
              ]}
            />
          </Field>
          <Field label="Плейлист реклами" required>
            <DropdownSelect
              value={form.playlist_id}
              onChange={v => f('playlist_id', v)}
              options={[
                { value: '', label: '— оберіть плейлист —' },
                ...playlists.filter(p => p.type === 'ad').map(p => ({ value: String(p.id), label: p.name })),
              ]}
            />
          </Field>
          <Field label="Дні тижня">
            <DropdownSelect
              value={form.days}
              onChange={v => f('days', v)}
              options={DAYS}
            />
          </Field>
          <Field label="Час виходу">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {form.times.map((t, i) => (
                <div key={i} style={{ display: 'flex', gap: 6 }}>
                  <input
                    className="input mono"
                    value={t}
                    onChange={e => setTime(i, e.target.value)}
                    placeholder="HH:MM"
                    maxLength={5}
                    style={{ flex: 1 }}
                  />
                  {form.times.length > 1 && (
                    <Button
                      variant="ghost" size="sm" icon="close"
                      onClick={() => f('times', form.times.filter((_, idx) => idx !== i))}
                    />
                  )}
                </div>
              ))}
              <Button
                variant="ghost" size="sm" icon="plus"
                onClick={() => f('times', [...form.times, ''])}
              >
                Додати час
              </Button>
            </div>
          </Field>
          <Toggle label="Активний" value={form.enabled} onChange={v => f('enabled', v)} />
        </div>
      </Modal>

      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title="Видалити розклад?"
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

