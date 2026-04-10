import { spawn, ChildProcess } from 'child_process';
import { getSetting } from '../db';
import { regionManager } from './RegionManager';

class ToneDetector {
  private procs: ChildProcess[] = []; // track ALL spawned processes
  private running = false;
  private startCooldownTimer: NodeJS.Timeout | null = null;
  private stopCooldownTimer: NodeJS.Timeout | null = null;
  private startCooldown = false;
  private stopCooldown = false;

  async start() {
    if (this.running) return;
    const enabled = await getSetting('tone_detection_enabled');
    if (enabled !== 'true') return;

    const sourceUrl = await getSetting('source_url');
    if (!sourceUrl) return;

    const startHz = parseInt(await getSetting('tone_start_hz') || '17500');
    const stopHz = parseInt(await getSetting('tone_stop_hz') || '18500');
    const durationMs = parseInt(await getSetting('tone_duration_ms') || '500');
    const durationSec = durationMs / 1000;

    this.running = true;
    this._startDetectors(sourceUrl, startHz, stopHz, durationSec);
  }

  private _startDetectors(sourceUrl: string, startHz: number, stopHz: number, durationSec: number) {
    const threshold = -30;

    // START tone detector
    const spawnDetector = (hz: number, type: 'start' | 'stop') => {
      const proc = spawn('ffmpeg', [
        '-reconnect', '1', '-reconnect_at_eof', '1', '-reconnect_streamed', '1',
        '-i', sourceUrl,
        '-af', `bandpass=f=${hz}:width_type=h:w=200,silencedetect=n=${threshold}dB:d=${durationSec}`,
        '-f', 'null', '-',
      ], { stdio: ['ignore', 'ignore', 'pipe'] });

      this.procs.push(proc);

      proc.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        if (text.includes('silence_end')) {
          if (type === 'start' && !this.startCooldown) this._handleTone('start');
          if (type === 'stop' && !this.stopCooldown) this._handleTone('stop');
        }
      });

      proc.on('exit', () => {
        this.procs = this.procs.filter(p => p !== proc);
        if (this.running) {
          setTimeout(() => {
            if (this.running) spawnDetector(hz, type);
          }, 2000);
        }
      });

      return proc;
    };

    spawnDetector(startHz, 'start');
    spawnDetector(stopHz, 'stop');
  }

  private _handleTone(type: 'start' | 'stop') {
    if (type === 'start') {
      this.startCooldown = true;
      if (this.startCooldownTimer) clearTimeout(this.startCooldownTimer);
      this.startCooldownTimer = setTimeout(() => {
        this.startCooldown = false;
        this.startCooldownTimer = null;
      }, 5000);
    } else {
      this.stopCooldown = true;
      if (this.stopCooldownTimer) clearTimeout(this.stopCooldownTimer);
      this.stopCooldownTimer = setTimeout(() => {
        this.stopCooldown = false;
        this.stopCooldownTimer = null;
      }, 5000);
    }

    console.log(`[ToneDetector] Detected ${type.toUpperCase()} tone`);
    regionManager.handleTone(type).catch(console.error);
  }

  stop() {
    this.running = false;
    if (this.startCooldownTimer) { clearTimeout(this.startCooldownTimer); this.startCooldownTimer = null; }
    if (this.stopCooldownTimer) { clearTimeout(this.stopCooldownTimer); this.stopCooldownTimer = null; }
    // Kill ALL tracked processes
    for (const p of this.procs) {
      try { p.kill('SIGKILL'); } catch {}
    }
    this.procs = [];
  }

  async restart() {
    this.stop();
    await new Promise(r => setTimeout(r, 1000));
    await this.start();
  }
}

export const toneDetector = new ToneDetector();
