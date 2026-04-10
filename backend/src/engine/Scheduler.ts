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
    this.tasks.forEach(t => t.stop());
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

    for (const time of times) {
      const [h, m] = time.split(':').map(Number);
      if (isNaN(h) || isNaN(m)) continue;

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
    this.tasks.forEach(t => t.stop());
    this.tasks = [];
  }

  private parseDays(days: string): string {
    return days.split(',')
      .map(d => DAY_MAP[d.trim().toLowerCase()] ?? d)
      .join(',');
  }
}

export const scheduler = new Scheduler();
