import path from 'path';
import fs from 'fs';
import { pool, getSetting } from '../db';
import { getIO } from '../socket';
import { logEvent } from '../logger';
import { IcecastSource, FeedFileOptions } from './IcecastSource';
import { setIcyMetadata } from './IcyMetadata';
import { fireWebhook } from './WebhookService';

export type RegionMode = 'stopped' | 'main' | 'ad' | 'filler';

export interface RegionState {
  id: number;
  name: string;
  slug: string;
  mount: string;
  mode: RegionMode;
  crossfadeSec: number;
  crossfadeInEnabled: boolean;
  crossfadeOutSec: number;
  loudnormEnabled: boolean;
  loudnormTarget: number;
  returnMode: string;
  returnTimerSec: number;
  currentPlaylist: number | null;
  currentFile: string | null;
  adLogId: number | null;
}

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');

export class RegionProcess {
  private source: IcecastSource | null = null;
  private sourceConnecting = false; // guard against concurrent ensureSource calls
  private returnTimer: NodeJS.Timeout | null = null;
  private adActive = false;
  private adLocked = false; // serialize concurrent startAd calls
  private adTriggerType = 'api';
  public state: RegionState;

  constructor(row: any) {
    this.state = {
      id: row.id,
      name: row.name,
      slug: row.slug,
      mount: row.icecast_mount,
      mode: 'stopped',
      crossfadeSec: row.crossfade_sec ?? 1,
      crossfadeInEnabled: row.crossfade_in_enabled ?? true,
      crossfadeOutSec: row.crossfade_out_sec ?? 0,
      loudnormEnabled: row.loudnorm_enabled ?? false,
      loudnormTarget: row.loudnorm_target ?? -18,
      returnMode: row.return_mode,
      returnTimerSec: row.return_timer_sec,
      currentPlaylist: null,
      currentFile: null,
      adLogId: null,
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async buildIcecastArgs(): Promise<{ host: string; port: number; mount: string; password: string }> {
    const host = await getSetting('icecast_host') || 'localhost';
    const port = parseInt(await getSetting('icecast_port') || '8000');
    const password = await getSetting('icecast_source_password') || 'hackme';
    const mount = this.state.mount.startsWith('/') ? this.state.mount : '/' + this.state.mount;
    return { host, port, mount, password };
  }

  private emit() {
    getIO()?.emit('region:update', {
      id: this.state.id,
      mode: this.state.mode,
      currentFile: this.state.currentFile,
      currentPlaylist: this.state.currentPlaylist,
    });
  }

  private async logAdStart(playlistId: number, trigger: string, fileCount: number): Promise<number> {
    const res = await pool.query(
      `INSERT INTO ad_logs(region_id, playlist_id, trigger_type, file_count) VALUES($1,$2,$3,$4) RETURNING id`,
      [this.state.id, playlistId, trigger, fileCount],
    );
    return res.rows[0].id;
  }

  private async logAdEnd(logId: number, status: string, durationSec?: number) {
    await pool.query(
      `UPDATE ad_logs SET end_time=NOW(), status=$1, duration_sec=$2 WHERE id=$3`,
      [status, durationSec ?? null, logId],
    );
  }

  private cancelReturnTimer() {
    if (this.returnTimer) {
      clearTimeout(this.returnTimer);
      this.returnTimer = null;
    }
  }

  // ── Frequency cap check ────────────────────────────────────────────────────

  private async isFrequencyCapped(playlistId: number): Promise<boolean> {
    const pl = await pool.query(
      `SELECT max_plays_per_day, max_plays_per_week FROM playlists WHERE id=$1`,
      [playlistId]
    );
    if (!pl.rows[0]) return false;
    const { max_plays_per_day, max_plays_per_week } = pl.rows[0];

    if (max_plays_per_day > 0) {
      const r = await pool.query(
        `SELECT COUNT(*) as cnt FROM ad_logs WHERE playlist_id=$1 AND start_time >= NOW() - INTERVAL '1 day' AND status != 'interrupted'`,
        [playlistId]
      );
      if (parseInt(r.rows[0].cnt) >= max_plays_per_day) {
        logEvent('warn', `Плейлист #${playlistId} досяг ліміту ${max_plays_per_day}/день`, this.state.id, this.state.name);
        return true;
      }
    }

    if (max_plays_per_week > 0) {
      const r = await pool.query(
        `SELECT COUNT(*) as cnt FROM ad_logs WHERE playlist_id=$1 AND start_time >= NOW() - INTERVAL '7 days' AND status != 'interrupted'`,
        [playlistId]
      );
      if (parseInt(r.rows[0].cnt) >= max_plays_per_week) {
        logEvent('warn', `Плейлист #${playlistId} досяг ліміту ${max_plays_per_week}/тиждень`, this.state.id, this.state.name);
        return true;
      }
    }

    return false;
  }

  // ── Campaign date check ────────────────────────────────────────────────────

  private async isCampaignActive(playlistId: number): Promise<boolean> {
    const r = await pool.query(
      `SELECT 1 FROM playlists WHERE id=$1
       AND (start_date IS NULL OR start_date <= CURRENT_DATE)
       AND (end_date IS NULL OR end_date >= CURRENT_DATE)`,
      [playlistId]
    );
    if (!r.rows[0]) {
      logEvent('warn', `Плейлист #${playlistId} поза датами кампанії — пропущено`, this.state.id, this.state.name);
      return false;
    }
    return true;
  }

  // ── Source lifecycle ───────────────────────────────────────────────────────

  private async ensureSource(): Promise<IcecastSource> {
    if (this.source) return this.source;
    // Guard against concurrent calls (e.g. startMain + startAd racing)
    if (this.sourceConnecting) {
      await new Promise(r => setTimeout(r, 200));
      return this.ensureSource();
    }
    this.sourceConnecting = true;
    try {
      const { host, port, mount, password } = await this.buildIcecastArgs();
      const src = new IcecastSource(host, port, mount, password);
      await src.connect();
      this.source = src;

      // Use on() so every backup switch is logged (once() fires only once)
      src.on('source_switch', ({ from, to }: { from: string; to: string }) => {
        logEvent('warn', `Перемкнулось на резервне джерело: ${to}`, this.state.id, this.state.name);
        fireWebhook({
          event: 'source_switch',
          region_id: this.state.id,
          region_name: this.state.name,
          reason: `Primary ${from} unavailable`,
          url: to,
          ts: new Date().toISOString(),
        });
      });

      console.log(`[IcecastSource:${mount}] connected`);
      return src;
    } finally {
      this.sourceConnecting = false;
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async startMain() {
    const sourceUrl = await getSetting('source_url');
    if (!sourceUrl) {
      await logEvent('error', 'source_url не налаштовано', this.state.id, this.state.name);
      return;
    }
    const backupUrl = await getSetting('backup_source_url') || '';

    const src = await this.ensureSource();
    src.feedStream(sourceUrl, backupUrl);

    this.state.mode = 'main';
    this.state.currentPlaylist = null;
    this.state.currentFile = null;
    await pool.query(`UPDATE regions SET status='main' WHERE id=$1`, [this.state.id]);
    this.emit();
    logEvent('info', '→ ЕФІР (main)', this.state.id, this.state.name);
    const mount = this.state.mount.startsWith('/') ? this.state.mount : '/' + this.state.mount;
    setIcyMetadata(mount, '');
  }

  async startAd(playlistId: number, triggerType = 'api', fillerPlaylistId?: number) {
    // Serialize: prevent concurrent ad triggers
    if (this.adLocked) {
      console.log(`[region:${this.state.name}] startAd skipped — already locked`);
      return;
    }
    this.adLocked = true;

    try {
      this.cancelReturnTimer();
      this.adActive = true;
      this.adTriggerType = triggerType;
      this.state.mode = 'ad';

      if (!(await this.isCampaignActive(playlistId))) {
        this.adActive = false;
        this.state.mode = 'main';
        return;
      }

      if (await this.isFrequencyCapped(playlistId)) {
        this.adActive = false;
        this.state.mode = 'main';
        return;
      }

      const files = await this.getPlaylistFiles(playlistId);
      if (!files.length) {
        await logEvent('warn', `Плейлист #${playlistId} порожній`, this.state.id, this.state.name);
        this.adActive = false;
        this.state.mode = 'main';
        return;
      }

      if (this.state.adLogId) await this.logAdEnd(this.state.adLogId, 'interrupted');
      this.state.adLogId = await this.logAdStart(playlistId, triggerType, files.length);
      this.state.currentPlaylist = playlistId;

      if (triggerType === 'tone') {
        const maxSec = this.state.returnTimerSec > 0 ? this.state.returnTimerSec : 60;
        this.returnTimer = setTimeout(() => {
          if (this.adActive) {
            console.log(`[region:${this.state.name}] AD timeout ${maxSec}s — returning to main`);
            this.returnToMain('timeout');
          }
        }, maxSec * 1000);
      }

      fireWebhook({
        event: 'ad_start',
        region_id: this.state.id,
        region_name: this.state.name,
        playlist_id: playlistId,
        trigger_type: triggerType,
        ts: new Date().toISOString(),
      });

      await this._playFiles(files, fillerPlaylistId, playlistId);

      // Only set a return timer if still in ad mode (playlist_end didn't already return)
      if (this.adActive && triggerType !== 'tone' && this.state.returnMode === 'timer' && this.state.returnTimerSec > 0) {
        this.returnTimer = setTimeout(() => this.returnToMain('timer_end'), this.state.returnTimerSec * 1000);
      }
    } catch (e) {
      console.error(`[region:${this.state.name}] startAd error:`, e);
      this.adActive = false;
      if (this.state.mode === 'ad' || this.state.mode === 'filler') {
        this.state.mode = 'main';
        this.emit();
      }
    } finally {
      this.adLocked = false;
    }
  }

  private async _playFiles(
    initialFiles: { filepath: string; filename: string; duration_sec: number }[],
    fillerPlaylistId?: number,
    adPlaylistId?: number,
  ): Promise<void> {
    let files = initialFiles;

    // Iterative loop instead of recursion — prevents stack overflow during long filler play
    while (true) {
      if (!files.length) {
        if (fillerPlaylistId) {
          const fillerFiles = await this.getPlaylistFiles(fillerPlaylistId, true);
          if (fillerFiles.length) {
            this.state.mode = 'filler';
            await pool.query(`UPDATE regions SET status='filler' WHERE id=$1`, [this.state.id]);
            this.emit();
            files = fillerFiles;
            continue;
          }
        }
        await this.returnToMain('playlist_end');
        return;
      }

      const src = await this.ensureSource();

      // Validate all file paths are within uploads directory (prevent path traversal)
      for (const f of files) {
        const resolved = path.resolve(f.filepath);
        if (!resolved.startsWith(UPLOADS_DIR)) {
          await logEvent('error', `Підозрілий шлях файлу: ${f.filepath}`, this.state.id, this.state.name);
          await this.returnToMain('security_error');
          return;
        }
      }

      const concatPath = `/tmp/teren_ads_region_${this.state.id}.txt`;
      // ffmpeg concat: use double-quote format; escape backslashes and double-quotes
      const lines = files.map(f => {
        const p = path.resolve(f.filepath).replace(/\\/g, '/').replace(/"/g, '\\"');
        return `file "${p}"`;
      }).join('\n');
      fs.writeFileSync(concatPath, lines, { mode: 0o600 }); // restrict permissions

      if (this.state.mode !== 'filler') this.state.mode = 'ad';
      this.state.currentFile = files[0].filename;
      await pool.query(`UPDATE regions SET status=$1 WHERE id=$2`, [this.state.mode, this.state.id]);
      this.emit();

      logEvent('info', `→ ${this.state.mode.toUpperCase()} (${files.length} файлів)`, this.state.id, this.state.name);

      const mount = this.state.mount.startsWith('/') ? this.state.mount : '/' + this.state.mount;
      setIcyMetadata(mount, files[0].filename.replace(/\.[^.]+$/, ''));

      const totalDurationSec = files.reduce((sum, f) => sum + (f.duration_sec || 0), 0);
      const opts: FeedFileOptions = {
        crossfadeInEnabled: this.state.crossfadeInEnabled,
        crossfadeInSec: this.state.crossfadeSec,
        crossfadeOutSec: this.state.crossfadeOutSec,
        loudnormEnabled: this.state.loudnormEnabled,
        loudnormTarget: this.state.loudnormTarget,
        totalDurationSec,
      };

      const adStartTime = Date.now();
      const { finished } = await src.feedFile(concatPath, opts);
      const actualDurationSec = (Date.now() - adStartTime) / 1000;

      // Clean up temp file
      try { fs.unlinkSync(concatPath); } catch {}

      if (!this.adActive) return;
      if (!finished) return;

      if (this.state.adLogId) {
        await this.logAdEnd(this.state.adLogId, 'completed', actualDurationSec);
        this.state.adLogId = null;
      }

      fireWebhook({
        event: 'ad_end',
        region_id: this.state.id,
        region_name: this.state.name,
        playlist_id: adPlaylistId,
        reason: 'completed',
        ts: new Date().toISOString(),
      });

      if (this.state.mode === 'filler') {
        if (!this.adActive) return;
        // Loop: get next filler batch
        const nextFiller = await this.getPlaylistFiles(fillerPlaylistId!, true);
        files = nextFiller; // loop continues
      } else if (this.state.returnMode === 'playlist_end') {
        await this.returnToMain('playlist_end');
        return;
      } else {
        return;
      }
    }
  }

  async returnToMain(reason = 'api') {
    this.adActive = false;
    this.cancelReturnTimer();

    this.source?.killAd();

    if (this.state.adLogId) {
      await this.logAdEnd(this.state.adLogId, reason === 'interrupted' ? 'interrupted' : 'completed');
      this.state.adLogId = null;
    }

    if (reason !== 'playlist_end' && reason !== 'completed') {
      fireWebhook({
        event: 'ad_end',
        region_id: this.state.id,
        region_name: this.state.name,
        reason,
        ts: new Date().toISOString(),
      });
    }

    this.state.mode = 'main';
    this.state.currentPlaylist = null;
    this.state.currentFile = null;
    await pool.query(`UPDATE regions SET status='main' WHERE id=$1`, [this.state.id]);
    this.emit();
    logEvent('info', `→ ЕФІР (main) [${reason}]`, this.state.id, this.state.name);

    const mount = this.state.mount.startsWith('/') ? this.state.mount : '/' + this.state.mount;
    setIcyMetadata(mount, '');
  }

  async stop() {
    this.adActive = false;
    this.cancelReturnTimer();
    if (this.source) {
      this.source.stop();
      this.source = null;
    }
    this.state.mode = 'stopped';
    await pool.query(`UPDATE regions SET status='stopped' WHERE id=$1`, [this.state.id]);
    this.emit();
    logEvent('info', '→ ЗУПИНЕНО', this.state.id, this.state.name);
  }

  private async getPlaylistFiles(
    playlistId: number,
    shuffle = false,
  ): Promise<{ filepath: string; filename: string; duration_sec: number }[]> {
    const row = await pool.query(`SELECT shuffle FROM playlists WHERE id=$1`, [playlistId]);
    const doShuffle = shuffle || (row.rows[0]?.shuffle ?? false);

    if (doShuffle) {
      const res = await pool.query(
        `SELECT filepath, filename, duration_sec, weight FROM playlist_items WHERE playlist_id=$1`,
        [playlistId],
      );
      const expanded: typeof res.rows = [];
      for (const item of res.rows) {
        const w = Math.max(1, Math.min(100, item.weight ?? 1)); // cap at 100x
        for (let i = 0; i < w; i++) expanded.push(item);
      }
      for (let i = expanded.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [expanded[i], expanded[j]] = [expanded[j], expanded[i]];
      }
      return expanded;
    }

    const res = await pool.query(
      `SELECT filepath, filename, duration_sec FROM playlist_items WHERE playlist_id=$1 ORDER BY position ASC, id ASC`,
      [playlistId],
    );
    return res.rows;
  }

  updateConfig(row: any) {
    this.state.crossfadeSec = row.crossfade_sec ?? this.state.crossfadeSec;
    this.state.crossfadeInEnabled = row.crossfade_in_enabled ?? this.state.crossfadeInEnabled;
    this.state.crossfadeOutSec = row.crossfade_out_sec ?? this.state.crossfadeOutSec;
    this.state.loudnormEnabled = row.loudnorm_enabled ?? this.state.loudnormEnabled;
    this.state.loudnormTarget = row.loudnorm_target ?? this.state.loudnormTarget;
    this.state.returnMode = row.return_mode ?? this.state.returnMode;
    this.state.returnTimerSec = row.return_timer_sec ?? this.state.returnTimerSec;
  }
}
