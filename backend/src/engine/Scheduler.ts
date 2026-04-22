import cron from 'node-cron';
import { pool } from '../db';
import { regionManager } from './RegionManager';

const DAY_MAP: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6
};

class Scheduler {
  private tasks: cron.ScheduledTask[] = [];

  async init() {
    await this.reload();
  }

  async reload() {
    this.tasks.forEach(t => { try { t.stop(); (t as any).destroy?.(); } catch {} });
    this.tasks = [];

    const res = await pool.query(`
      SELECT s.*, p.id as pid
      FROM schedules s
      JOIN playlists p ON p.id=s.playlist_id
      WHERE s.enabled=TRUE
    `);

    for (const row of res.rows) {
      this.scheduleRow(row);
    }
    console.log(`[Scheduler] Loaded ${this.tasks.length} schedules`);
  }

  private scheduleRow(row: any) {
    let times: string[] = [];
    try { times = JSON.parse(row.times); } catch {}
    if (!times.length) return;

    const days = row.days === 'all' ? '0-6' : this.parseDays(row.days);
    if (!days) {
      console.warn(`[Scheduler] schedule id=${row.id} has no valid days — skipped`);
      return;
    }

    for (const time of times) {
      if (typeof time !== 'string' || !/^([0-9]{1,2}):([0-9]{2})$/.test(time)) continue;
      const [h, m] = time.split(':').map(Number);
      if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) continue;

      const expr = `${m} ${h} * * ${days}`;
      try {
        const task = cron.schedule(expr, async () => {
          console.log(`[Scheduler] Firing region=${row.region_id} playlist=${row.playlist_id}`);
          try {
            // Get filler playlist from assignment
            const assign = await pool.query(
              `SELECT filler_playlist_id FROM region_assignments WHERE region_id=$1 AND active=TRUE LIMIT 1`,
              [row.region_id]
            );
            await regionManager.triggerAd(
              row.region_id,
              row.playlist_id,
              'schedule',
              assign.rows[0]?.filler_playlist_id
            );
          } catch (e) {
            console.error(`[Scheduler] Error:`, e);
          }
        });
        this.tasks.push(task);
      } catch (e) {
        console.error(`[Scheduler] Invalid cron expr for time ${time}:`, e);
      }
    }
  }

  stop() {
    this.tasks.forEach(t => { try { t.stop(); (t as any).destroy?.(); } catch {} });
    this.tasks = [];
  }

  private parseDays(days: string): string {
    const mapped: number[] = [];
    for (const raw of days.split(',')) {
      const token = raw.trim().toLowerCase();
      if (!token) continue;
      if (token in DAY_MAP) {
        mapped.push(DAY_MAP[token]);
        continue;
      }
      const n = parseInt(token, 10);
      if (Number.isFinite(n) && n >= 0 && n <= 6) {
        mapped.push(n);
        continue;
      }
      console.warn(`[Scheduler] Unknown day token "${raw}" — skipped`);
    }
    return mapped.length ? [...new Set(mapped)].sort().join(',') : '';
  }
}

export const scheduler = new Scheduler();
