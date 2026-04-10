import { Router } from 'express';
import { pool } from '../db';
import { regionManager } from '../engine/RegionManager';
import { getIO } from '../socket';

const router = Router();

// GET all regions with live status
router.get('/', async (req, res) => {
  const dbRows = await pool.query(`SELECT * FROM regions ORDER BY id`);
  const liveStatus = regionManager.getStatus();
  const statusMap = new Map(liveStatus.map(s => [s.id, s]));

  const regions = dbRows.rows.map(r => ({
    ...r,
    live: statusMap.get(r.id) || null,
  }));
  res.json(regions);
});

// GET single region
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const r = await pool.query(`SELECT * FROM regions WHERE id=$1`, [id]);
  if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });

  const assign = await pool.query(
    `SELECT ra.*, p.name as playlist_name, fp.name as filler_name
     FROM region_assignments ra
     LEFT JOIN playlists p ON p.id=ra.playlist_id
     LEFT JOIN playlists fp ON fp.id=ra.filler_playlist_id
     WHERE ra.region_id=$1`,
    [id]
  );
  res.json({ ...r.rows[0], assignments: assign.rows });
});

// POST create region
router.post('/', async (req, res) => {
  const { name, slug, icecast_mount, crossfade_sec = 3, return_mode = 'signal', return_timer_sec = 0 } = req.body;
  const r = await pool.query(
    `INSERT INTO regions(name,slug,icecast_mount,crossfade_sec,return_mode,return_timer_sec)
     VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
    [name, slug, icecast_mount, crossfade_sec, return_mode, return_timer_sec]
  );
  await regionManager.reload();
  res.json(r.rows[0]);
});

// PUT update region
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, slug, icecast_mount, crossfade_sec, return_mode, return_timer_sec, enabled } = req.body;
  const r = await pool.query(
    `UPDATE regions SET name=$1,slug=$2,icecast_mount=$3,crossfade_sec=$4,
     return_mode=$5,return_timer_sec=$6,enabled=$7 WHERE id=$8 RETURNING *`,
    [name, slug, icecast_mount, crossfade_sec, return_mode, return_timer_sec, enabled, id]
  );
  await regionManager.reload();
  res.json(r.rows[0]);
});

// DELETE region
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  await regionManager.stopRegion(parseInt(id));
  await pool.query(`DELETE FROM regions WHERE id=$1`, [id]);
  await regionManager.reload();
  res.json({ ok: true });
});

// POST trigger ad
router.post('/:id/trigger', async (req, res) => {
  const { id } = req.params;
  const { playlist_id, filler_playlist_id } = req.body;
  if (!playlist_id) return res.status(400).json({ error: 'playlist_id required' });

  await regionManager.triggerAd(parseInt(id), playlist_id, 'api', filler_playlist_id);
  res.json({ ok: true });
});

// POST return to main
router.post('/:id/return', async (req, res) => {
  const { id } = req.params;
  await regionManager.triggerReturn(parseInt(id));
  res.json({ ok: true });
});

// POST start main
router.post('/:id/start', async (req, res) => {
  const { id } = req.params;
  await regionManager.startMain(parseInt(id));
  res.json({ ok: true });
});

// POST stop
router.post('/:id/stop', async (req, res) => {
  const { id } = req.params;
  await regionManager.stopRegion(parseInt(id));
  res.json({ ok: true });
});

// Region assignments
router.get('/:id/assignments', async (req, res) => {
  const res2 = await pool.query(
    `SELECT ra.*, p.name as playlist_name, fp.name as filler_name
     FROM region_assignments ra
     LEFT JOIN playlists p ON p.id=ra.playlist_id
     LEFT JOIN playlists fp ON fp.id=ra.filler_playlist_id
     WHERE ra.region_id=$1 ORDER BY ra.priority DESC`,
    [req.params.id]
  );
  res.json(res2.rows);
});

router.post('/:id/assignments', async (req, res) => {
  const { playlist_id, filler_playlist_id, priority = 0 } = req.body;
  const r = await pool.query(
    `INSERT INTO region_assignments(region_id,playlist_id,filler_playlist_id,priority)
     VALUES($1,$2,$3,$4) RETURNING *`,
    [req.params.id, playlist_id, filler_playlist_id || null, priority]
  );
  res.json(r.rows[0]);
});

router.delete('/:id/assignments/:aid', async (req, res) => {
  await pool.query(`DELETE FROM region_assignments WHERE id=$1 AND region_id=$2`, [req.params.aid, req.params.id]);
  res.json({ ok: true });
});

// Logs
router.get('/:id/logs', async (req, res) => {
  const r = await pool.query(
    `SELECT * FROM ad_logs WHERE region_id=$1 ORDER BY start_time DESC LIMIT 100`,
    [req.params.id]
  );
  res.json(r.rows);
});

export default router;
