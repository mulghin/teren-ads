import path from 'path';
import fs from 'fs';
import { pool, getSetting } from '../db';
import { getIO } from '../socket';
import { logEvent } from '../logger';
import { IcecastSource, FeedFileOptions } from './IcecastSource';
import { setIcyMetadata } from './IcyMetadata';
import { nowPlayingMirror } from './NowPlayingMirror';
import { fireWebhook } from './WebhookService';
import { sendTelegramNotification } from './TelegramNotifier';

export type RegionMode = 'stopped' | 'main' | 'ad' | 'filler';

export interface RegionState {
  id: number;
  name: string;
  slug: string;
  mount: string;
  mode: RegionMode;
  fadeInSec: number;
  fadeInEnabled: boolean;
  returnFadeInSec: number;
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
      fadeInSec: row.fade_in_sec ?? 1,
      fadeInEnabled: row.fade_in_enabled ?? true,
      returnFadeInSec: row.return_fade_in_sec ?? 1,
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

  private async buildIcecastArgs(): Promise<{ host: string; port: number; mount: string; password: string; iceName: string; iceDescription: string }> {
    const host = await getSetting('icecast_host') || 'localhost';
    const port = parseInt(await getSetting('icecast_port') || '8000');
    const password = await getSetting('icecast_source_password') || 'hackme';
    const mount = this.state.mount.startsWith('/') ? this.state.mount : '/' + this.state.mount;
    const iceName = (await getSetting('stream_name')) || 'Region';
    const iceDescription = (await getSetting('stream_description')) || '';
    return { host, port, mount, password, iceName, iceDescription };
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

  // Per-creative log rows for the "Ролики" report. Start times are computed
  // from the concat order; best-effort — a failure here must not stop playback.
  private async logAdItems(
    adLogId: number,
    playlistId: number,
    files: { filename: string; duration_sec: number }[],
  ) {
    try {
      let offset = 0;
      for (const f of files) {
        await pool.query(
          `INSERT INTO ad_play_items(ad_log_id, region_id, playlist_id, filename, started_at, duration_sec)
           VALUES($1,$2,$3,$4, NOW() + make_interval(secs => $5), $6)`,
          [adLogId, this.state.id, playlistId, f.filename, offset, f.duration_sec ?? null],
        );
        offset += f.duration_sec || 0;
      }
    } catch (e) {
      console.error(`[region:${this.state.name}] logAdItems failed:`, e);
    }
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

  private async ensureSource(retries = 0): Promise<IcecastSource> {
    if (this.source) return this.source;
    // Guard against concurrent calls (e.g. startMain + startAd racing)
    if (this.sourceConnecting) {
      if (retries >= 25) throw new Error('ensureSource timeout: source connection taking too long');
      await new Promise(r => setTimeout(r, 200));
      return this.ensureSource(retries + 1);
    }
    this.sourceConnecting = true;
    try {
      const { host, port, mount, password, iceName, iceDescription } = await this.buildIcecastArgs();
      const src = new IcecastSource(host, port, mount, password, { iceName, iceDescription });
      await src.connect();
      this.source = src;

      // Use on() so every backup switch is logged (once() fires only once)
      src.on('source_switch', ({ from, to }: { from: string; to: string }) => {
        logEvent('warn', `Перемкнулось на резервне джерело: ${to}`, this.state.id, this.state.name);
        const payload = {
          event: 'source_switch' as const,
          region_id: this.state.id,
          region_name: this.state.name,
          reason: `Primary ${from} unavailable`,
          url: to,
          ts: new Date().toISOString(),
        };
        fireWebhook(payload);
        sendTelegramNotification(payload);
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
    nowPlayingMirror.invalidate(mount); // force re-push of master title on next tick
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
      // NOTE: do NOT set state.mode='ad' yet — a concurrent getStatus()/emit()
      // between here and a rejected guard would report a phantom ad. Flip to
      // 'ad' only once we're committed to playing (after the guards below).

      if (!(await this.isCampaignActive(playlistId))) {
        this.adActive = false;
        return;
      }

      if (await this.isFrequencyCapped(playlistId)) {
        this.adActive = false;
        return;
      }

      const files = await this.getPlaylistFiles(playlistId);
      if (!files.length) {
        await logEvent('warn', `Плейлист #${playlistId} порожній`, this.state.id, this.state.name);
        this.adActive = false;
        return;
      }

      this.state.mode = 'ad';

      if (this.state.adLogId) await this.logAdEnd(this.state.adLogId, 'interrupted');
      this.state.adLogId = await this.logAdStart(playlistId, triggerType, files.length);
      await this.logAdItems(this.state.adLogId, playlistId, files);
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

      const adStartPayload = {
        event: 'ad_start' as const,
        region_id: this.state.id,
        region_name: this.state.name,
        playlist_id: playlistId,
        trigger_type: triggerType,
        ts: new Date().toISOString(),
      };
      fireWebhook(adStartPayload);
      sendTelegramNotification(adStartPayload);

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
        // Only enter the looping filler holding-pattern for tone-triggered ads
        // (which end on a stop tone). Non-tone triggers have no stop signal, so
        // looping filler would wedge the region — return to master instead.
        if (fillerPlaylistId && this.adTriggerType === 'tone') {
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
      // ffmpeg concat demuxer uses single-quote format; escape single quotes in path
      const lines = files.map(f => {
        const p = path.resolve(f.filepath).replace(/\\/g, '/').replace(/'/g, "'\\''");
        return `file '${p}'`;
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
      // Only run the return-fade-in bridge when we're finishing an ad — not
      // between filler batches (each filler loop calls feedFile again and we
      // don't want a fade between music tracks).
      const isAdPlayback = this.state.mode === 'ad';
      const opts: FeedFileOptions = {
        fadeInEnabled: this.state.fadeInEnabled,
        fadeInSec: this.state.fadeInSec,
        crossfadeOutSec: this.state.crossfadeOutSec,
        returnFadeInSec: isAdPlayback ? this.state.returnFadeInSec : 0,
        returnSourceUrl: isAdPlayback ? (await getSetting('source_url') || '') : '',
        loudnormEnabled: this.state.loudnormEnabled,
        loudnormTarget: this.state.loudnormTarget,
        totalDurationSec,
      };

      const adStartTime = Date.now();
      // Anti-hang watchdog: feedFile resolves only on the ad ffmpeg `exit` event,
      // but a corrupt / zero-byte / stuck-read concat can keep ffmpeg alive
      // forever — wedging the region (adLocked never releases, no further ads,
      // stuck in ad mode). Previously only `tone` triggers had an upper bound.
      // Force-kill after a generous ceiling (realtime -re playback should take
      // ~total duration; allow 1.5x + 30 s slack, min 60 s) so feedFile resolves.
      const watchdogMs = Math.max(60, totalDurationSec * 1.5 + 30) * 1000;
      let watchdogFired = false;
      const playbackWatchdog = setTimeout(() => {
        watchdogFired = true;
        logEvent('error', `Зависання відтворення >${Math.round(watchdogMs / 1000)}s — примусове завершення`, this.state.id, this.state.name);
        src.killAd();
      }, watchdogMs);
      let finished = false;
      try {
        finished = (await src.feedFile(concatPath, opts)).finished;
      } finally {
        clearTimeout(playbackWatchdog);
      }
      const actualDurationSec = (Date.now() - adStartTime) / 1000;

      // Clean up temp file
      try { fs.unlinkSync(concatPath); } catch {}

      if (!this.adActive) return;
      // ffmpeg was force-killed by the watchdog — don't leave the region stuck
      // in ad mode; recover to master.
      if (watchdogFired) { await this.returnToMain('timeout'); return; }
      if (!finished) return;

      if (this.state.adLogId) {
        await this.logAdEnd(this.state.adLogId, 'completed', actualDurationSec);
        this.state.adLogId = null;
      }

      const adEndPayload = {
        event: 'ad_end' as const,
        region_id: this.state.id,
        region_name: this.state.name,
        playlist_id: adPlaylistId,
        reason: 'completed',
        ts: new Date().toISOString(),
      };
      fireWebhook(adEndPayload);
      sendTelegramNotification(adEndPayload);

      if (this.state.mode === 'filler' && this.adTriggerType !== 'tone') {
        // Filler is a holding pattern that bridges to the STOP tone. A
        // scheduled / API / manual ad has no stop tone, so looping filler here
        // would wedge the region out of 'main' forever (same failure class as
        // C1). Return to master instead of looping.
        await this.returnToMain('completed');
        return;
      } else if (this.state.mode === 'filler') {
        if (!this.adActive) return;
        // Loop: get next filler batch (tone-triggered ads only — bounded by the
        // stop tone, with startAd's returnTimer as the safety net).
        const nextFiller = await this.getPlaylistFiles(fillerPlaylistId!, true);
        files = nextFiller; // loop continues
      } else if (this.state.returnMode === 'playlist_end') {
        await this.returnToMain('playlist_end');
        return;
      } else if (this.state.returnMode === 'signal' && this.adTriggerType !== 'tone') {
        // 'signal' return mode waits for a STOP tone to end the ad — that only
        // exists in the tone-driven flow. A scheduled / API / manual ad is NOT
        // bracketed by tones, so no stop signal will ever come. Return when the
        // ad audio ends, exactly like playlist_end. WITHOUT this the region stays
        // stuck mode='ad' forever and handleTone('start') (which filters
        // mode==='main') excludes it from EVERY future tone insertion — i.e. the
        // region silently stops taking regional ads after its first scheduled ad.
        await this.returnToMain('completed');
        return;
      } else {
        // tone trigger with signal mode → wait for the stop tone;
        // timer mode → return timer is armed back in startAd().
        return;
      }
    }
  }

  async returnToMain(reason = 'api') {
    this.adActive = false;
    this.cancelReturnTimer();

    this.source?.killAd();

    // If _playFiles already ended this ad naturally it cleared adLogId and
    // fired its own ad_end. Only this call OWNS the ad-end (and its webhook)
    // when the log is still open — otherwise we'd double-notify operators.
    const ownsAdEnd = this.state.adLogId != null;
    if (this.state.adLogId) {
      await this.logAdEnd(this.state.adLogId, reason === 'interrupted' ? 'interrupted' : 'completed');
      this.state.adLogId = null;
    }

    if (ownsAdEnd && reason !== 'playlist_end' && reason !== 'completed') {
      const returnPayload = {
        event: 'ad_end' as const,
        region_id: this.state.id,
        region_name: this.state.name,
        reason,
        ts: new Date().toISOString(),
      };
      fireWebhook(returnPayload);
      sendTelegramNotification(returnPayload);
    }

    this.state.mode = 'main';
    this.state.currentPlaylist = null;
    this.state.currentFile = null;
    await pool.query(`UPDATE regions SET status='main' WHERE id=$1`, [this.state.id]);
    this.emit();
    logEvent('info', `→ ЕФІР (main) [${reason}]`, this.state.id, this.state.name);

    const mount = this.state.mount.startsWith('/') ? this.state.mount : '/' + this.state.mount;
    setIcyMetadata(mount, '');
    nowPlayingMirror.invalidate(mount);
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

  // In-process teardown with no DB side effect. Used by SIGTERM/SIGINT so that
  // a process restart doesn't clobber the last-known-live `status` — init()
  // reads that column to decide which regions to auto-resume on startup.
  async shutdown() {
    this.adActive = false;
    this.cancelReturnTimer();
    if (this.source) {
      this.source.stop();
      this.source = null;
    }
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
    this.state.fadeInSec = row.fade_in_sec ?? this.state.fadeInSec;
    this.state.fadeInEnabled = row.fade_in_enabled ?? this.state.fadeInEnabled;
    this.state.returnFadeInSec = row.return_fade_in_sec ?? this.state.returnFadeInSec;
    this.state.crossfadeOutSec = row.crossfade_out_sec ?? this.state.crossfadeOutSec;
    this.state.loudnormEnabled = row.loudnorm_enabled ?? this.state.loudnormEnabled;
    this.state.loudnormTarget = row.loudnorm_target ?? this.state.loudnormTarget;
    this.state.returnMode = row.return_mode ?? this.state.returnMode;
    this.state.returnTimerSec = row.return_timer_sec ?? this.state.returnTimerSec;
  }
}
