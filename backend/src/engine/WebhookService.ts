import https from 'https';
import http from 'http';
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

export async function fireWebhook(payload: WebhookPayload): Promise<void> {
  const webhookUrl = await getSetting('webhook_url');
  if (!webhookUrl) return;

  try {
    const body = JSON.stringify(payload);
    const secret = await getSetting('webhook_secret');

    const parsed = new URL(webhookUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      console.warn(`[Webhook] Blocked non-HTTP URL protocol: ${parsed.protocol}`);
      return;
    }
    const mod = parsed.protocol === 'https:' ? https : http;

    await new Promise<void>((resolve, reject) => {
      const req = mod.request({
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          ...(secret ? { 'X-Webhook-Secret': secret } : {}),
        },
      }, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', reject);
      req.setTimeout(5000, () => { req.destroy(); reject(new Error('Webhook timeout')); });
      req.write(body);
      req.end();
    });
  } catch (e: any) {
    console.warn(`[Webhook] Failed: ${e.message}`);
  }
}
