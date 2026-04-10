import { Router } from 'express';
import { getAllSettings, getSetting, setSetting } from '../db';
import { toneDetector } from '../engine/ToneDetector';
import { regionManager } from '../engine/RegionManager';

const router = Router();

router.get('/', async (req, res) => {
  res.json(await getAllSettings());
});

router.put('/', async (req, res) => {
  const body = req.body as Record<string, string>;
  const ALLOWED = [
    'source_url', 'icecast_host', 'icecast_port', 'icecast_source_password',
    'tone_start_hz', 'tone_stop_hz', 'tone_duration_ms',
    'tone_detection_enabled', 'default_crossfade_sec',
  ];

  const prevSourceUrl = await getSetting('source_url');

  for (const key of ALLOWED) {
    if (body[key] !== undefined) await setSetting(key, body[key]);
  }

  // Restart tone detector with new settings
  await toneDetector.restart();

  // If source URL changed — restart all 'main' regions with new URL
  if (body.source_url !== undefined && body.source_url !== prevSourceUrl) {
    regionManager.restartMainRegions();
  }

  res.json({ ok: true });
});

export default router;
