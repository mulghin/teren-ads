import { FormEvent, useState } from 'react';
import { ApiError, api } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { Button, Field } from '../components/ui';

// First-run admin bootstrap. Backend rejects this endpoint once any user
// exists, so even if a stale /setup tab hangs around it can't hijack an
// existing install.
export default function SetupPage() {
  const { refresh } = useAuth();
  const [username, setUsername] = useState('admin');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError('Пароль щонайменше 8 символів'); return; }
    if (password !== confirm) { setError('Паролі не збігаються'); return; }

    setSubmitting(true);
    try {
      await api.setup({ username: username.trim(), password, name: name.trim() });
      await refresh();
    } catch (e: any) {
      if (e instanceof ApiError) {
        try {
          const payload = JSON.parse(e.message);
          setError(payload.error || 'Не вдалося створити адміна');
        } catch { setError(e.message); }
      } else setError(e?.message || 'Не вдалося створити адміна');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'grid',
      placeItems: 'center',
      padding: 24,
      background: 'var(--bg)',
    }}>
      <form
        onSubmit={onSubmit}
        style={{
          width: '100%', maxWidth: 440,
          padding: 28,
          borderRadius: 14,
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}
      >
        <div style={{ marginBottom: 4 }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>Створити першого адміна</h1>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
            Цей екран з'являється один раз. Надалі керування користувачами — у розділі <strong>Users</strong>.
          </p>
        </div>

        <Field label="Логін">
          <input
            className="input"
            autoFocus
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
            pattern="[a-zA-Z0-9._\-]{2,32}"
            placeholder="admin"
          />
        </Field>
        <Field label="Ім'я (опціонально)">
          <input
            className="input"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Display name"
          />
        </Field>
        <Field label="Пароль">
          <input
            className="input"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={8}
            placeholder="≥ 8 символів"
          />
        </Field>
        <Field label="Повторіть пароль">
          <input
            className="input"
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            required
            minLength={8}
          />
        </Field>

        {error && (
          <div style={{
            padding: '10px 12px',
            borderRadius: 8,
            background: 'rgba(255,59,48,0.12)',
            border: '1px solid rgba(255,59,48,0.45)',
            color: '#ffd5d2',
            fontSize: 12,
          }}>{error}</div>
        )}

        <Button type="submit" variant="primary" size="lg" disabled={submitting} style={{ width: '100%' }}>
          {submitting ? 'Створюю…' : 'Створити адміна'}
        </Button>
      </form>
    </div>
  );
}
