import { pool } from './db';
import { getIO } from './socket';

export type LogLevel = 'info' | 'warn' | 'error';

export async function logEvent(
  level: LogLevel,
  message: string,
  regionId?: number,
  regionName?: string
) {
  // Always write to console
  const prefix = regionName ? `[region:${regionName}]` : '[system]';
  if (level === 'error') console.error(`${prefix} ${message}`);
  else if (level === 'warn') console.warn(`${prefix} ${message}`);
  else console.log(`${prefix} ${message}`);

  // Persist to DB
  try {
    await pool.query(
      `INSERT INTO system_logs(level, message, region_id, region_name) VALUES($1,$2,$3,$4)`,
      [level, message, regionId ?? null, regionName ?? null]
    );
  } catch (e) {
    console.error('[logger] DB insert failed:', e);
  }

  // Emit real-time to frontend
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    region_id: regionId ?? null,
    region_name: regionName ?? null,
  };
  getIO()?.emit('log:entry', entry);
}
