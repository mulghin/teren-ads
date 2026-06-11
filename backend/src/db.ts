import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

export const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'teren_ads',
  user: process.env.PGUSER || 'aiassistant',
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('[db] Idle client error:', err);
});

export async function initDb() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);
  console.log('[db] Schema applied');
}

// One-shot startup sweep: a crash mid-ad leaves ad_logs rows stuck at
// status='running' (the completed/interrupted UPDATE never fired). Those
// zombies over-count proof-of-play, so mark them interrupted at boot with a
// best-effort end_time/duration. Idempotent — once flipped they're skipped.
export async function reapOrphanAdLogs(): Promise<number> {
  const res = await pool.query(`
    UPDATE ad_logs
    SET status='interrupted',
        end_time=COALESCE(end_time, start_time),
        duration_sec=COALESCE(duration_sec, 0)
    WHERE status='running'
  `);
  if (res.rowCount) {
    console.log(`[db] Reaped ${res.rowCount} orphan 'running' ad_log row(s) -> interrupted`);
  }
  return res.rowCount ?? 0;
}

export async function getSetting(key: string): Promise<string> {
  const res = await pool.query('SELECT value FROM settings WHERE key=$1', [key]);
  return res.rows[0]?.value ?? '';
}

export async function setSetting(key: string, value: unknown) {
  const v = value === null || value === undefined ? '' : String(value);
  await pool.query(
    'INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value',
    [key, v]
  );
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const res = await pool.query('SELECT key, value FROM settings');
  return Object.fromEntries(res.rows.map(r => [r.key, r.value]));
}
