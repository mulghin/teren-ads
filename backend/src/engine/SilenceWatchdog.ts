import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { getSetting } from '../db';
import { logEvent } from '../logger';
import { fireWebhook } from './WebhookService';

/**
 * Monitors the source stream for silence.
 * Emits 'silence' when source goes silent for N seconds.
 * Emits 'resumed' when audio resumes.
 */
export class SilenceWatchdog extends EventEmitter {
  private proc: ChildProcess | null = null;
  private running = false;
  private silentSince: number | null = null;
  private alerted = false;
  private sourceUrl = '';
  private thresholdDb = -50;
  private durationSec = 10;

  async start() {
    const enabled = await getSetting('silence_alerts_enabled');
    if (enabled !== 'true') return;

    const sourceUrl = await getSetting('source_url');
    if (!sourceUrl) return;

    this.sourceUrl = sourceUrl;
    this.thresholdDb = parseFloat(await getSetting('silence_threshold_db') || '-50');
    this.durationSec = parseFloat(await getSetting('silence_duration_sec') || '10');
    this.running = true;
    this._spawn();
  }

  private _spawn() {
    if (!this.running) return;

    const proc = spawn('ffmpeg', [
      '-reconnect', '1', '-reconnect_at_eof', '1', '-reconnect_streamed', '1',
      '-i', this.sourceUrl,
      '-af', `silencedetect=n=${this.thresholdDb}dB:d=2`,
      '-f', 'null', '-',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });

    this.proc = proc;

    proc.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();

      if (text.includes('silence_start')) {
        if (!this.silentSince) {
          this.silentSince = Date.now();
          this.alerted = false;
          this._checkSilenceTimeout();
        }
      }

      if (text.includes('silence_end')) {
        const wasSilent = this.silentSince !== null;
        this.silentSince = null;
        if (wasSilent && this.alerted) {
          this.alerted = false;
          this.emit('resumed');
          logEvent('info', '🔊 Джерело відновлено — аудіо є');
        }
      }
    });

    proc.on('exit', () => {
      this.proc = null;
      if (this.running) setTimeout(() => this._spawn(), 3000);
    });
  }

  private _checkSilenceTimeout() {
    const capturedSince = this.silentSince;
    if (!capturedSince) return;
    setTimeout(() => {
      if (this.silentSince !== capturedSince || this.alerted) return;
      const elapsed = (Date.now() - capturedSince) / 1000;
      if (elapsed >= this.durationSec) {
        this.alerted = true;
        const msg = `🔇 Тиша в ефірі вже ${Math.round(elapsed)}с! Перевірте джерело: ${this.sourceUrl}`;
        logEvent('error', msg);
        this.emit('silence', { sourceUrl: this.sourceUrl, durationSec: elapsed });
        fireWebhook({
          event: 'silence_alert',
          region_id: 0,
          region_name: 'system',
          reason: `Source silent for ${Math.round(elapsed)}s`,
          url: this.sourceUrl,
          ts: new Date().toISOString(),
        });
      }
    }, this.durationSec * 1000 + 500);
  }

  stop() {
    this.running = false;
    this.proc?.kill('SIGKILL');
    this.proc = null;
  }

  async restart() {
    this.stop();
    await new Promise(r => setTimeout(r, 1000));
    await this.start();
  }
}

export const silenceWatchdog = new SilenceWatchdog();
