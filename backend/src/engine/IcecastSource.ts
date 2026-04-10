import net from 'net';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

type FeedMode = 'main' | 'ad';

export interface FeedFileOptions {
  crossfadeInEnabled: boolean;
  crossfadeInSec: number;
  crossfadeOutSec: number;
  loudnormEnabled: boolean;
  loudnormTarget: number;   // LUFS, e.g. -18
  totalDurationSec: number; // sum of all files in concat
}

/**
 * Maintains a persistent ICY source connection to Icecast.
 *
 * Two ffmpeg processes run simultaneously:
 *  - relay:  always running, reads the live HTTP source stream
 *  - ad:     only during ads, reads a local concat file at -re speed
 *
 * Only one of them writes to the Icecast socket at a time (controlled by `mode`).
 * The relay is always warmed up — returning from ad to main is instant and seamless.
 */
export class IcecastSource extends EventEmitter {
  private socket: net.Socket | null = null;
  private relayProc: ChildProcess | null = null;
  private adProc: ChildProcess | null = null;
  private mode: FeedMode = 'main';
  private connected = false;
  private stopped = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private relaySourceUrl = '';
  private backupSourceUrl = '';
  private usingBackup = false;

  constructor(
    private host: string,
    private port: number,
    private mount: string,
    private password: string,
  ) {
    super();
  }

  // ── ICY connection ─────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    if (this.stopped) return;
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      const timeout = setTimeout(() => { socket.destroy(); reject(new Error('connect timeout')); }, 10_000);

      socket.connect(this.port, this.host, () => {
        const auth = Buffer.from(`source:${this.password}`).toString('base64');
        socket.write(
          `SOURCE ${this.mount} HTTP/1.0\r\n` +
          `Authorization: Basic ${auth}\r\n` +
          `Content-Type: audio/mpeg\r\n` +
          `ice-bitrate: 320\r\n` +
          `ice-name: Region\r\n` +
          `\r\n`,
        );
      });

      socket.once('data', (data) => {
        clearTimeout(timeout);
        if (data.toString().includes('200 OK')) {
          this.socket = socket;
          this.connected = true;
          socket.on('error', () => this._onSocketDrop());
          socket.on('close', () => { if (this.connected) this._onSocketDrop(); });
          resolve();
        } else {
          socket.destroy();
          reject(new Error(`Icecast rejected ${this.mount}: ${data.toString().slice(0, 80)}`));
        }
      });

