import https from 'https';
import http from 'http';
import dns from 'dns/promises';
import net from 'net';
import { getSetting } from '../db';

export interface WebhookPayload {
  event: 'ad_start' | 'ad_end' | 'silence_alert' | 'source_switch';
  region_id: number;
  region_name: string;
  playlist_id?: number;
  trigger_type?: string;
  reason?: string;
  url?: string;
  ts: string;
}

const ALLOW_PRIVATE = process.env.WEBHOOK_ALLOW_PRIVATE === '1';

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isFinite(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;           // link-local
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true;                         // multicast/reserved
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::' ) return true;
  if (lower.startsWith('fe80:')) return true;        // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // ULA
  if (lower.startsWith('ff')) return true;           // multicast
  if (lower.startsWith('::ffff:')) {
    const v4 = lower.slice(7);
    if (net.isIPv4(v4)) return isPrivateIPv4(v4);
  }
  return false;
}

async function resolveAndCheck(hostname: string): Promise<{ ok: boolean; reason?: string }> {
  if (ALLOW_PRIVATE) return { ok: true };
  if (net.isIP(hostname)) {
    const priv = net.isIPv4(hostname) ? isPrivateIPv4(hostname) : isPrivateIPv6(hostname);
    if (priv) return { ok: false, reason: `private/loopback address ${hostname}` };
    return { ok: true };
  }
  const lower = hostname.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.localhost') || lower.endsWith('.local') || lower.endsWith('.internal')) {
    return { ok: false, reason: `blocked hostname ${hostname}` };
  }
  try {
    const addrs = await dns.lookup(hostname, { all: true });
    for (const a of addrs) {
      const priv = a.family === 4 ? isPrivateIPv4(a.address) : isPrivateIPv6(a.address);
      if (priv) return { ok: false, reason: `${hostname} resolves to private ${a.address}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: `DNS lookup failed for ${hostname}: ${e.message}` };
  }
}

async function postOnce(url: URL, body: string, secret: string): Promise<void> {
  const mod = url.protocol === 'https:' ? https : http;
  await new Promise<void>((resolve, reject) => {
    const req = mod.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...(secret ? { 'X-Webhook-Secret': secret } : {}),
      },
    }, (res) => {
      res.resume();
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) resolve();
      else reject(new Error(`HTTP ${res.statusCode}`));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('Webhook timeout')); });
    req.write(body);
    req.end();
  });
}

export async function fireWebhook(payload: WebhookPayload): Promise<void> {
  const webhookUrl = await getSetting('webhook_url');
  if (!webhookUrl) return;

  let parsed: URL;
  try {
    parsed = new URL(webhookUrl);
  } catch {
    console.warn(`[Webhook] Invalid URL: ${webhookUrl}`);
    return;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    console.warn(`[Webhook] Blocked non-HTTP URL protocol: ${parsed.protocol}`);
    return;
  }

  const check = await resolveAndCheck(parsed.hostname);
  if (!check.ok) {
    console.warn(`[Webhook] SSRF guard: ${check.reason}`);
    return;
  }

  const body = JSON.stringify(payload);
  const secret = await getSetting('webhook_secret');

  const attempts = 3;
  for (let i = 0; i < attempts; i++) {
    try {
      await postOnce(parsed, body, secret);
      return;
    } catch (e: any) {
      if (i === attempts - 1) {
        console.warn(`[Webhook] Dropped event ${payload.event} region=${payload.region_id} after ${attempts} attempts: ${e.message}`);
        return;
      }
      await new Promise(r => setTimeout(r, 500 * Math.pow(2, i))); // 500ms, 1s
    }
  }
}
