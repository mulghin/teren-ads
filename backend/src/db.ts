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

export async function getSetting(key: string): Promise<string> {
  const res = await pool.query('SELECT value FROM settings WHERE key=$1', [key]);
  return res.rows[0]?.value ?? '';
}

export async function setSetting(key: string, value: string) {
  await pool.query(
    'INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2',
    [key, value]
  );
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const res = await pool.query('SELECT key, value FROM settings');
  return Object.fromEntries(res.rows.map(r => [r.key, r.value]));
}
