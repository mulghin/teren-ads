import { spawn } from 'child_process';
import { pool } from '../db';
import { getIO } from '../socket';

export interface TransmitterStatus {
  region_id: number;
  ip: string;
  online: boolean;
  latency_ms: number | null;
  checked_at: number;
}

/**
 * Pings each region's transmitter_ip on a fixed interval and broadcasts
 * the result via socket.io so the coverage map updates live.
 *
 * Uses the system `ping` binary (single packet, 2s timeout) — Node has no
 * built-in ICMP and the npm libs that wrap raw sockets all need root.
 */
class TransmitterPinger {
  private timer: NodeJS.Timeout | null = null;
  private intervalMs = 30_000;
  private statuses = new Map<number, TransmitterStatus>();

  start() {
    if (this.timer) return;
    this.tick();
    this.timer = setInterval(() => this.tick(), this.intervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  getAll(): TransmitterStatus[] {
    return [...this.statuses.values()];
  }

  private async tick() {
    let rows: Array<{ id: number; transmitter_ip: string | null }> = [];
    try {
      const r = await pool.query(
        `SELECT id, transmitter_ip FROM regions WHERE transmitter_ip IS NOT NULL AND transmitter_ip <> ''`
      );
      rows = r.rows;
    } catch (e) {
      console.error('[TransmitterPinger] db error', e);
      return;
    }

    await Promise.all(rows.map(async (row) => {
      const ip = (row.transmitter_ip || '').trim();
      if (!ip) return;
      const result = await pingOnce(ip);
      const status: TransmitterStatus = {
        region_id: row.id,
        ip,
        online: result.online,
        latency_ms: result.latencyMs,
        checked_at: Date.now(),
      };
      const prev = this.statuses.get(row.id);
      this.statuses.set(row.id, status);
      // Emit on every tick so reconnects pick up the latest.
      // Cheap: 5–10 regions, one small payload each.
      getIO()?.emit('transmitter:status', status);
      if (!prev || prev.online !== status.online) {
        console.log(`[TransmitterPinger] region#${row.id} ${ip} → ${status.online ? 'UP' : 'DOWN'}`);
      }
    }));
  }
}

/**
 * Spawn a single ping. Returns { online, latencyMs }. Linux ping uses -W
 * for timeout in seconds, macOS uses -t — accept both at call sites by
 * passing both forms isn't possible, so prefer -W (server is Linux).
 */
function pingOnce(ip: string): Promise<{ online: boolean; latencyMs: number | null }> {
  // Reject anything that doesn't look like an IPv4/IPv6 to avoid feeding
  // arbitrary strings to ping. The DB column is operator-controlled but
  // defense-in-depth is cheap.
  if (!/^[0-9a-fA-F.:]+$/.test(ip)) {
    return Promise.resolve({ online: false, latencyMs: null });
  }

  return new Promise((resolve) => {
    const proc = spawn('ping', ['-c', '1', '-W', '2', ip], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    let out = '';
    proc.stdout.on('data', (chunk: Buffer) => { out += chunk.toString(); });

    const timeout = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch {}
    }, 4000);

    proc.on('exit', (code) => {
      clearTimeout(timeout);
      if (code !== 0) return resolve({ online: false, latencyMs: null });
      const m = out.match(/time[=<]\s*([\d.]+)\s*ms/);
      resolve({ online: true, latencyMs: m ? parseFloat(m[1]) : null });
    });

    proc.on('error', () => {
      clearTimeout(timeout);
      resolve({ online: false, latencyMs: null });
    });
  });
}

export const transmitterPinger = new TransmitterPinger();
