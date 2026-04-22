import { Router } from 'express';
import { pool } from '../db';
import { scheduler } from '../engine/Scheduler';

const router = Router();

const DAY_TOKEN_RE = /^(sun|mon|tue|wed|thu|fri|sat|[0-6])$/i;
const TIME_RE = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;

function normalizeTimes(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const t of raw) {
    if (typeof t !== 'string' || !TIME_RE.test(t)) return null;
    const [h, m] = t.split(':');
    out.push(`${h.padStart(2, '0')}:${m}`);
  }
  return out;
}

function normalizeDays(raw: unknown): string | null {
  if (raw === 'all' || raw === undefined) return 'all';
  if (typeof raw !== 'string') return null;
  const tokens = raw.split(',').map(s => s.trim()).filter(Boolean);
  if (!tokens.length) return null;
  if (!tokens.every(t => DAY_TOKEN_RE.test(t))) return null;
  return tokens.map(t => t.toLowerCase()).join(',');
}

function parseId(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

router.get('/', async (req, res) => {
  const r = await pool.query(`
    SELECT s.*, p.name as playlist_name, r.name as region_name
    FROM schedules s
    LEFT JOIN playlists p ON p.id=s.playlist_id
    LEFT JOIN regions r ON r.id=s.region_id
    ORDER BY s.id
  `);
  res.json(r.rows);
});

router.post('/', async (req, res) => {
  const region_id = parseId(req.body?.region_id);
  const playlist_id = parseId(req.body?.playlist_id);
  if (!region_id || !playlist_id) return res.status(400).json({ error: 'region_id and playlist_id required' });

  const days = normalizeDays(req.body?.days ?? 'all');
  if (days === null) return res.status(400).json({ error: 'invalid days' });

  const times = normalizeTimes(req.body?.times ?? []);
  if (times === null) return res.status(400).json({ error: 'times must be array of HH:MM' });

  const r = await pool.query(
    `INSERT INTO schedules(region_id,playlist_id,days,times) VALUES($1,$2,$3,$4) RETURNING *`,
    [region_id, playlist_id, days, JSON.stringify(times)]
  );
  await scheduler.reload();
  res.json(r.rows[0]);
});

router.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'invalid id' });

  const region_id = parseId(req.body?.region_id);
  const playlist_id = parseId(req.body?.playlist_id);
  if (!region_id || !playlist_id) return res.status(400).json({ error: 'region_id and playlist_id required' });

  const days = normalizeDays(req.body?.days);
  if (days === null) return res.status(400).json({ error: 'invalid days' });

  const times = normalizeTimes(req.body?.times);
  if (times === null) return res.status(400).json({ error: 'times must be array of HH:MM' });

  const enabled = req.body?.enabled === undefined ? true : !!req.body.enabled;

  const r = await pool.query(
    `UPDATE schedules SET region_id=$1,playlist_id=$2,days=$3,times=$4,enabled=$5 WHERE id=$6 RETURNING *`,
    [region_id, playlist_id, days, JSON.stringify(times), enabled, id]
  );
  if (!r.rows[0]) return res.status(404).json({ error: 'not found' });
  await scheduler.reload();
  res.json(r.rows[0]);
});

router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'invalid id' });
  await pool.query(`DELETE FROM schedules WHERE id=$1`, [id]);
  await scheduler.reload();
  res.json({ ok: true });
});

export default router;