      socket.on('error', (e) => { clearTimeout(timeout); reject(e); });
    });
  }

  private _onSocketDrop() {
    this.connected = false;
    this.socket = null;
    if (!this.stopped) this._scheduleReconnect();
  }

  private _scheduleReconnect(ms = 2000) {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (this.stopped) return;
      try {
        await this.connect();
        console.log(`[IcecastSource:${this.mount}] reconnected`);
        this.emit('reconnected');
      } catch { this._scheduleReconnect(3000); }
    }, ms);
  }

  // ── Internal: write chunk to socket (from the currently active source) ─────

  private lastMainWriteMs = 0;

  private _write(chunk: Buffer, from: FeedMode) {
    if (!this.socket || !this.connected) return;
    if (this.mode !== from) return;

    const now = Date.now();
    if (from === 'main' && this.lastMainWriteMs > 0) {
      const gap = now - this.lastMainWriteMs;
      if (gap > 300) {
        console.log(`[IcecastSource:${this.mount}] relay data gap ${gap}ms`);
      }
    }
    if (from === 'main') this.lastMainWriteMs = now;

    this.socket.write(chunk);
  }

  // ── Relay (always warm) ────────────────────────────────────────────────────

  /**
   * Start (or restart) the relay from a live HTTP source.
   * backupUrl is used if the primary fails repeatedly.
   */
  feedStream(sourceUrl: string, backupUrl = '') {
    this.relaySourceUrl = sourceUrl;
    this.backupSourceUrl = backupUrl;
    this._startRelay();
  }

  private _startRelay(useBackup = false) {
    if (this.relayProc) return;
    if (this.stopped) return;

    const url = (useBackup && this.backupSourceUrl) ? this.backupSourceUrl : this.relaySourceUrl;
    this.usingBackup = useBackup && !!this.backupSourceUrl;

    if (this.usingBackup) {
      console.log(`[IcecastSource:${this.mount}] relay starting (BACKUP: ${url})`);
    } else {
      console.log(`[IcecastSource:${this.mount}] relay starting`);
    }

    let failCount = 0;

    const proc = spawn('ffmpeg', [
      '-reconnect', '1',
      '-reconnect_at_eof', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '2',
      '-i', url,
      '-acodec', 'libmp3lame', '-b:a', '320k', '-ar', '48000',
      '-f', 'mp3',
      'pipe:1',
    ], { stdio: ['ignore', 'pipe', 'ignore'] });

    this.relayProc = proc;

    proc.stdout?.on('data', (chunk: Buffer) => {
      failCount = 0;
      this._write(chunk, 'main');
    });

    proc.on('exit', (code, signal) => {
      console.log(`[IcecastSource:${this.mount}] relay exit code=${code} signal=${signal}`);
      this.relayProc = null;
      if (!this.stopped) {
        failCount++;
        // If primary fails multiple times and we have a backup, try backup
        const tryBackup = !useBackup && failCount >= 3 && !!this.backupSourceUrl;
        if (tryBackup) {
          console.log(`[IcecastSource:${this.mount}] primary failed ${failCount}x — switching to backup`);
          this.emit('source_switch', { from: this.relaySourceUrl, to: this.backupSourceUrl });
          setTimeout(() => this._startRelay(true), 1000);
        } else if (useBackup) {
          // Try to return to primary occasionally
          const tryPrimary = Math.random() < 0.25; // 25% chance each restart
          setTimeout(() => this._startRelay(!tryPrimary), 2000);
        } else {
          setTimeout(() => this._startRelay(false), 1000);
        }
      }
    });
  }

  // ── Ad feed ───────────────────────────────────────────────────────────────

  /**
   * Switch to playing a local concat file.
   * Relay keeps running in the background so the return to main is instant and seamless.
   * Resolves when the file finishes (finished=true) or is killed (finished=false).
   */
  feedFile(concatPath: string, opts: FeedFileOptions): Promise<{ finished: boolean }> {
    return new Promise((resolve) => {
      if (this.stopped) { resolve({ finished: false }); return; }

      if (this.adProc) {
        this.adProc.kill('SIGKILL');
        this.adProc = null;
      }

      this.mode = 'ad';

      // Build audio filter chain
      const filters: string[] = [];
      if (opts.loudnormEnabled) {
        filters.push(`loudnorm=I=${opts.loudnormTarget}:TP=-1.5:LRA=11`);
      }
      if (opts.crossfadeInEnabled && opts.crossfadeInSec > 0) {
        filters.push(`afade=t=in:st=0:d=${opts.crossfadeInSec}`);
      }
      if (opts.crossfadeOutSec > 0 && opts.totalDurationSec > opts.crossfadeOutSec) {
        const outStart = Math.max(0, opts.totalDurationSec - opts.crossfadeOutSec);
        filters.push(`afade=t=out:st=${outStart.toFixed(2)}:d=${opts.crossfadeOutSec}`);
      }
      const afArg = filters.length ? filters.join(',') : 'anull';

      const proc = spawn('ffmpeg', [
        '-re',
        '-f', 'concat', '-safe', '0', '-i', concatPath,
        '-af', afArg,
        '-acodec', 'libmp3lame', '-b:a', '320k', '-ar', '48000',
        '-f', 'mp3',
        'pipe:1',
      ], { stdio: ['ignore', 'pipe', 'pipe'] });

      this.adProc = proc;

      let adBytesWritten = 0;
      proc.stdout?.on('data', (chunk: Buffer) => {
        adBytesWritten += chunk.length;
        this._write(chunk, 'ad');
      });

      proc.stderr?.on('data', () => {}); // drain to prevent pipe blocking

      proc.on('exit', (code, signal) => {
        console.log(`[IcecastSource:${this.mount}] ad exit code=${code} signal=${signal} bytes=${adBytesWritten} socketOk=${this.connected}`);
        if (this.adProc === proc) this.adProc = null;
        this.mode = 'main';
        resolve({ finished: signal !== 'SIGKILL' });
      });
    });
  }

  /**
   * Immediately kill any running ad and switch back to relay.
   */
  killAd() {
    if (this.adProc) {
      this.adProc.kill('SIGKILL');
      this.adProc = null;
    }
    this.mode = 'main';
  }

  get isUsingBackup(): boolean {
    return this.usingBackup;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  stop() {
    this.stopped = true;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.relayProc) { this.relayProc.kill('SIGKILL'); this.relayProc = null; }
    if (this.adProc) { this.adProc.kill('SIGKILL'); this.adProc = null; }
    if (this.socket) { this.connected = false; this.socket.destroy(); this.socket = null; }
  }
}
