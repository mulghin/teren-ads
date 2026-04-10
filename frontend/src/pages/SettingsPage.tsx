import { useEffect, useState } from 'react';
import { api } from '../api';

const mainFields = [
  { key: 'source_url',              label: 'URL основного потоку',           placeholder: 'http://icecast:8000/main', type: 'url' },
  { key: 'icecast_host',            label: 'Icecast хост (виходи регіонів)', placeholder: 'localhost',                type: 'text' },
  { key: 'icecast_port',            label: 'Icecast порт',                   placeholder: '8000',                    type: 'number' },
  { key: 'icecast_source_password', label: 'Source password',                placeholder: 'hackme',                  type: 'password' },
  { key: 'default_crossfade_sec',   label: 'Crossfade за замовчуванням (с)', placeholder: '3',                       type: 'number' },
];

const toneFields = [
  { key: 'tone_start_hz',   label: 'Частота сигналу ПОЧАТОК (Hz)',  placeholder: '17500', type: 'number' },
  { key: 'tone_stop_hz',    label: 'Частота сигналу КІНЕЦЬ (Hz)',   placeholder: '18500', type: 'number' },
  { key: 'tone_duration_ms',label: 'Тривалість сигналу (мс)',       placeholder: '500',   type: 'number' },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { api.getSettings().then(setSettings); }, []);

  const set = (k: string, v: string) => setSettings(p => ({ ...p, [k]: v }));

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
        {/* Main stream */}
        <Section title="Потік та Icecast">
          {mainFields.map(field => (
            <Field key={field.key} label={field.label}>
              <input
                type={field.type}
                value={settings[field.key] ?? ''}
                onChange={e => set(field.key, e.target.value)}
                placeholder={field.placeholder}
                className="input"
              />
            </Field>
          ))}
        </Section>

        {/* Tone detector */}
        <Section title="Тональний детектор">
          <Field label="">
            <label className="flex items-center gap-3 cursor-pointer"
              onClick={() => set('tone_detection_enabled', settings['tone_detection_enabled'] === 'true' ? 'false' : 'true')}>
              <div className={`w-9 h-5 rounded-full transition-colors relative ${settings['tone_detection_enabled'] === 'true' ? 'bg-[#f5a623]' : 'bg-[#1a1a30]'}`}>
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${settings['tone_detection_enabled'] === 'true' ? 'left-4' : 'left-0.5'}`} />
              </div>
              <span className="text-sm text-gray-300">Увімкнути тональний детектор</span>
            </label>
          </Field>
          {toneFields.map(field => (
            <Field key={field.key} label={field.label}>
              <input
                type={field.type}
                value={settings[field.key] ?? ''}
                onChange={e => set(field.key, e.target.value)}
                placeholder={field.placeholder}
                className="input"
              />
            </Field>
          ))}
          <div className="mt-1 p-3 bg-[#f5a623]/8 border border-[#f5a623]/15 rounded-xl">
            <p className="text-xs text-[#f5a623]/70 leading-relaxed">
              Частоти 17 500 та 18 500 Hz знаходяться вище порогу чутності та не будуть чутні в ефірі при бітрейті 320 kbps.
              Сигнал вбудовується у вихідний потік студійного ПЗ.
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
      <div className="text-xs font-semibold text-[#4a4a7a] uppercase tracking-wider mb-4 pb-3 border-b border-[#1a1a30]">
        {title}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      {label && <label className="text-xs text-[#5a5a8a] mb-1.5 block">{label}</label>}
      {children}
    </div>
  );
}
