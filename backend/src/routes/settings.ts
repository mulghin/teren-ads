import { Router } from 'express';
import { getAllSettings, getSetting, setSetting } from '../db';
import { toneDetector } from '../engine/ToneDetector';
import { silenceWatchdog } from '../engine/SilenceWatchdog';
import { regionManager } from '../engine/RegionManager';

const router = Router();

const ALLOWED_SETTINGS = [
  'source_url', 'backup_source_url',
  'icecast_host', 'icecast_port', 'icecast_source_password', 'icecast_admin_password',
  'tone_start_hz', 'tone_stop_hz', 'tone_duration_ms', 'tone_detection_enabled',
  'default_crossfade_sec',
  'silence_threshold_db', 'silence_duration_sec', 'silence_alerts_enabled',
  'webhook_url', 'webhook_secret',
];

router.get('/', async (req, res) => {
  res.json(await getAllSettings());
});

router.put('/', async (req, res) => {
  const body = req.body as Record<string, string>;
  const prevSourceUrl = await getSetting('source_url');

  for (const key of ALLOWED_SETTINGS) {
    if (body[key] !== undefined) await setSetting(key, body[key]);
  }

  await toneDetector.restart();

  if (body.silence_alerts_enabled !== undefined || body.silence_threshold_db !== undefined ||
      body.silence_duration_sec !== undefined || body.source_url !== undefined) {
    await silenceWatchdog.restart();
  }

  if (body.source_url !== undefined && body.source_url !== prevSourceUrl) {
    for (const rp of regionManager.getAll()) {
      if (rp.state.mode === 'main') {
        rp.startMain().catch(e => console.error('[settings] restartMain failed:', e));
      }
    }
  }

  res.json({ ok: true });
});

export default router;
