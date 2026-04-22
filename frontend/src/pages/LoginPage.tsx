import { FormEvent, useState } from 'react';
import { ApiError, api } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { Button, Field } from '../components/ui';

const ERROR_LABELS: Record<string, string> = {
  invalid_credentials: 'Невірний логін або пароль',
  account_disabled:    'Акаунт деактивовано',
  account_locked:      'Акаунт тимчасово заблоковано — спробуйте через 15 хвилин',
  ip_banned:           'Ваш IP тимчасово заблоковано через забагато невдалих спроб',
  bad_request:         'Перевірте логін і пароль',
};

export default function LoginPage() {
  const { refresh } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.login(username.trim(), password);
      await refresh();
    } catch (e: any) {
      let label = 'Не вдалося увійти';
      if (e instanceof ApiError) {
        if (e.status === 429) {
          label = 'Занадто багато спроб — зачекайте 15 хвилин';
        } else {
          try {
            const payload = JSON.parse(e.message);
            label = ERROR_LABELS[payload.error] || label;
          } catch {}
        }
      }
      setError(label);
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
          width: '100%', maxWidth: 380,
          padding: 28,
          borderRadius: 14,
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', gap: 16,
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 6 }}>
          <div style={{
            width: 42, height: 42, margin: '0 auto 14px',
            borderRadius: 12,
            background: 'linear-gradient(145deg, #1f232c, #14171e)',
            border: '1px solid var(--border-strong)',
            display: 'grid', placeItems: 'center',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M4 6h16" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M12 6v14" stroke="var(--text)" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="12" cy="6" r="1.8" fill="var(--accent)" />
            </svg>
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>Teren ADS · console</h1>
          <p className="mono" style={{
            fontSize: 10, color: 'var(--text-muted)',
            letterSpacing: '0.14em', textTransform: 'uppercase', marginTop: 4,
          }}>Sign in to continue</p>
        </div>

        <Field label="Логін">
          <input
            className="input"
            autoFocus
            autoComplete="username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
            pattern="[a-zA-Z0-9._\-]{2,32}"
            placeholder="username"
          />
        </Field>
        <Field label="Пароль">
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            placeholder="••••••••"
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
          {submitting ? 'Входжу…' : 'Увійти'}
        </Button>
      </form>
    </div>
  );
}
