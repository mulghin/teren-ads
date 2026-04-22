import { useEffect, useState } from 'react';
import { api } from '../api';
import { Button, Field, PageHeader, Toggle, useToast } from '../components/ui';

export default function SettingsPage() {
  const notify = useToast();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [initial, setInitial] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [testingTg, setTestingTg] = useState(false);

  useEffect(() => {
    api.getSettings().then((s: Record<string, string>) => {
      setSettings(s);
      setInitial(s);
    });
  }, []);

  const set = (k: string, v: string) => setSettings(p => ({ ...p, [k]: v }));

  const dirty = Object.keys({ ...initial, ...settings })
    .some(k => (settings[k] ?? '') !== (initial[k] ?? ''));

  const save = async () => {
    setSaving(true);
    try {
      await api.saveSettings(settings);
      setInitial(settings);
      notify({ title: 'Налаштування збережено', tone: 'success', icon: 'check' });
    } catch (e: any) {
      notify({ title: 'Помилка', body: e?.message, tone: 'error', icon: 'warn' });
    } finally { setSaving(false); }
  };

  const testTelegram = async () => {
    setTestingTg(true);
    try {
      if (dirty) {
        await api.saveSettings(settings);
        setInitial(settings);
      }
      const r = await api.testTelegram();
      if (r.ok) {
        notify({ title: 'Telegram: тест відправлено', body: 'Перевірте чат', tone: 'success', icon: 'check' });
      } else {
        notify({ title: 'Telegram: помилка', body: r.error, tone: 'error', icon: 'warn' });
      }
    } catch (e: any) {
      notify({ title: 'Telegram: помилка', body: e?.message, tone: 'error', icon: 'warn' });
    } finally { setTestingTg(false); }
  };

  return (
    <div style={{ padding: '0 24px 40px', maxWidth: 780 }}>
      <PageHeader
        title="Налаштування"
        subtitle="Потоки, тональний детектор, webhook-інтеграції"
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Section title="Потік та Icecast">
          <Field label="URL основного потоку">
            <input type="url" className="input"
              value={settings.source_url ?? ''}
              onChange={e => set('source_url', e.target.value)}
              placeholder="http://icecast:8000/main" />
          </Field>
          <Field label="URL резервного потоку">
            <input type="url" className="input"
              value={settings.backup_source_url ?? ''}
              onChange={e => set('backup_source_url', e.target.value)}
              placeholder="http://backup:8000/main" />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
            <Field label="Icecast хост">
              <input type="text" className="input"
                value={settings.icecast_host ?? ''}
                onChange={e => set('icecast_host', e.target.value)}
                placeholder="localhost" />
            </Field>
            <Field label="Icecast порт">
              <input type="number" className="input"
                value={settings.icecast_port ?? ''}
                onChange={e => set('icecast_port', e.target.value)}
                placeholder="8000" />
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Source password">
              <input type="password" className="input"
                value={settings.icecast_source_password ?? ''}
                onChange={e => set('icecast_source_password', e.target.value)}
                placeholder="hackme" />
            </Field>
            <Field label="Admin password (ICY metadata)">
              <input type="password" className="input"
                value={settings.icecast_admin_password ?? ''}
                onChange={e => set('icecast_admin_password', e.target.value)}
                placeholder="hackme" />
            </Field>
          </div>
        </Section>

        <Section title="Тональний детектор">
          <Toggle
            label="Увімкнути тональний детектор"
            value={settings.tone_detection_enabled === 'true'}
            onChange={v => set('tone_detection_enabled', v ? 'true' : 'false')}
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <Field label="Старт, Hz">
              <input type="number" className="input"
                value={settings.tone_start_hz ?? ''}
                onChange={e => set('tone_start_hz', e.target.value)}
                placeholder="17500" />
            </Field>
            <Field label="Стоп, Hz">
              <input type="number" className="input"
                value={settings.tone_stop_hz ?? ''}
                onChange={e => set('tone_stop_hz', e.target.value)}
                placeholder="18500" />
            </Field>
            <Field label="Тривалість, мс">
              <input type="number" className="input"
                value={settings.tone_duration_ms ?? ''}
                onChange={e => set('tone_duration_ms', e.target.value)}
                placeholder="500" />
            </Field>
          </div>
          <Hint tone="accent">
            Частоти 17 500 та 18 500 Hz вище порогу чутності та не будуть чутні в ефірі при 320 kbps.
          </Hint>
        </Section>

        <Section title="Контроль тиші в ефірі">
          <Toggle
            label="Сповіщати про тишу в джерелі"
            value={settings.silence_alerts_enabled === 'true'}
            onChange={v => set('silence_alerts_enabled', v ? 'true' : 'false')}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Поріг тиші, dB">
              <input type="number" className="input"
                value={settings.silence_threshold_db ?? ''}
                onChange={e => set('silence_threshold_db', e.target.value)}
                placeholder="-50" />
            </Field>
            <Field label="Тривалість тиші до сповіщення, с">
              <input type="number" className="input"
                value={settings.silence_duration_sec ?? ''}
                onChange={e => set('silence_duration_sec', e.target.value)}
                placeholder="10" />
            </Field>
          </div>
        </Section>

        <Section title="Telegram сповіщення">
          <Toggle
            label="Увімкнути Telegram-бота"
            value={settings.telegram_enabled === 'true'}
            onChange={v => set('telegram_enabled', v ? 'true' : 'false')}
          />
          <Field label="Bot token">
            <input type="password" className="input"
              value={settings.telegram_bot_token ?? ''}
              onChange={e => set('telegram_bot_token', e.target.value)}
              placeholder="123456789:ABC-DEF..." />
          </Field>
          <Field label="Chat ID">
            <input type="text" className="input"
              value={settings.telegram_chat_id ?? ''}
              onChange={e => set('telegram_chat_id', e.target.value)}
              placeholder="-1001234567890 або 308044154" />
          </Field>
          <div className="section-label" style={{ marginTop: 4, fontSize: 11 }}>Типи подій</div>
          <Toggle
            label="📢 Старт реклами"
            value={settings.telegram_notify_ad_start === 'true'}
            onChange={v => set('telegram_notify_ad_start', v ? 'true' : 'false')}
          />
          <Toggle
            label="✅ Завершення реклами"
            value={settings.telegram_notify_ad_end === 'true'}
            onChange={v => set('telegram_notify_ad_end', v ? 'true' : 'false')}
          />
          <Toggle
            label="🔇 Тиша в ефірі"
            value={settings.telegram_notify_silence_alert === 'true'}
            onChange={v => set('telegram_notify_silence_alert', v ? 'true' : 'false')}
          />
          <Toggle
            label="⚠️ Перемикання на резерв"
            value={settings.telegram_notify_source_switch === 'true'}
            onChange={v => set('telegram_notify_source_switch', v ? 'true' : 'false')}
          />
          <Button onClick={testTelegram} disabled={testingTg || !settings.telegram_bot_token || !settings.telegram_chat_id}>
            {testingTg ? 'Надсилаю…' : 'Надіслати тестове повідомлення'}
          </Button>
          <Hint tone="info">
            Створіть бота в <code style={codeStyle}>@BotFather</code>, додайте в чат/канал і напишіть боту{' '}
            <code style={codeStyle}>/start</code>. Chat ID можна дізнатися у <code style={codeStyle}>@userinfobot</code>.
          </Hint>
        </Section>

        <Section title="Webhook сповіщення">
          <Field label="URL вебхуку (POST при старті / завершенні реклами)">
            <input type="url" className="input"
              value={settings.webhook_url ?? ''}
              onChange={e => set('webhook_url', e.target.value)}
              placeholder="https://your-system.com/webhook" />
          </Field>
          <Field label="Секрет (X-Webhook-Secret header)">
            <input type="text" className="input"
              value={settings.webhook_secret ?? ''}
              onChange={e => set('webhook_secret', e.target.value)}
              placeholder="optional secret" />
          </Field>
          <Hint tone="info">
            Події: <code style={codeStyle}>ad_start</code>, <code style={codeStyle}>ad_end</code>,{' '}
            <code style={codeStyle}>silence_alert</code>, <code style={codeStyle}>source_switch</code>
          </Hint>
        </Section>

        <Button variant="primary" size="lg" onClick={save} disabled={saving || !dirty} style={{ width: '100%' }}>
          {saving ? 'Збереження…' : dirty ? 'Зберегти налаштування' : 'Немає змін'}
        </Button>
      </div>
    </div>
  );
}

const codeStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  padding: '1px 6px',
  borderRadius: 4,
  background: 'rgba(255,255,255,0.06)',
  color: 'var(--text)',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="section-label" style={{ paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>{title}</div>
      {children}
    </div>
  );
}


function Hint({ tone, children }: { tone: 'accent' | 'info'; children: React.ReactNode }) {
  const colors = tone === 'accent'
    ? { bg: 'var(--accent-dim)', border: 'rgba(255,106,26,0.22)', text: 'var(--accent)' }
    : { bg: 'var(--info-dim)', border: 'rgba(59,130,246,0.20)', text: 'var(--info)' };
  return (
    <div style={{
      padding: '10px 12px',
      background: colors.bg,
      border: `1px solid ${colors.border}`,
      borderRadius: 8,
      color: colors.text,
      fontSize: 12, lineHeight: 1.5,
    }}>
      {children}
    </div>
  );
}
