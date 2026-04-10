import { Router } from 'express';
import { pool } from '../db';

const router = Router({ mergeParams: true });

// GET all time-schedules for a region
router.get('/', async (req: any, res) => {
  const r = await pool.query(
    `SELECT rs.*,
       p.name  AS playlist_name,
       fp.name AS filler_playlist_name
     FROM region_schedules rs
     LEFT JOIN playlists p  ON p.id  = rs.playlist_id
     LEFT JOIN playlists fp ON fp.id = rs.filler_playlist_id
     WHERE rs.region_id=$1
     ORDER BY rs.time_hhmm`,
    [req.params.id]
  );
  res.json(r.rows);
});

// POST create
router.post('/', async (req: any, res) => {
  const { label = '', time_hhmm, tolerance_minutes = 10, playlist_id,
          filler_playlist_id, days = '1234567', is_active = true } = req.body;
  const r = await pool.query(
    `INSERT INTO region_schedules
       (region_id,label,time_hhmm,tolerance_minutes,playlist_id,filler_playlist_id,days,is_active)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [req.params.id, label, time_hhmm, tolerance_minutes,
     playlist_id, filler_playlist_id || null, days, is_active]
  );
  res.json(r.rows[0]);
});

// PUT update
router.put('/:sid', async (req: any, res) => {
  const { label, time_hhmm, tolerance_minutes, playlist_id,
          filler_playlist_id, days, is_active } = req.body;
  const r = await pool.query(
    `UPDATE region_schedules
     SET label=$1, time_hhmm=$2, tolerance_minutes=$3, playlist_id=$4,
         filler_playlist_id=$5, days=$6, is_active=$7
     WHERE id=$8 AND region_id=$9 RETURNING *`,
    [label, time_hhmm, tolerance_minutes, playlist_id,
     filler_playlist_id || null, days, is_active,
     req.params.sid, req.params.id]
  );
  res.json(r.rows[0]);
});

// DELETE
router.delete('/:sid', async (req: any, res) => {
  await pool.query(
    `DELETE FROM region_schedules WHERE id=$1 AND region_id=$2`,
    [req.params.sid, req.params.id]
  );
  res.json({ ok: true });
});

export default router;
