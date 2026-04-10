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
    // multer passes originalname as latin1 — decode to UTF-8 first
    const decoded = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const safe = decoded.replace(/[/\\:*?"<>|]/g, '_');
    cb(null, safe);
  },
});
const upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } });

const router = Router();

// GET all playlists (optionally filtered by region_id)
router.get('/', async (req, res) => {
  const { region_id } = req.query;
  const r = region_id
    ? await pool.query(
        `SELECT p.*, COUNT(pi.id) as item_count
         FROM playlists p
         LEFT JOIN playlist_items pi ON pi.playlist_id=p.id
         WHERE p.region_id=$1
         GROUP BY p.id ORDER BY p.id`,
        [region_id]
      )
    : await pool.query(`
        SELECT p.*, COUNT(pi.id) as item_count
        FROM playlists p
        LEFT JOIN playlist_items pi ON pi.playlist_id=p.id
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
  const { name, type = 'ad', shuffle = false, region_id } = req.body;
  const r = await pool.query(
    `INSERT INTO playlists(name,type,shuffle,region_id) VALUES($1,$2,$3,$4) RETURNING *`,
    [name, type, shuffle, region_id || null]
  );
  res.json(r.rows[0]);
});

// PUT update playlist
router.put('/:id', async (req, res) => {
  const { name, type, shuffle } = req.body;
  const r = await pool.query(
    `UPDATE playlists SET name=$1,type=$2,shuffle=$3 WHERE id=$4 RETURNING *`,
    [name, type, shuffle, req.params.id]
  );
  res.json(r.rows[0]);
});

// DELETE playlist
router.delete('/:id', async (req, res) => {
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
    try {
      duration = await getAudioDurationInSeconds(file.path);
    } catch {}

    const pos = await pool.query(
      `SELECT COALESCE(MAX(position),0)+1 as next FROM playlist_items WHERE playlist_id=$1`,
      [playlistId]
    );

    // Decode filename from latin1 to UTF-8 (multer default encoding)
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
  const { order } = req.body; // array of ids in new order
  for (let i = 0; i < order.length; i++) {
    await pool.query(`UPDATE playlist_items SET position=$1 WHERE id=$2`, [i + 1, order[i]]);
  }
  res.json({ ok: true });
});

export default router;
