import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError, Me } from '../api';
import { useMe } from '../contexts/AuthContext';
import {
  Badge, Button, DropdownSelect, Field, Modal, PageHeader, useToast,
} from '../components/ui';

type Role = 'admin' | 'operator' | 'viewer';
const ROLES: Role[] = ['admin', 'operator', 'viewer'];

interface HistoryEntry {
  at: string; ip: string; ua: string; device: string; ok: boolean;
  reason?: 'wrong_pw' | 'locked' | 'disabled';
}

interface IpBan {
  ip: string;
  fails_unknown: number;
  fails_wrong_pw: number;
  last_fail_at: string | null;
  banned_until: string | null;
  is_banned: boolean;
}

const ROLE_TONE: Record<Role, 'warn' | 'accent' | 'info'> = {
  admin: 'warn',
  operator: 'accent',
  viewer: 'info',
};

const REASON_LABEL: Record<string, string> = {
  wrong_pw: 'неправильний пароль',
  locked:   'заблоковано',
  disabled: 'деактивовано',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('uk-UA', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function isLocked(u: Me): boolean {
  return !!(u.locked_until && new Date(u.locked_until).getTime() > Date.now());
}

export default function UsersPage() {
  const me = useMe();
  const notify = useToast();
  const [users, setUsers] = useState<Me[]>([]);
  const [ipBans, setIpBans] = useState<IpBan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editUser, setEditUser] = useState<Me | null>(null);
  const [historyUser, setHistoryUser] = useState<Me | null>(null);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);

  const reload = async () => {
    try {
      const [u, bans] = await Promise.all([api.getUsers(), api.getIpBans()]);
      setUsers(u);
      setIpBans(bans);
    } catch (e: any) {
      notify({ title: 'Помилка завантаження', body: e?.message, tone: 'error', icon: 'warn' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  const openHistory = async (u: Me) => {
    setHistoryUser(u);
    setHistory(null);
    try {
      setHistory(await api.getUserHistory(u.username));
    } catch (e: any) {
      setHistory([]);
      notify({ title: 'Помилка історії', body: e?.message, tone: 'error', icon: 'warn' });
    }
  };

  if (me?.role !== 'admin') {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        Потрібні права адміністратора.
      </div>
    );
  }

  const bannedCount = ipBans.filter(r => r.is_banned).length;

  return (
    <div className="page" style={{ maxWidth: 1060 }}>
      <PageHeader
        title="Користувачі"
        subtitle="Управління акаунтами, ролі, IP-бани"
        actions={<Button variant="primary" icon="plus" onClick={() => setShowAdd(true)}>Додати користувача</Button>}
      />

      {ipBans.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>IP-бани</h3>
              <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {bannedCount} заблоковано · {ipBans.length - bannedCount} під наглядом
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ipBans.map(r => (
              <div key={r.ip} className="stack-row" style={{
                gridTemplateColumns: '180px 1fr 180px 110px',
                background: r.is_banned ? 'rgba(255,59,48,0.06)' : 'transparent',
                border: '1px solid var(--border)',
                fontSize: 12,
              }}>
                <span className="mono" style={{ fontWeight: 600 }}>{r.ip}</span>
                <span className="mono" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                  unknown: {r.fails_unknown} · wrong_pw: {r.fails_wrong_pw} · last: {fmtDate(r.last_fail_at)}
                </span>
                <span className="mono" style={{
                  color: r.is_banned ? 'var(--danger, #ff3b30)' : 'var(--text-muted)',
                  fontSize: 11,
                }}>
                  {r.is_banned ? `забанено до ${fmtDate(r.banned_until)}` : 'не забанено'}
                </span>
                <div style={{ textAlign: 'right' }}>
                  <Button variant="ghost" size="sm" onClick={async () => {
                    try {
                      await api.unbanIp(r.ip);
                      await reload();
                      notify({ title: 'IP розблоковано', tone: 'success', icon: 'check' });
                    } catch (e: any) {
                      notify({ title: 'Помилка', body: e?.message, tone: 'error', icon: 'warn' });
                    }
                  }}>{r.is_banned ? 'Розбанити' : 'Скинути'}</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>Завантаження…</div>
        ) : users.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>Немає користувачів</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-card)' }}>
                <Th>Користувач</Th>
                <Th>Роль</Th>
                <Th>Статус</Th>
                <Th>Останній вхід</Th>
                <Th align="right">Дії</Th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const isMe = me?.username === u.username;
                const locked = isLocked(u);
                const role = (ROLES.includes(u.role as Role) ? u.role : 'viewer') as Role;
                return (
                  <tr key={u.username} style={{ borderTop: '1px solid var(--border)' }}>
                    <Td>
                      <div style={{ fontWeight: 500 }}>
                        {u.name || u.username}
                        {isMe && <span className="mono" style={{ marginLeft: 8, fontSize: 10, color: 'var(--accent)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>(you)</span>}
                      </div>
                      {u.name && <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{u.username}</div>}
                    </Td>
                    <Td>
                      <Badge tone={ROLE_TONE[role]}>{role}</Badge>
                    </Td>
                    <Td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Badge tone={u.active ? 'success' : 'neutral'} dot>
                          {u.active ? 'active' : 'disabled'}
                        </Badge>
                        {locked && <Badge tone="warn">🔒 locked</Badge>}
                        {!locked && u.login_fails > 0 && (
                          <span className="mono" style={{ fontSize: 10, color: 'var(--warn, #ffb020)' }}>
                            {u.login_fails} невдал{u.login_fails === 1 ? 'а спроба' : 'их'}
                          </span>
                        )}
                      </div>
                    </Td>
                    <Td>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {fmtDate(u.last_login)}
                      </span>
                    </Td>
                    <Td align="right">
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        {locked && (
                          <Button variant="ghost" size="sm" onClick={async () => {
                            try {
                              await api.unlockUser(u.username);
                              await reload();
                              notify({ title: 'Розблоковано', tone: 'success', icon: 'check' });
                            } catch (e: any) {
                              notify({ title: 'Помилка', body: e?.message, tone: 'error', icon: 'warn' });
                            }
                          }}>🔓</Button>
                        )}
                        <Button variant="ghost" size="sm" icon="clock" onClick={() => openHistory(u)} title="Історія" />
                        <Button variant="ghost" size="sm" icon="edit" onClick={() => setEditUser(u)} />
                        {!isMe && (
                          <Button variant="ghost" size="sm" icon="trash" onClick={async () => {
                            if (!confirm(`Видалити ${u.username}?`)) return;
                            try {
                              await api.deleteUser(u.username);
                              await reload();
                              notify({ title: 'Видалено', tone: 'success', icon: 'check' });
                            } catch (e: any) {
                              let msg = e?.message;
                              if (e instanceof ApiError) {
                                try { msg = JSON.parse(e.message).error; } catch {}
                              }
                              notify({ title: 'Помилка', body: msg, tone: 'error', icon: 'warn' });
                            }
                          }} />
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <AddUserModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onCreated={async () => { setShowAdd(false); await reload(); }}
      />
      <EditUserModal
        user={editUser}
        onClose={() => setEditUser(null)}
        onSaved={async () => { setEditUser(null); await reload(); }}
        isMe={editUser?.username === me?.username}
      />
      <Modal
        open={!!historyUser}
        onClose={() => { setHistoryUser(null); setHistory(null); }}
        title={`Історія входів · ${historyUser?.username || ''}`}
        width={720}
      >
        {!history ? (
          <div style={{ padding: 20, color: 'var(--text-muted)', textAlign: 'center' }}>Завантаження…</div>
        ) : history.length === 0 ? (
          <div style={{ padding: 20, color: 'var(--text-muted)', textAlign: 'center', fontSize: 13 }}>
            Історія порожня — користувач ще не входив після додавання цієї функції.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {history.map((h, i) => (
              <div key={i} className="stack-row" style={{
                gridTemplateColumns: '160px 130px 1fr 100px',
                padding: '8px 4px',
                borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                fontSize: 12,
                background: h.ok ? 'transparent' : 'rgba(255,59,48,0.04)',
                borderRadius: 6,
              }}>
                <span className="mono" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtDate(h.at)}</span>
                <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{h.ip || '—'}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={h.ua}>
                  {h.device || 'unknown'}
                </span>
                <Badge tone={h.ok ? 'success' : 'error'}>
                  {h.ok ? 'успіх' : REASON_LABEL[h.reason || ''] || 'fail'}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th style={{
      textAlign: align,
      padding: '10px 14px',
      fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase',
      color: 'var(--text-muted)', fontWeight: 500,
    }}>{children}</th>
  );
}

function Td({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <td style={{ padding: '12px 14px', textAlign: align, verticalAlign: 'middle' }}>{children}</td>
  );
}

function AddUserModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => Promise<void> }) {
  const notify = useToast();
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('operator');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setUsername(''); setName(''); setPassword(''); setRole('operator'); setError(null); }
  }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.createUser({ username: username.trim(), password, name: name.trim(), role });
      notify({ title: 'Користувача створено', tone: 'success', icon: 'check' });
      await onCreated();
    } catch (e: any) {
      let msg = e?.message;
      if (e instanceof ApiError) { try { msg = JSON.parse(e.message).error; } catch {} }
      setError(msg || 'Не вдалося створити');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Додати користувача" width={460}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Логін">
          <input className="input" required pattern="[a-zA-Z0-9._\-]{2,32}"
                 value={username} onChange={e => setUsername(e.target.value)} autoFocus
                 placeholder="newuser" />
        </Field>
        <Field label="Ім'я (опціонально)">
          <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Display name" />
        </Field>
        <Field label="Пароль">
          <input className="input" type="password" required minLength={8}
                 value={password} onChange={e => setPassword(e.target.value)} placeholder="≥ 8 символів" />
        </Field>
        <Field label="Роль">
          <DropdownSelect<Role>
            value={role}
            onChange={setRole}
            options={[
              { value: 'operator', label: 'operator' },
              { value: 'admin',    label: 'admin' },
              { value: 'viewer',   label: 'viewer' },
            ]}
          />
        </Field>
        {error && (
          <div style={{
            padding: '10px 12px', borderRadius: 8,
            background: 'rgba(255,59,48,0.12)', border: '1px solid rgba(255,59,48,0.45)',
            color: '#ffd5d2', fontSize: 12,
          }}>{error}</div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <Button type="button" variant="ghost" onClick={onClose}>Скасувати</Button>
          <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Створюю…' : 'Створити'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function EditUserModal({
  user, isMe, onClose, onSaved,
}: {
  user: Me | null;
  isMe: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const notify = useToast();
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('operator');
  const [active, setActive] = useState(true);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setRole((ROLES.includes(user.role as Role) ? user.role : 'operator') as Role);
      setActive(user.active !== false);
      setPassword('');
      setError(null);
    }
  }, [user]);

  if (!user) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload: any = { name, role, active };
      if (password) payload.password = password;
      await api.updateUser(user.username, payload);
      notify({ title: 'Збережено', tone: 'success', icon: 'check' });
      await onSaved();
    } catch (e: any) {
      let msg = e?.message;
      if (e instanceof ApiError) { try { msg = JSON.parse(e.message).error; } catch {} }
      setError(msg || 'Не вдалося зберегти');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={!!user} onClose={onClose} title={`Редагувати · ${user.username}`} width={460}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Ім'я">
          <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Display name" />
        </Field>
        <Field label="Роль">
          <DropdownSelect<Role>
            value={role}
            onChange={setRole}
            disabled={isMe}
            options={[
              { value: 'admin',    label: 'admin' },
              { value: 'operator', label: 'operator' },
              { value: 'viewer',   label: 'viewer' },
            ]}
          />
          {isMe && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            Не можна змінити власну роль
          </span>}
        </Field>
        <Field label="Статус">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} disabled={isMe} />
            <span>Активний</span>
          </label>
        </Field>
        <Field label="Новий пароль (опціонально)">
          <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)}
                 minLength={8} placeholder="≥ 8 символів" />
        </Field>
        {error && (
          <div style={{
            padding: '10px 12px', borderRadius: 8,
            background: 'rgba(255,59,48,0.12)', border: '1px solid rgba(255,59,48,0.45)',
            color: '#ffd5d2', fontSize: 12,
          }}>{error}</div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <Button type="button" variant="ghost" onClick={onClose}>Скасувати</Button>
          <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Зберігаю…' : 'Зберегти'}</Button>
        </div>
      </form>
    </Modal>
  );
}
