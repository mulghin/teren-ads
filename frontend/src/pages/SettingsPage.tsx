import { useEffect, useState } from 'react';
import { api } from '../api';

const Toggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
  <div className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${value ? 'bg-[#ff732e]' : 'bg-[#383840]'}`}
    onClick={() => onChange(!value)}>
    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${value ? 'left-4' : 'left-0.5'}`} />
  </div>
);

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { api.getSettings().then(setSettings); }, []);

  const set = (k: string, v: string) => setSettings(p => ({ ...p, [k]: v }));
  const toggle = (k: string) => set(k, settings[k] === 'true' ? 'false' : 'true');

  const save = async () => {
    setSaving(true);
    try {
      await api.saveSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  };

  return (
    <div className="p-4 sm:p-6 max-w-2xl">
      <h1 className="page-title mb-6">Налаштування</h1>
      <div className="space-y-4">

        <Section title="Потік та Icecast">
          <Field label="URL основного потоку">
            <input type="url" value={settings.source_url ?? ''} onChange={e => set('source_url', e.target.value)}
              placeholder="http://icecast:8000/main" className="input" />
          </Field>
          <Field label="URL резервного потоку (якщо основний недоступний)">
            <input type="url" value={settings.backup_source_url ?? ''} onChange={e => set('backup_source_url', e.target.value)}
              placeholder="http://backup:8000/main" className="input" />
          </Field>
          <Field label="Icecast хост">
            <input type="text" value={settings.icecast_host ?? ''} onChange={e => set('icecast_host', e.target.value)}
              placeholder="localhost" className="input" />
          </Field>
          <Field label="Icecast порт">
            <input type="number" value={settings.icecast_port ?? ''} onChange={e => set('icecast_port', e.target.value)}
              placeholder="8000" className="input" />
          </Field>
          <Field label="Source password">
            <input type="password" value={settings.icecast_source_password ?? ''} onChange={e => set('icecast_source_password', e.target.value)}
              placeholder="hackme" className="input" />
          </Field>
          <Field label="Admin password (для ICY metadata)">
            <input type="password" value={settings.icecast_admin_password ?? ''} onChange={e => set('icecast_admin_password', e.target.value)}
              placeholder="hackme" className="input" />
          </Field>
        </Section>

        <Section title="Тональний детектор">
          <Field label="">
            <label className="flex items-center gap-3 cursor-pointer">
              <Toggle value={settings.tone_detection_enabled === 'true'} onChange={v => set('tone_detection_enabled', v ? 'true' : 'false')} />
              <span className="text-sm text-gray-300">Увімкнути тональний детектор</span>
            </label>
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Старт (Hz)">
              <input type="number" value={settings.tone_start_hz ?? ''} onChange={e => set('tone_start_hz', e.target.value)}
                placeholder="17500" className="input" />
            </Field>
            <Field label="Стоп (Hz)">
              <input type="number" value={settings.tone_stop_hz ?? ''} onChange={e => set('tone_stop_hz', e.target.value)}
                placeholder="18500" className="input" />
            </Field>
            <Field label="Тривалість (мс)">
              <input type="number" value={settings.tone_duration_ms ?? ''} onChange={e => set('tone_duration_ms', e.target.value)}
                placeholder="500" className="input" />
            </Field>
          </div>
          <div className="mt-1 p-3 bg-[#ff732e]/8 border border-[#ff732e]/15 rounded-xl">
            <p className="text-xs text-[#ff732e]/70 leading-relaxed">
              Частоти 17 500 та 18 500 Hz вище порогу чутності та не будуть чутні в ефірі при 320 kbps.
            </p>
          </div>
        </Section>

        <Section title="Контроль тиші в ефірі">
          <Field label="">
            <label className="flex items-center gap-3 cursor-pointer">
              <Toggle value={settings.silence_alerts_enabled === 'true'} onChange={v => set('silence_alerts_enabled', v ? 'true' : 'false')} />
              <span className="text-sm text-gray-300">Сповіщати про тишу в джерелі</span>
            </label>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Поріг тиші (dB)">
              <input type="number" value={settings.silence_threshold_db ?? ''} onChange={e => set('silence_threshold_db', e.target.value)}
                placeholder="-50" className="input" />
            </Field>
            <Field label="Тривалість тиші до сповіщення (с)">
              <input type="number" value={settings.silence_duration_sec ?? ''} onChange={e => set('silence_duration_sec', e.target.value)}
                placeholder="10" className="input" />
            </Field>
          </div>
        </Section>

        <Section title="Webhook сповіщення">
          <Field label="URL вебхуку (POST при старті/завершенні реклами)">
            <input type="url" value={settings.webhook_url ?? ''} onChange={e => set('webhook_url', e.target.value)}
              placeholder="https://your-system.com/webhook" className="input" />
          </Field>
          <Field label="Секрет (X-Webhook-Secret header)">
            <input type="text" value={settings.webhook_secret ?? ''} onChange={e => set('webhook_secret', e.target.value)}
              placeholder="optional secret" className="input" />
          </Field>
          <div className="p-3 bg-blue-500/8 border border-blue-500/15 rounded-xl">
            <p className="text-xs text-blue-400/70 leading-relaxed">
              Події: <code className="bg-[#121214] px-1 rounded">ad_start</code>, <code className="bg-[#121214] px-1 rounded">ad_end</code>, <code className="bg-[#121214] px-1 rounded">silence_alert</code>, <code className="bg-[#121214] px-1 rounded">source_switch</code>
            </p>
          </div>
        </Section>

        <button onClick={save} disabled={saving} className="btn-primary w-full py-3 text-base">
          {saving ? 'Збереження...' : saved ? '✓ Збережено' : 'Зберегти налаштування'}
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <div className="text-xs font-semibold text-[#7a7a85] uppercase tracking-wider mb-4 pb-3 border-b border-[#383840]">{title}</div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      {label && <label className="text-xs text-[#7a7a85] mb-1.5 block">{label}</label>}
      {children}
    </div>
  );
}
