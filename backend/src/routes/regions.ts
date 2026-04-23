import { Router } from 'express';
import { pool } from '../db';
import { regionManager } from '../engine/RegionManager';
import { getIO } from '../socket';

const router = Router();

const MOUNT_RE = /^\/[A-Za-z0-9][A-Za-z0-9_-]{0,62}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
const NAME_RE = /^[^\x00-\x1f\x7f]{1,128}$/;

function validateRegionInput(body: any, { partial = false } = {}): string | null {
  if (!body || typeof body !== 'object') return 'body must be an object';
  const { name, slug, icecast_mount } = body;
  if (name !== undefined) {
    if (typeof name !== 'string' || !NAME_RE.test(name)) return 'invalid name';
  } else if (!partial) return 'name required';

  if (slug !== undefined) {
    if (typeof slug !== 'string' || !SLUG_RE.test(slug)) return 'invalid slug (lowercase a-z, 0-9, dash)';
  } else if (!partial) return 'slug required';

  if (icecast_mount !== undefined) {
    if (typeof icecast_mount !== 'string' || !MOUNT_RE.test(icecast_mount)) {
      return 'invalid icecast_mount (must be /[A-Za-z0-9_-]+)';
    }
  } else if (!partial) return 'icecast_mount required';

  return null;
}

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
  const err = validateRegionInput(req.body);
  if (err) return res.status(400).json({ error: err });
  const {
    name, slug, icecast_mount,
    fade_in_sec = 1, fade_in_enabled = true, return_fade_in_sec = 1, crossfade_out_sec = 0,
    loudnorm_enabled = false, loudnorm_target = -18,
    return_mode = 'signal', return_timer_sec = 0,
    enabled = true,
  } = req.body;
  const r = await pool.query(
    `INSERT INTO regions(name,slug,icecast_mount,fade_in_sec,fade_in_enabled,return_fade_in_sec,crossfade_out_sec,
      loudnorm_enabled,loudnorm_target,return_mode,return_timer_sec,enabled)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [name, slug, icecast_mount, fade_in_sec, fade_in_enabled, return_fade_in_sec, crossfade_out_sec,
     loudnorm_enabled, loudnorm_target, return_mode, return_timer_sec, enabled]
  );
  await regionManager.reload();
  // Broadcast the new row so live clients (dashboard, regions list) update
  // their config-derived state (enabled flag, rename) without a page reload.
  getIO()?.emit('region:config', { ...r.rows[0], event: 'created' });
  res.json(r.rows[0]);
});

// PUT update region
router.put('/:id', async (req, res) => {
  const err = validateRegionInput(req.body, { partial: true });
  if (err) return res.status(400).json({ error: err });
  const { id } = req.params;
  const {
    name, slug, icecast_mount,
    fade_in_sec, fade_in_enabled, return_fade_in_sec, crossfade_out_sec,
    loudnorm_enabled, loudnorm_target,
    return_mode, return_timer_sec, enabled,
  } = req.body;
  const r = await pool.query(
    `UPDATE regions SET name=$1,slug=$2,icecast_mount=$3,fade_in_sec=$4,
     fade_in_enabled=$5,return_fade_in_sec=$6,crossfade_out_sec=$7,
     loudnorm_enabled=$8,loudnorm_target=$9,
     return_mode=$10,return_timer_sec=$11,enabled=$12 WHERE id=$13 RETURNING *`,
    [name, slug, icecast_mount, fade_in_sec, fade_in_enabled, return_fade_in_sec, crossfade_out_sec,
     loudnorm_enabled, loudnorm_target, return_mode, return_timer_sec, enabled, id]
  );
  if (!r.rows[0]) return res.status(404).json({ error: 'Region not found' });
  await regionManager.reload();
  getIO()?.emit('region:config', { ...r.rows[0], event: 'updated' });
  res.json(r.rows[0]);
});

// DELETE region
router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });
  const force = req.query.force === '1';

  const rp = regionManager.getAll().find(r => r.state.id === id);
  if (rp && rp.state.mode !== 'stopped' && !force) {
    return res.status(409).json({ error: 'region is active — stop it first or use ?force=1' });
  }

  try {
    await regionManager.stopRegion(id);
  } catch (e: any) {
    console.warn(`[regions] stopRegion(${id}) during delete failed: ${e?.message || e}`);
    if (!force) return res.status(500).json({ error: `stop failed: ${e?.message || e}` });
  }
  await pool.query(`DELETE FROM regions WHERE id=$1`, [id]);
  await regionManager.reload();
  getIO()?.emit('region:config', { id, event: 'deleted' });
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
    `SELECT al.*, p.name as playlist_name FROM ad_logs al
     LEFT JOIN playlists p ON p.id=al.playlist_id
     WHERE al.region_id=$1 ORDER BY al.start_time DESC LIMIT 100`,
    [req.params.id]
  );
  res.json(r.rows);
});

export default router;
