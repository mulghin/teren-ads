import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getAllSettings, getSetting, setSetting } from '../db';
import { toneDetector } from '../engine/ToneDetector';
import { silenceWatchdog } from '../engine/SilenceWatchdog';
import { regionManager } from '../engine/RegionManager';
import { sendTelegramTest } from '../engine/TelegramNotifier';
import { icyHealth } from '../engine/IcyMetadata';

const router = Router();

type ValidatorResult = { ok: true; value: string } | { ok: false; error: string };
type Validator = (raw: unknown) => ValidatorResult;

const httpUrl: Validator = (raw) => {
  if (typeof raw !== 'string') return { ok: false, error: 'must be a string' };
  const s = raw.trim();
  if (!s) return { ok: true, value: '' };
  if (/[\x00-\x1f\x7f]/.test(s)) return { ok: false, error: 'control chars not allowed' };
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return { ok: false, error: 'only http/https allowed' };
    }
    if (!u.hostname) return { ok: false, error: 'missing host' };
    return { ok: true, value: u.toString() };
  } catch {
    return { ok: false, error: 'invalid URL' };
  }
};

const hostname: Validator = (raw) => {
  if (typeof raw !== 'string') return { ok: false, error: 'must be a string' };
  let s = raw.trim();
  // Be forgiving: if the operator pastes a full URL (http(s)://host[:port][/path]),
  // pull the bare hostname out. The field is built around Icecast's host+port
  // pair, not a full URL, and rejecting a pasted URL just slows them down.
  if (/^https?:\/\//i.test(s)) {
    try { s = new URL(s).hostname; } catch { /* fall through to regex error */ }
  }
  if (!/^[A-Za-z0-9._-]{1,253}$/.test(s)) return { ok: false, error: 'invalid hostname' };
  return { ok: true, value: s };
};

const intInRange = (min: number, max: number): Validator => (raw) => {
  const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < min || n > max) {
    return { ok: false, error: `must be integer in [${min}, ${max}]` };
  }
  return { ok: true, value: String(Math.trunc(n)) };
};

const floatInRange = (min: number, max: number): Validator => (raw) => {
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
  if (!Number.isFinite(n) || n < min || n > max) {
    return { ok: false, error: `must be number in [${min}, ${max}]` };
  }
  return { ok: true, value: String(n) };
};

const bool: Validator = (raw) => {
  if (raw === true || raw === 'true' || raw === '1' || raw === 1) return { ok: true, value: 'true' };
  if (raw === false || raw === 'false' || raw === '0' || raw === 0 || raw === '') return { ok: true, value: 'false' };
  return { ok: false, error: 'must be boolean' };
};

const password: Validator = (raw) => {
  if (typeof raw !== 'string') return { ok: false, error: 'must be a string' };
  if (raw.length > 256) return { ok: false, error: 'too long' };
  if (/[\x00-\x1f\x7f]/.test(raw)) return { ok: false, error: 'control chars not allowed' };
  return { ok: true, value: raw };
};

// ICY header strings: single-line, no control chars, reasonable upper bound.
// Icecast ship these verbatim in stream metadata, so we reject anything that
// could confuse clients or log readers.
const icyString = (max: number): Validator => (raw) => {
  if (typeof raw !== 'string') return { ok: false, error: 'must be a string' };
  const s = raw.trim();
  if (s.length > max) return { ok: false, error: `too long (max ${max})` };
  if (/[\x00-\x1f\x7f]/.test(s)) return { ok: false, error: 'control chars not allowed' };
  return { ok: true, value: s };
};

const tgBotToken: Validator = (raw) => {
  if (typeof raw !== 'string') return { ok: false, error: 'must be a string' };
  const s = raw.trim();
  if (!s) return { ok: true, value: '' };
  if (!/^[0-9]+:[A-Za-z0-9_-]{20,}$/.test(s)) return { ok: false, error: 'invalid bot token format' };
  return { ok: true, value: s };
};

const tgChatId: Validator = (raw) => {
  if (typeof raw !== 'string' && typeof raw !== 'number') return { ok: false, error: 'must be string or number' };
  const s = String(raw).trim();
  if (!s) return { ok: true, value: '' };
  if (!/^-?[0-9]+$/.test(s)) return { ok: false, error: 'must be numeric (may start with -)' };
  return { ok: true, value: s };
};

