import { Router } from 'express';
import { pool } from '../db';
import { scheduler } from '../engine/Scheduler';

const router = Router();

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
  const { region_id, playlist_id, days = 'all', times = [] } = req.body;
  const r = await pool.query(
    `INSERT INTO schedules(region_id,playlist_id,days,times) VALUES($1,$2,$3,$4) RETURNING *`,
    [region_id, playlist_id, days, JSON.stringify(times)]
  );
  await scheduler.reload();
  res.json(r.rows[0]);
});

router.put('/:id', async (req, res) => {
  const { region_id, playlist_id, days, times, enabled } = req.body;
  const r = await pool.query(
    `UPDATE schedules SET region_id=$1,playlist_id=$2,days=$3,times=$4,enabled=$5 WHERE id=$6 RETURNING *`,
    [region_id, playlist_id, days, JSON.stringify(times), enabled, req.params.id]
  );
  await scheduler.reload();
  res.json(r.rows[0]);
});

router.delete('/:id', async (req, res) => {
  await pool.query(`DELETE FROM schedules WHERE id=$1`, [req.params.id]);
  await scheduler.reload();
  res.json({ ok: true });
});

export default router;
