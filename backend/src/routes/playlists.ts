import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { pool } from '../db';
import { getAudioDurationInSeconds } from 'get-audio-duration';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function parsePlaylistId(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0 || n > 2_147_483_647) return null;
  return n;
}

function parseItemId(raw: string | undefined): number | null {
  return parsePlaylistId(raw);
}

function sanitizeUploadFilename(originalname: string): string | null {
  const decoded = Buffer.from(originalname, 'latin1').toString('utf8').normalize('NFC');
  const base = path.basename(decoded).replace(/\x00/g, '');
  const ext = path.extname(base).toLowerCase();
  const stem = path.basename(base, path.extname(base));
  const safeStem = stem.replace(/[^\p{L}\p{N} ._-]/gu, '_').trim();
  if (!safeStem || safeStem === '.' || safeStem === '..') return null;
  const safeExt = /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : '';
  const combined = `${safeStem}${safeExt}`.slice(0, 200);
  if (!combined || combined.startsWith('.')) return null;
  return combined;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const pid = parsePlaylistId(req.params.id);
    if (pid === null) return cb(new Error('invalid playlist id'), '');
    const dir = path.join(UPLOADS_DIR, String(pid));
    const resolved = path.resolve(dir);
    if (!resolved.startsWith(path.resolve(UPLOADS_DIR) + path.sep)) {
      return cb(new Error('path traversal blocked'), '');
    }
    fs.mkdirSync(resolved, { recursive: true });
    cb(null, resolved);
  },
  filename: (req, file, cb) => {
    const safe = sanitizeUploadFilename(file.originalname);
    if (!safe) return cb(new Error('invalid filename'), '');
    cb(null, safe);
  },
});
const upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024, files: 50 } });

const router = Router();

async function playlistExists(id: number): Promise<boolean> {
  const r = await pool.query(`SELECT 1 FROM playlists WHERE id=$1`, [id]);
  return r.rowCount ? r.rowCount > 0 : false;
}

async function requirePlaylistId(req: Request, res: Response): Promise<number | null> {
  const pid = parsePlaylistId(req.params.id);
  if (pid === null) { res.status(400).json({ error: 'invalid playlist id' }); return null; }
  if (!(await playlistExists(pid))) { res.status(404).json({ error: 'playlist not found' }); return null; }
  return pid;
}

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
  const pid = parsePlaylistId(req.params.id);
  if (pid === null) return res.status(400).json({ error: 'invalid playlist id' });
  const p = await pool.query(`SELECT * FROM playlists WHERE id=$1`, [pid]);
  if (!p.rows[0]) return res.status(404).json({ error: 'Not found' });
  const items = await pool.query(
    `SELECT * FROM playlist_items WHERE playlist_id=$1 ORDER BY position ASC, id ASC`,
    [pid]
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
  const pid = await requirePlaylistId(req, res); if (pid === null) return;
  const { name, type, shuffle, start_date, end_date, max_plays_per_day, max_plays_per_week } = req.body;
  const r = await pool.query(
    `UPDATE playlists SET name=$1,type=$2,shuffle=$3,
     start_date=$4,end_date=$5,max_plays_per_day=$6,max_plays_per_week=$7
     WHERE id=$8 RETURNING *`,
    [name, type, shuffle, start_date || null, end_date || null,
     max_plays_per_day ?? 0, max_plays_per_week ?? 0, pid]
  );
  res.json(r.rows[0]);
});

// DELETE playlist — DB row first (FK-safe), then files
router.delete('/:id', async (req, res) => {
  const pid = await requirePlaylistId(req, res); if (pid === null) return;

  const active = await pool.query(
    `SELECT 1 FROM ad_logs WHERE playlist_id=$1 AND end_time IS NULL LIMIT 1`,
    [pid]
  );
  if (active.rows.length > 0) {
    return res.status(409).json({ error: 'Playlist is currently playing — stop playback first' });
  }

  try {
    await pool.query(`DELETE FROM playlists WHERE id=$1`, [pid]);
  } catch (e: any) {
    console.error('[playlists/delete]', pid, e);
    return res.status(409).json({ error: 'cannot delete playlist (references in use)' });
  }

  const dir = path.join(UPLOADS_DIR, String(pid));
  const resolved = path.resolve(dir);
  if (resolved.startsWith(path.resolve(UPLOADS_DIR) + path.sep) && fs.existsSync(resolved)) {
    try { fs.rmSync(resolved, { recursive: true }); } catch (e) { console.warn('[playlists] rm failed:', e); }
  }
  res.json({ ok: true });
});

