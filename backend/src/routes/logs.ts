import { Router } from 'express';
import { pool } from '../db';

const router = Router();

router.get('/', async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 200;
  const r = await pool.query(`
    SELECT l.*, r.name as region_name, p.name as playlist_name
    FROM ad_logs l
    LEFT JOIN regions r ON r.id=l.region_id
    LEFT JOIN playlists p ON p.id=l.playlist_id
    ORDER BY l.start_time DESC LIMIT $1
  `, [limit]);
  res.json(r.rows);
});

router.get('/system', async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 200;
  const r = await pool.query(
    `SELECT * FROM system_logs ORDER BY ts DESC LIMIT $1`,
    [limit]
  );
  res.json(r.rows);
});

export default router;
