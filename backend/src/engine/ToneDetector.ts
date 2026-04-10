import { spawn, ChildProcess } from 'child_process';
import { getSetting } from '../db';
import { regionManager } from './RegionManager';

class ToneDetector {
  private proc: ChildProcess | null = null;
  private running = false;
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

    // FFmpeg: bandpass at two frequencies, detect amplitude spikes
    // We run two separate analysis passes using lavfi
    const filterStart = `asplit=2[a][b],[a]bandpass=f=${startHz}:width_type=h:w=200,ametadata=mode=print:key=lavfi.astats.Overall.Peak_level[c],[b]bandpass=f=${stopHz}:width_type=h:w=200,ametadata=mode=print:key=lavfi.astats.Overall.Peak_level[d],[c][d]amerge`;

    const args = [
      '-reconnect', '1',
      '-reconnect_at_eof', '1',
      '-reconnect_streamed', '1',
      '-i', sourceUrl,
      '-af', [
        `asplit=2[s][st]`,
        `[s]bandpass=f=${startHz}:width_type=h:w=300,astats=metadata=1:reset=1,ametadata=mode=print:file=-:key=lavfi.astats.Overall.RMS_level[start_out]`,
        `[st]bandpass=f=${stopHz}:width_type=h:w=300,astats=metadata=1:reset=1,ametadata=mode=print:file=-:key=lavfi.astats.Overall.RMS_level[stop_out]`,
        `[start_out]anull`,
        `[stop_out]anull`,
      ].join(';'),
      '-f', 'null', '-',
    ];

    // Simplified approach: use silencedetect on bandpassed signal
    this.startSimpleDetector(sourceUrl, startHz, stopHz, durationSec);
  }

  private startSimpleDetector(sourceUrl: string, startHz: number, stopHz: number, durationSec: number) {
    this.running = true;
    const threshold = -30; // dB above noise floor to detect tone

    // Detector for START tone
    const detectStart = () => {
      const proc = spawn('ffmpeg', [
        '-reconnect', '1', '-reconnect_at_eof', '1', '-reconnect_streamed', '1',
        '-i', sourceUrl,
        '-af', `bandpass=f=${startHz}:width_type=h:w=200,silencedetect=n=${threshold}dB:d=${durationSec}`,
        '-f', 'null', '-',
      ], { stdio: ['ignore', 'ignore', 'pipe'] });

      proc.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        if (text.includes('silence_end') && !this.startCooldown) {
          this.handleTone('start');
        }
      });

      proc.on('exit', () => {
        if (this.running) setTimeout(detectStart, 2000);
      });

      this.proc = proc;
    };

    // Detector for STOP tone
    const detectStop = spawn('ffmpeg', [
      '-reconnect', '1', '-reconnect_at_eof', '1', '-reconnect_streamed', '1',
      '-i', sourceUrl,
      '-af', `bandpass=f=${stopHz}:width_type=h:w=200,silencedetect=n=${threshold}dB:d=${durationSec}`,
      '-f', 'null', '-',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });

    detectStop.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      if (text.includes('silence_end') && !this.stopCooldown) {
        this.handleTone('stop');
      }
    });

    detectStop.on('exit', () => {
      if (this.running) setTimeout(() => this.startSimpleDetector(sourceUrl, startHz, stopHz, durationSec), 2000);
    });

    detectStart();
  }

  private handleTone(type: 'start' | 'stop') {
    if (type === 'start') {
      this.startCooldown = true;
      setTimeout(() => { this.startCooldown = false; }, 5000);
    } else {
      this.stopCooldown = true;
      setTimeout(() => { this.stopCooldown = false; }, 5000);
    }
    console.log(`[ToneDetector] Detected ${type.toUpperCase()} tone`);
    regionManager.handleTone(type).catch(console.error);
  }

  stop() {
    this.running = false;
    this.proc?.kill();
    this.proc = null;
  }

  async restart() {
    this.stop();
    await new Promise(r => setTimeout(r, 1000));
    await this.start();
  }
}

export const toneDetector = new ToneDetector();
