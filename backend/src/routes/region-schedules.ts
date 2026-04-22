import { Router } from 'express';
import { pool } from '../db';

const router = Router({ mergeParams: true });

const TIME_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const DAYS_RE = /^[1-7]+$/;

function parseId(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function parseOptionalId(raw: unknown): number | null | undefined {
  if (raw === null || raw === undefined || raw === '') return null;
  return parseId(raw);
}

function validateTime(raw: unknown): string | null {
  if (typeof raw !== 'string' || !TIME_RE.test(raw)) return null;
  return raw;
}

function validateDays(raw: unknown): string | null {
  if (typeof raw !== 'string' || !DAYS_RE.test(raw) || raw.length > 7) return null;
  return [...new Set(raw.split(''))].sort().join('');
}

function validateTolerance(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
  return Number.isInteger(n) && n >= 0 && n <= 1440 ? n : null;
}

async function playlistExists(id: number): Promise<boolean> {
  const r = await pool.query(`SELECT 1 FROM playlists WHERE id=$1`, [id]);
  return r.rowCount === 1;
}

// GET all time-schedules for a region
router.get('/', async (req: any, res) => {
  const regionId = parseId(req.params.id);
  if (!regionId) return res.status(400).json({ error: 'invalid region id' });
  const r = await pool.query(
    `SELECT rs.*,
       p.name  AS playlist_name,
       fp.name AS filler_playlist_name
     FROM region_schedules rs
     LEFT JOIN playlists p  ON p.id  = rs.playlist_id
     LEFT JOIN playlists fp ON fp.id = rs.filler_playlist_id
     WHERE rs.region_id=$1
     ORDER BY rs.time_hhmm`,
    [regionId]
  );
  res.json(r.rows);
});

// POST create
router.post('/', async (req: any, res) => {
  const regionId = parseId(req.params.id);
  if (!regionId) return res.status(400).json({ error: 'invalid region id' });

  const time_hhmm = validateTime(req.body?.time_hhmm);
  if (!time_hhmm) return res.status(400).json({ error: 'time_hhmm must be HH:MM (24h)' });

  const days = validateDays(req.body?.days ?? '1234567');
  if (!days) return res.status(400).json({ error: 'days must be a string of digits 1-7 (e.g. "1234567")' });

  const tolerance_minutes = validateTolerance(req.body?.tolerance_minutes ?? 10);
  if (tolerance_minutes === null) return res.status(400).json({ error: 'tolerance_minutes must be 0-1440' });

  const playlist_id = parseId(req.body?.playlist_id);
  if (!playlist_id) return res.status(400).json({ error: 'playlist_id required' });
  if (!(await playlistExists(playlist_id))) return res.status(400).json({ error: 'playlist_id not found' });

  const filler_playlist_id = parseOptionalId(req.body?.filler_playlist_id);
  if (filler_playlist_id === undefined) return res.status(400).json({ error: 'invalid filler_playlist_id' });
  if (filler_playlist_id !== null && !(await playlistExists(filler_playlist_id))) {
    return res.status(400).json({ error: 'filler_playlist_id not found' });
  }

  const label = typeof req.body?.label === 'string' ? req.body.label.slice(0, 200) : '';
  const is_active = req.body?.is_active === undefined ? true : !!req.body.is_active;

  const r = await pool.query(
    `INSERT INTO region_schedules
       (region_id,label,time_hhmm,tolerance_minutes,playlist_id,filler_playlist_id,days,is_active)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [regionId, label, time_hhmm, tolerance_minutes, playlist_id, filler_playlist_id, days, is_active]
  );
  res.json(r.rows[0]);
});

// PUT update
router.put('/:sid', async (req: any, res) => {
  const regionId = parseId(req.params.id);
  const sid = parseId(req.params.sid);
  if (!regionId || !sid) return res.status(400).json({ error: 'invalid id' });

  const time_hhmm = validateTime(req.body?.time_hhmm);
  if (!time_hhmm) return res.status(400).json({ error: 'time_hhmm must be HH:MM (24h)' });

  const days = validateDays(req.body?.days);
  if (!days) return res.status(400).json({ error: 'days must be a string of digits 1-7' });

  const tolerance_minutes = validateTolerance(req.body?.tolerance_minutes);
  if (tolerance_minutes === null) return res.status(400).json({ error: 'tolerance_minutes must be 0-1440' });

  const playlist_id = parseId(req.body?.playlist_id);
  if (!playlist_id) return res.status(400).json({ error: 'playlist_id required' });
  if (!(await playlistExists(playlist_id))) return res.status(400).json({ error: 'playlist_id not found' });

  const filler_playlist_id = parseOptionalId(req.body?.filler_playlist_id);
  if (filler_playlist_id === undefined) return res.status(400).json({ error: 'invalid filler_playlist_id' });
  if (filler_playlist_id !== null && !(await playlistExists(filler_playlist_id))) {
    return res.status(400).json({ error: 'filler_playlist_id not found' });
  }

  const label = typeof req.body?.label === 'string' ? req.body.label.slice(0, 200) : '';
  const is_active = req.body?.is_active === undefined ? true : !!req.body.is_active;

  const r = await pool.query(
    `UPDATE region_schedules
     SET label=$1, time_hhmm=$2, tolerance_minutes=$3, playlist_id=$4,
         filler_playlist_id=$5, days=$6, is_active=$7
     WHERE id=$8 AND region_id=$9 RETURNING *`,
    [label, time_hhmm, tolerance_minutes, playlist_id, filler_playlist_id, days, is_active, sid, regionId]
  );
  if (!r.rows[0]) return res.status(404).json({ error: 'not found' });
  res.json(r.rows[0]);
});

// DELETE
router.delete('/:sid', async (req: any, res) => {
  const regionId = parseId(req.params.id);
  const sid = parseId(req.params.sid);
  if (!regionId || !sid) return res.status(400).json({ error: 'invalid id' });
  await pool.query(
    `DELETE FROM region_schedules WHERE id=$1 AND region_id=$2`,
    [sid, regionId]
  );
  res.json({ ok: true });
});

export default router;
