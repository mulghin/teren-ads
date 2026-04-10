import net from 'net';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

type FeedMode = 'main' | 'ad';

export interface FeedFileOptions {
  crossfadeInEnabled: boolean;
  crossfadeInSec: number;
  crossfadeOutSec: number;
  loudnormEnabled: boolean;
  loudnormTarget: number;
  totalDurationSec: number;
}

/**
 * Maintains a persistent ICY source connection to Icecast.
 *
 * Two ffmpeg processes run simultaneously:
 *  - relay:  always running, reads the live HTTP source stream
 *  - ad:     only during ads, reads a local concat file at -re speed
 *
 * Only one writes to the Icecast socket at a time (controlled by `mode`).
 */
export class IcecastSource extends EventEmitter {
  private socket: net.Socket | null = null;
  private relayProc: ChildProcess | null = null;
  private relayStarting = false; // guard against concurrent relay spawns
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
    // Prevent unhandled EventEmitter errors from crashing the process
    this.on('error', () => {});
  }

  // ── ICY connection ─────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    if (this.stopped) return;
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      let settled = false;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        fn();
      };

      const timeout = setTimeout(() => {
        socket.destroy();
        settle(() => reject(new Error('Icecast connect timeout')));
      }, 10_000);

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
        if (data.toString().includes('200 OK')) {
          this.socket = socket;
          this.connected = true;
          socket.on('error', () => this._onSocketDrop());
          socket.on('close', () => { if (this.connected) this._onSocketDrop(); });
          settle(() => resolve());
        } else {
          socket.destroy();
          settle(() => reject(new Error(`Icecast rejected ${this.mount}: ${data.toString().slice(0, 80)}`)));
        }
      });

      socket.on('error', (e) => {
        settle(() => reject(e));
      });

      socket.once('close', () => {
        settle(() => reject(new Error('Socket closed before ICY handshake')));
      });
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

  // ── Internal: write chunk to socket ───────────────────────────────────────

  private lastMainWriteMs = 0;

  private _write(chunk: Buffer, from: FeedMode) {
    if (!this.socket || !this.connected) return;
    if (this.mode !== from) return;

    const now = Date.now();
    if (from === 'main' && this.mode === 'main' && this.lastMainWriteMs > 0) {
      const gap = now - this.lastMainWriteMs;
      if (gap > 500) {
        console.log(`[IcecastSource:${this.mount}] relay data gap ${gap}ms`);
      }
    }
    if (from === 'main') this.lastMainWriteMs = now;

    this.socket.write(chunk);
  }

  // ── Relay (always warm) ────────────────────────────────────────────────────

  feedStream(sourceUrl: string, backupUrl = '') {
    this.relaySourceUrl = sourceUrl;
    this.backupSourceUrl = backupUrl;
    this._startRelay(false);
  }

  private _startRelay(useBackup: boolean) {
    // Guard: prevent concurrent relay spawns
    if (this.relayStarting || this.relayProc) return;
    if (this.stopped) return;

    this.relayStarting = true;

    const url = (useBackup && this.backupSourceUrl) ? this.backupSourceUrl : this.relaySourceUrl;
    this.usingBackup = useBackup && !!this.backupSourceUrl;

    console.log(`[IcecastSource:${this.mount}] relay starting${this.usingBackup ? ' (BACKUP)' : ''}`);

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
    this.relayStarting = false;

    proc.stdout?.on('data', (chunk: Buffer) => {
      failCount = 0;
      this._write(chunk, 'main');
    });

    proc.on('exit', (code, signal) => {
      console.log(`[IcecastSource:${this.mount}] relay exit code=${code} signal=${signal}`);
      if (this.relayProc === proc) this.relayProc = null;
      this.relayStarting = false;

      if (!this.stopped) {
        failCount++;
        const tryBackup = !useBackup && failCount >= 3 && !!this.backupSourceUrl;
        if (tryBackup) {
          console.log(`[IcecastSource:${this.mount}] primary failed ${failCount}x — switching to backup`);
          this.emit('source_switch', { from: this.relaySourceUrl, to: this.backupSourceUrl });
          setTimeout(() => this._startRelay(true), 1000);
        } else {
          const returnToPrimary = useBackup && Math.random() < 0.25;
          setTimeout(() => this._startRelay(returnToPrimary ? false : useBackup), 2000);
        }
      }
    });
  }

  // ── Ad feed ───────────────────────────────────────────────────────────────

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

      proc.stderr?.on('data', () => {}); // drain to prevent pipe buffer blocking

      proc.on('exit', (code, signal) => {
        console.log(`[IcecastSource:${this.mount}] ad exit code=${code} signal=${signal} bytes=${adBytesWritten} socketOk=${this.connected}`);
        if (this.adProc === proc) this.adProc = null;
        this.mode = 'main';
        resolve({ finished: signal !== 'SIGKILL' });
      });
    });
  }

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
    this.removeAllListeners();
  }
}
