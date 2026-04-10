import path from 'path';
import fs from 'fs';
import { pool, getSetting } from '../db';
import { getIO } from '../socket';
import { logEvent } from '../logger';
import { IcecastSource } from './IcecastSource';

export type RegionMode = 'stopped' | 'main' | 'ad' | 'filler';

export interface RegionState {
  id: number;
  name: string;
  slug: string;
  mount: string;
  mode: RegionMode;
  crossfadeSec: number;
  returnMode: string;
  returnTimerSec: number;
  currentPlaylist: number | null;
  currentFile: string | null;
  adLogId: number | null;
}

export class RegionProcess {
  private source: IcecastSource | null = null;
  private returnTimer: NodeJS.Timeout | null = null;
  private adActive = false; // guard against stale exit callbacks
  private adTriggerType = 'api'; // tracks how ad was started
  public state: RegionState;

  constructor(row: {
    id: number; name: string; slug: string;
    icecast_mount: string; crossfade_sec: number;
    return_mode: string; return_timer_sec: number;
  }) {
    this.state = {
      id: row.id,
      name: row.name,
      slug: row.slug,
      mount: row.icecast_mount,
      mode: 'stopped',
      crossfadeSec: row.crossfade_sec,
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

  private async logAdStart(playlistId: number, trigger: string): Promise<number> {
    const res = await pool.query(
      `INSERT INTO ad_logs(region_id, playlist_id, trigger_type) VALUES($1,$2,$3) RETURNING id`,
      [this.state.id, playlistId, trigger],
    );
    return res.rows[0].id;
  }

  private async logAdEnd(logId: number, status: string) {
    await pool.query(
      `UPDATE ad_logs SET end_time=NOW(), status=$1 WHERE id=$2`,
      [status, logId],
    );
  }

  private cancelReturnTimer() {
    if (this.returnTimer) {
      clearTimeout(this.returnTimer);
      this.returnTimer = null;
    }
  }

  // ── Source lifecycle ───────────────────────────────────────────────────────

  private async ensureSource(): Promise<IcecastSource> {
    if (this.source) return this.source;
    const { host, port, mount, password } = await this.buildIcecastArgs();
    const src = new IcecastSource(host, port, mount, password);
    await src.connect();
    this.source = src;
    console.log(`[IcecastSource:${mount}] connected`);
    return src;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Start (or switch to) main broadcast.
   * Maintains the persistent Icecast connection, just changes what's fed into it.
   */
  async startMain() {
    const sourceUrl = await getSetting('source_url');
    if (!sourceUrl) {
      await logEvent('error', 'source_url не налаштовано', this.state.id, this.state.name);
      return;
    }

    const src = await this.ensureSource();
    src.feedStream(sourceUrl);

    this.state.mode = 'main';
    this.state.currentPlaylist = null;
    this.state.currentFile = null;
    await pool.query(`UPDATE regions SET status='main' WHERE id=$1`, [this.state.id]);
    this.emit();
    logEvent('info', '→ ЕФІР (main)', this.state.id, this.state.name);
  }

  /**
   * Play ad playlist. The Icecast connection stays open — listeners never migrate.
   * After the file ends, automatically returns to main (if returnMode=playlist_end).
   */
  async startAd(playlistId: number, triggerType = 'api', fillerPlaylistId?: number) {
    this.cancelReturnTimer();
    this.adActive = true;
    this.adTriggerType = triggerType;
    this.state.mode = 'ad'; // set immediately to prevent concurrent startAd calls

    const files = await this.getPlaylistFiles(playlistId);
    if (!files.length) {
      await logEvent('warn', `Плейлист #${playlistId} порожній`, this.state.id, this.state.name);
      return;
    }

    if (this.state.adLogId) await this.logAdEnd(this.state.adLogId, 'interrupted');
    this.state.adLogId = await this.logAdStart(playlistId, triggerType);
    this.state.currentPlaylist = playlistId;

    // Safety timeout: if STOP tone never arrives, return to main after max duration
    if (triggerType === 'tone') {
      const maxSec = this.state.returnTimerSec > 0 ? this.state.returnTimerSec : 60;
      this.returnTimer = setTimeout(() => {
        if (this.adActive) {
          console.log(`[region:${this.state.name}] AD timeout ${maxSec}s — returning to main`);
          this.returnToMain('timeout');
        }
      }, maxSec * 1000);
    }

    await this._playFiles(files, fillerPlaylistId, playlistId);

    if (triggerType !== 'tone' && this.state.returnMode === 'timer' && this.state.returnTimerSec > 0) {
      this.returnTimer = setTimeout(() => this.returnToMain('timer_end'), this.state.returnTimerSec * 1000);
    }
  }

  private async _playFiles(
    files: { filepath: string; filename: string }[],
    fillerPlaylistId?: number,
    adPlaylistId?: number,
  ): Promise<void> {
    if (!files.length) {
      if (fillerPlaylistId) {
        const fillerFiles = await this.getPlaylistFiles(fillerPlaylistId, true);
        if (fillerFiles.length) {
          this.state.mode = 'filler';
          await pool.query(`UPDATE regions SET status='filler' WHERE id=$1`, [this.state.id]);
          this.emit();
          return this._playFiles(fillerFiles, fillerPlaylistId, adPlaylistId);
        }
      }
      await this.returnToMain('playlist_end');
      return;
    }

    const src = await this.ensureSource();
    const concatPath = `/tmp/teren_ads_region_${this.state.id}.txt`;
    const lines = files.map(f => `file '${f.filepath.replace(/'/g, "'\\''")}'`).join('\n');
    fs.writeFileSync(concatPath, lines);

    if (this.state.mode !== 'filler') this.state.mode = 'ad';
    this.state.currentFile = files[0].filename;
    await pool.query(`UPDATE regions SET status=$1 WHERE id=$2`, [this.state.mode, this.state.id]);
    this.emit();

    logEvent('info', `→ ${this.state.mode.toUpperCase()} (${files.length} файлів)`, this.state.id, this.state.name);

    const { finished } = await src.feedFile(concatPath, this.state.crossfadeSec);

    // feedFile resolves when ad is done (finished=true) or killed (finished=false)
    if (!this.adActive) return; // returnToMain was called externally (tone stop / API)
    if (!finished) return; // killed by killAdFeed

    if (this.state.adLogId) await this.logAdEnd(this.state.adLogId, 'completed');
    this.state.adLogId = null;

    if (this.state.mode === 'filler') {
      // Filler loops until stop tone arrives (adActive set to false by returnToMain)
      if (!this.adActive) return;
      const nextFiller = await this.getPlaylistFiles(fillerPlaylistId!, true);
      if (nextFiller.length) {
        return this._playFiles(nextFiller, fillerPlaylistId, adPlaylistId);
      }
      await this.returnToMain('playlist_end');
    } else if (this.state.returnMode === 'playlist_end') {
      await this.returnToMain('playlist_end');
    }
  }

  /**
   * Return to main mode: kill ad ffmpeg, relay takes over instantly (already warm).
   * No disconnect — listeners stay on the same mount.
   */
  async returnToMain(reason = 'api') {
    this.adActive = false;
    this.cancelReturnTimer();

    // Kill ad ffmpeg immediately — relay is already running, data flows at once
    this.source?.killAd();

    if (this.state.adLogId) {
      await this.logAdEnd(this.state.adLogId, reason === 'interrupted' ? 'interrupted' : 'completed');
      this.state.adLogId = null;
    }

    logEvent('info', `повернення в ЕФІР (${reason})`, this.state.id, this.state.name);

    this.state.mode = 'main';
    this.state.currentPlaylist = null;
    this.state.currentFile = null;
    await pool.query(`UPDATE regions SET status='main' WHERE id=$1`, [this.state.id]);
    this.emit();
    logEvent('info', '→ ЕФІР (main)', this.state.id, this.state.name);
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
  ): Promise<{ filepath: string; filename: string }[]> {
    const row = await pool.query(`SELECT shuffle FROM playlists WHERE id=$1`, [playlistId]);
    const doShuffle = shuffle || (row.rows[0]?.shuffle ?? false);
    const order = doShuffle ? 'RANDOM()' : 'position ASC, id ASC';
    const res = await pool.query(
      `SELECT filepath, filename FROM playlist_items WHERE playlist_id=$1 ORDER BY ${order}`,
      [playlistId],
    );
    return res.rows;
  }

  updateConfig(crossfadeSec: number, returnMode: string, returnTimerSec: number) {
    this.state.crossfadeSec = crossfadeSec;
    this.state.returnMode = returnMode;
    this.state.returnTimerSec = returnTimerSec;
  }
}
