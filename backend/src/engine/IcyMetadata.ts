import http from 'http';
import { getSetting } from '../db';

export type IcyResult =
  | { ok: true }
  | { ok: false; status?: number; error: string };

// Shared across the process so the UI can surface "admin auth wrong" without
// each caller threading state. Updated by every setIcyMetadata call.
export const icyHealth = {
  lastTriedAt: null as number | null,
  lastSuccessAt: null as number | null,
  lastStatus: null as number | null,   // HTTP status of the most recent attempt
  lastError: null as string | null,    // human-readable message
};

/**
 * Updates ICY stream metadata via Icecast admin API.
 * Listeners in VLC/Winamp see the song title in real-time.
 */
export async function setIcyMetadata(mount: string, title: string): Promise<IcyResult> {
  icyHealth.lastTriedAt = Date.now();
  try {
    const host = await getSetting('icecast_host') || 'localhost';
    const port = parseInt(await getSetting('icecast_port') || '8000');
    const password = await getSetting('icecast_admin_password') || 'hackme';

    const encodedMount = encodeURIComponent(mount);
    const encodedTitle = encodeURIComponent(title);
    const path = `/admin/metadata?mount=${encodedMount}&mode=updinfo&song=${encodedTitle}&charset=UTF-8`;
    const auth = Buffer.from(`admin:${password}`).toString('base64');

    const status = await new Promise<number>((resolve, reject) => {
      const req = http.request({ host, port, path, method: 'GET',
        headers: { Authorization: `Basic ${auth}` },
      }, (res) => {
        res.resume();
        resolve(res.statusCode || 0);
      });
      req.on('error', reject);
      req.setTimeout(3000, () => { req.destroy(); reject(new Error('ICY metadata timeout')); });
      req.end();
    });

    icyHealth.lastStatus = status;
    if (status === 200) {
      icyHealth.lastSuccessAt = Date.now();
      icyHealth.lastError = null;
      return { ok: true };
    }
    const msg = `ICY metadata HTTP ${status} for ${mount}`;
    icyHealth.lastError = msg;
    console.warn(`[IcyMetadata] ${msg}`);
    return { ok: false, status, error: msg };
  } catch (e: any) {
    icyHealth.lastStatus = null;
    icyHealth.lastError = e?.message || String(e);
    console.warn(`[IcyMetadata] ${icyHealth.lastError}`);
    return { ok: false, error: icyHealth.lastError! };
  }
}