const SETTING_VALIDATORS: Record<string, Validator> = {
  source_url: httpUrl,
  backup_source_url: httpUrl,
  webhook_url: httpUrl,
  icecast_host: hostname,
  icecast_port: intInRange(1, 65535),
  icecast_source_password: password,
  icecast_admin_password: password,
  stream_name: icyString(100),
  stream_description: icyString(256),
  webhook_secret: password,
  tone_start_hz: intInRange(1000, 22000),
  tone_stop_hz: intInRange(1000, 22000),
  tone_duration_ms: intInRange(50, 10000),
  tone_detection_enabled: bool,
  default_crossfade_sec: floatInRange(0, 30),
  silence_threshold_db: floatInRange(-120, 0),
  silence_duration_sec: floatInRange(0, 3600),
  silence_alerts_enabled: bool,
  telegram_enabled: bool,
  telegram_bot_token: tgBotToken,
  telegram_chat_id: tgChatId,
  telegram_notify_ad_start: bool,
  telegram_notify_ad_end: bool,
  telegram_notify_silence_alert: bool,
  telegram_notify_source_switch: bool,
};

const ALLOWED_SETTINGS = Object.keys(SETTING_VALIDATORS);

const SENSITIVE_KEYS = new Set(['icecast_source_password', 'icecast_admin_password', 'webhook_secret', 'telegram_bot_token']);
// Unguessable sentinel: prefix + UUID. Frontend round-trips the exact string
// when a secret field isn't edited; PUT recognises the prefix and skips.
// Matching by prefix (not exact string) means a post-restart FE cache still works.
const MASK_PREFIX = '__secret_unchanged_';
const MASK = `${MASK_PREFIX}${randomUUID()}__`;
const isMaskedSentinel = (v: unknown) => typeof v === 'string' && v.startsWith(MASK_PREFIX);
const TONE_KEYS = new Set(['tone_start_hz', 'tone_stop_hz', 'tone_duration_ms', 'tone_detection_enabled', 'source_url']);

router.get('/', async (req, res) => {
  const all = await getAllSettings();
  for (const key of SENSITIVE_KEYS) {
    if (all[key]) all[key] = MASK;
  }
  res.json(all);
});

router.put('/', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'body must be an object' });
  }

  const prevSourceUrl = await getSetting('source_url');
  const errors: Record<string, string> = {};
  const toWrite: Array<[string, string]> = [];

  for (const key of ALLOWED_SETTINGS) {
    if (!(key in body)) continue;
    const raw = body[key];
    if (SENSITIVE_KEYS.has(key) && isMaskedSentinel(raw)) continue;

    const r = SETTING_VALIDATORS[key](raw);
    if (!r.ok) {
      errors[key] = r.error;
    } else {
      toWrite.push([key, r.value]);
    }
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ error: 'invalid settings', details: errors });
  }

  const changedKeys = new Set<string>();
  for (const [k, v] of toWrite) {
    await setSetting(k, v);
    changedKeys.add(k);
  }

  const toneChanged = [...changedKeys].some(k => TONE_KEYS.has(k));
  if (toneChanged) await toneDetector.restart();

  if (changedKeys.has('silence_alerts_enabled') || changedKeys.has('silence_threshold_db') ||
      changedKeys.has('silence_duration_sec') || changedKeys.has('source_url')) {
    await silenceWatchdog.restart();
  }

  if (changedKeys.has('source_url')) {
    const newUrl = toWrite.find(([k]) => k === 'source_url')?.[1];
    if (newUrl !== prevSourceUrl) {
      for (const rp of regionManager.getAll()) {
        if (rp.state.mode === 'main') {
          rp.startMain().catch(e => console.error('[settings] restartMain failed:', e));
        }
      }
    }
  }

  // ICE header text only takes effect on a fresh SOURCE handshake — restart
  // the relay for every live region so Icecast picks up the new name/desc.
  if (changedKeys.has('stream_name') || changedKeys.has('stream_description')) {
    for (const rp of regionManager.getAll()) {
      if (rp.state.mode === 'main') {
        rp.startMain().catch(e => console.error('[settings] restartMain (ice-name) failed:', e));
      }
    }
  }

  res.json({ ok: true });
});

// Lightweight probe so the Settings UI can surface a red banner when the
// admin password is wrong. Only reports the last attempt — consumers decide
// whether to show it based on status (401/403 matter; 0/timeout is ambiguous).
router.get('/icy-health', (req, res) => {
  res.json({
    lastTriedAt: icyHealth.lastTriedAt,
    lastSuccessAt: icyHealth.lastSuccessAt,
    lastStatus: icyHealth.lastStatus,
    lastError: icyHealth.lastError,
  });
});

router.post('/telegram/test', async (req, res) => {
  const result = await sendTelegramTest();
  if (result.ok) return res.json({ ok: true });
  res.status(400).json({ ok: false, error: result.error });
});

export default router;