// Guard uploads before multer parses the body so we never write disk for
// a non-existent or traversal-targeted playlist id.
async function gateUpload(req: Request, res: Response, next: NextFunction) {
  const pid = parsePlaylistId(req.params.id);
  if (pid === null) return res.status(400).json({ error: 'invalid playlist id' });
  if (!(await playlistExists(pid))) return res.status(404).json({ error: 'playlist not found' });
  next();
}

// POST upload file
router.post('/:id/upload', gateUpload, upload.array('files'), async (req, res) => {
  const pid = parsePlaylistId(req.params.id)!;
  const files = (req.files as Express.Multer.File[]) || [];
  const added = [];

  for (const file of files) {
    let duration = 0;
    try { duration = await getAudioDurationInSeconds(file.path); } catch {}

    const pos = await pool.query(
      `SELECT COALESCE(MAX(position),0)+1 as next FROM playlist_items WHERE playlist_id=$1`,
      [pid]
    );
    const displayName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    try {
      const r = await pool.query(
        `INSERT INTO playlist_items(playlist_id,filename,filepath,duration_sec,position)
         VALUES($1,$2,$3,$4,$5) RETURNING *`,
        [pid, displayName, file.path, duration, pos.rows[0].next]
      );
      added.push(r.rows[0]);
    } catch (e) {
      try { fs.unlinkSync(file.path); } catch {}
      throw e;
    }
  }
  res.json(added);
});

// PUT update item (weight) — already scoped by playlist_id, good
router.put('/:id/items/:itemId', async (req, res) => {
  const pid = parsePlaylistId(req.params.id);
  const iid = parseItemId(req.params.itemId);
  if (pid === null || iid === null) return res.status(400).json({ error: 'invalid ids' });
  const { weight } = req.body;
  const r = await pool.query(
    `UPDATE playlist_items SET weight=$1 WHERE id=$2 AND playlist_id=$3 RETURNING *`,
    [Math.max(1, Math.min(100, parseInt(weight) || 1)), iid, pid]
  );
  if (!r.rows[0]) return res.status(404).json({ error: 'item not found' });
  res.json(r.rows[0]);
});

// DELETE item — scope by playlist_id
router.delete('/:id/items/:itemId', async (req, res) => {
  const pid = parsePlaylistId(req.params.id);
  const iid = parseItemId(req.params.itemId);
  if (pid === null || iid === null) return res.status(400).json({ error: 'invalid ids' });

  const item = await pool.query(
    `SELECT * FROM playlist_items WHERE id=$1 AND playlist_id=$2`,
    [iid, pid]
  );
  if (!item.rows[0]) return res.status(404).json({ error: 'item not found' });

  await pool.query(`DELETE FROM playlist_items WHERE id=$1 AND playlist_id=$2`, [iid, pid]);
  const fp = path.resolve(item.rows[0].filepath);
  if (fp.startsWith(path.resolve(UPLOADS_DIR) + path.sep)) {
    try { fs.unlinkSync(fp); } catch {}
  }
  res.json({ ok: true });
});

// PUT reorder items — transaction + verify each item belongs to playlist
router.put('/:id/items', async (req, res) => {
  const pid = parsePlaylistId(req.params.id);
  if (pid === null) return res.status(400).json({ error: 'invalid playlist id' });
  const { order } = req.body;
  if (!Array.isArray(order) || !order.every(n => Number.isInteger(n) && n > 0)) {
    return res.status(400).json({ error: 'order must be an array of positive integers' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < order.length; i++) {
      const r = await client.query(
        `UPDATE playlist_items SET position=$1 WHERE id=$2 AND playlist_id=$3`,
        [i + 1, order[i], pid]
      );
      if (r.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `item ${order[i]} does not belong to playlist ${pid}` });
      }
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    throw e;
  } finally {
    client.release();
  }
});

export default router;
