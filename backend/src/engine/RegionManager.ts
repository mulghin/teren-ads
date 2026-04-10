import { pool } from '../db';
import { RegionProcess } from './RegionProcess';

class RegionManager {
  private regions = new Map<number, RegionProcess>();

  async init() {
    const res = await pool.query(`SELECT * FROM regions WHERE enabled=TRUE ORDER BY id`);
    for (const row of res.rows) {
      const rp = new RegionProcess(row);
      this.regions.set(row.id, rp);
      if (row.status === 'main') {
        rp.startMain().catch(e => console.error(`[RegionManager] auto-start failed for ${row.name}:`, e));
      }
    }
    console.log(`[RegionManager] Loaded ${this.regions.size} regions`);
  }

  async reload() {
    const res = await pool.query(`SELECT * FROM regions ORDER BY id`);
    const dbIds = new Set(res.rows.map((r: any) => r.id));

    // Stop removed regions
    for (const [id, rp] of this.regions) {
      if (!dbIds.has(id)) {
        await rp.stop();
        this.regions.delete(id);
      }
    }

    // Add new / update existing
    for (const row of res.rows) {
      if (!this.regions.has(row.id)) {
        this.regions.set(row.id, new RegionProcess(row));
      } else {
        this.regions.get(row.id)!.updateConfig(row.crossfade_sec, row.return_mode, row.return_timer_sec);
      }
    }
  }

  get(id: number): RegionProcess | undefined {
    return this.regions.get(id);
  }

  getAll(): RegionProcess[] {
    return [...this.regions.values()];
  }

  async triggerAd(regionId: number, playlistId: number, triggerType = 'api', fillerPlaylistId?: number) {
    const rp = this.regions.get(regionId);
    if (!rp) throw new Error(`Region ${regionId} not found`);
    await rp.startAd(playlistId, triggerType, fillerPlaylistId);
  }

  async triggerReturn(regionId: number) {
    const rp = this.regions.get(regionId);
    if (!rp) throw new Error(`Region ${regionId} not found`);
    await rp.returnToMain('api');
  }

  async startMain(regionId: number) {
    const rp = this.regions.get(regionId);
    if (!rp) throw new Error(`Region ${regionId} not found`);
    await rp.startMain();
  }

  async stopRegion(regionId: number) {
    const rp = this.regions.get(regionId);
    if (!rp) throw new Error(`Region ${regionId} not found`);
    await rp.stop();
  }

  async restartMainRegions() {
    for (const rp of this.regions.values()) {
      if (rp.state.mode === 'main') {
        rp.startMain().catch(e =>
          console.error(`[RegionManager] restartMain failed for ${rp.state.name}:`, e)
        );
      }
    }
  }

  // Called by tone detector
  async handleTone(type: 'start' | 'stop') {
    if (type === 'start') {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      // JS getDay(): 0=Sun,1=Mon..6=Sat → convert to 1=Mon..7=Sun
      const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay();

      for (const rp of this.regions.values()) {
        if (rp.state.mode === 'main') {
          // 1. Check time-window schedules for this region
          const schedRes = await pool.query(
            `SELECT * FROM region_schedules WHERE region_id=$1 AND is_active=TRUE`,
            [rp.state.id]
          );

          let matched: any = null;
          for (const sched of schedRes.rows) {
            if (!sched.days.includes(String(dayOfWeek))) continue;
            const [sh, sm] = sched.time_hhmm.split(':').map(Number);
            const schedMinutes = sh * 60 + sm;
            if (Math.abs(currentMinutes - schedMinutes) <= sched.tolerance_minutes) {
              matched = sched;
              break;
            }
          }

          if (matched) {
            if (rp.state.mode !== 'main') continue; // re-check after async DB query
            await rp.startAd(matched.playlist_id, 'tone', matched.filler_playlist_id);
          } else {
            // 2. Fallback: highest-priority region_assignment
            const res = await pool.query(
              `SELECT ra.playlist_id, ra.filler_playlist_id FROM region_assignments ra
               WHERE ra.region_id=$1 AND ra.active=TRUE ORDER BY ra.priority DESC LIMIT 1`,
              [rp.state.id]
            );
            if (res.rows[0]) {
              if (rp.state.mode !== 'main') continue; // re-check after async DB query
              await rp.startAd(res.rows[0].playlist_id, 'tone', res.rows[0].filler_playlist_id);
            }
          }
        }
      }
    } else {
      for (const rp of this.regions.values()) {
        if (rp.state.mode === 'ad' || rp.state.mode === 'filler') {
          // Only allow STOP tone to interrupt if returnMode is not playlist_end
          // (playlist_end means "play the full ad, don't cut it short")
          if (rp.state.returnMode === 'playlist_end') continue;
          await rp.returnToMain('tone');
        }
      }
    }
  }

  getStatus() {
    return this.getAll().map(rp => ({
      id: rp.state.id,
      name: rp.state.name,
      slug: rp.state.slug,
      mount: rp.state.mount,
      mode: rp.state.mode,
      currentPlaylist: rp.state.currentPlaylist,
      currentFile: rp.state.currentFile,
    }));
  }
}

export const regionManager = new RegionManager();
