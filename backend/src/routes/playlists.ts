import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { pool } from '../db';
import { getAudioDurationInSeconds } from 'get-audio-duration';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const playlistId = req.params.id;
    const dir = path.join(UPLOADS_DIR, playlistId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const decoded = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const safe = decoded.replace(/[/\\:*?"<>|]/g, '_');
    cb(null, safe);
  },
});
const upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } });

const router = Router();

// GET all playlists
router.get('/', async (req, res) => {
  const { region_id } = req.query;
  const r = region_id
    ? await pool.query(
        `SELECT p.*, COUNT(pi.id) as item_count
         FROM playlists p LEFT JOIN playlist_items pi ON pi.playlist_id=p.id
         WHERE p.region_id=$1 GROUP BY p.id ORDER BY p.id`,
        [region_id]
      )
    : await pool.query(`
        SELECT p.*, COUNT(pi.id) as item_count
        FROM playlists p LEFT JOIN playlist_items pi ON pi.playlist_id=p.id
        GROUP BY p.id ORDER BY p.id
      `);
  res.json(r.rows);
});

// GET playlist + items
router.get('/:id', async (req, res) => {
  const p = await pool.query(`SELECT * FROM playlists WHERE id=$1`, [req.params.id]);
  if (!p.rows[0]) return res.status(404).json({ error: 'Not found' });
  const items = await pool.query(
    `SELECT * FROM playlist_items WHERE playlist_id=$1 ORDER BY position ASC, id ASC`,
    [req.params.id]
  );
  res.json({ ...p.rows[0], items: items.rows });
});

// POST create playlist
router.post('/', async (req, res) => {
  const {
    name, type = 'ad', shuffle = false, region_id,
    start_date, end_date, max_plays_per_day = 0, max_plays_per_week = 0,
  } = req.body;
  const r = await pool.query(
    `INSERT INTO playlists(name,type,shuffle,region_id,start_date,end_date,max_plays_per_day,max_plays_per_week)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [name, type, shuffle, region_id || null,
     start_date || null, end_date || null, max_plays_per_day, max_plays_per_week]
  );
  res.json(r.rows[0]);
});

// PUT update playlist
router.put('/:id', async (req, res) => {
  const { name, type, shuffle, start_date, end_date, max_plays_per_day, max_plays_per_week } = req.body;
  const r = await pool.query(
    `UPDATE playlists SET name=$1,type=$2,shuffle=$3,
     start_date=$4,end_date=$5,max_plays_per_day=$6,max_plays_per_week=$7
     WHERE id=$8 RETURNING *`,
    [name, type, shuffle, start_date || null, end_date || null,
     max_plays_per_day ?? 0, max_plays_per_week ?? 0, req.params.id]
  );
  res.json(r.rows[0]);
});

// DELETE playlist
router.delete('/:id', async (req, res) => {
  // Prevent deleting a playlist that is currently playing
  const active = await pool.query(
    `SELECT 1 FROM ad_logs WHERE playlist_id=$1 AND end_time IS NULL LIMIT 1`,
    [req.params.id]
  );
  if (active.rows.length > 0) {
    return res.status(409).json({ error: 'Playlist is currently playing — stop playback first' });
  }

  const dir = path.join(UPLOADS_DIR, req.params.id);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
  await pool.query(`DELETE FROM playlists WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

// POST upload file
router.post('/:id/upload', upload.array('files'), async (req, res) => {
  const playlistId = parseInt(req.params.id);
  const files = req.files as Express.Multer.File[];
  const added = [];

  for (const file of files) {
    let duration = 0;
    try { duration = await getAudioDurationInSeconds(file.path); } catch {}

    const pos = await pool.query(
      `SELECT COALESCE(MAX(position),0)+1 as next FROM playlist_items WHERE playlist_id=$1`,
      [playlistId]
    );
    const displayName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const r = await pool.query(
      `INSERT INTO playlist_items(playlist_id,filename,filepath,duration_sec,position)
       VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [playlistId, displayName, file.path, duration, pos.rows[0].next]
    );
    added.push(r.rows[0]);
  }
  res.json(added);
});

// PUT update item (weight)
router.put('/:id/items/:itemId', async (req, res) => {
  const { weight } = req.body;
  const r = await pool.query(
    `UPDATE playlist_items SET weight=$1 WHERE id=$2 AND playlist_id=$3 RETURNING *`,
    [Math.max(1, parseInt(weight) || 1), req.params.itemId, req.params.id]
  );
  res.json(r.rows[0]);
});

// DELETE item
router.delete('/:id/items/:itemId', async (req, res) => {
  const item = await pool.query(`SELECT * FROM playlist_items WHERE id=$1`, [req.params.itemId]);
  if (item.rows[0]) {
    try { fs.unlinkSync(item.rows[0].filepath); } catch {}
    await pool.query(`DELETE FROM playlist_items WHERE id=$1`, [req.params.itemId]);
  }
  res.json({ ok: true });
});

// PUT reorder items
router.put('/:id/items', async (req, res) => {
  const { order } = req.body;
  for (let i = 0; i < order.length; i++) {
    await pool.query(`UPDATE playlist_items SET position=$1 WHERE id=$2`, [i + 1, order[i]]);
  }
  res.json({ ok: true });
});

export default router;
