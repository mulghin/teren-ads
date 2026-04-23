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
    // Icecast's /admin/metadata accepts the mount's source password (user=source)
    // OR the global admin password (user=admin). On the live rig the source pw
    // was working where admin-auth returned 401 — fall back between the two so
    // either one being right is enough.
    const sourcePassword = await getSetting('icecast_source_password') || '';
    const adminPassword = await getSetting('icecast_admin_password') || '';

    const encodedMount = encodeURIComponent(mount);
    const encodedTitle = encodeURIComponent(title);
    const path = `/admin/metadata?mount=${encodedMount}&mode=updinfo&song=${encodedTitle}&charset=UTF-8`;

    const attempts: Array<{ user: string; pw: string }> = [];
    if (sourcePassword) attempts.push({ user: 'source', pw: sourcePassword });
    if (adminPassword)  attempts.push({ user: 'admin',  pw: adminPassword });
    if (attempts.length === 0) attempts.push({ user: 'admin', pw: 'hackme' });

    let lastStatus = 0;
    for (const { user, pw } of attempts) {
      const auth = Buffer.from(`${user}:${pw}`).toString('base64');
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
      lastStatus = status;
      if (status === 200) {
        icyHealth.lastStatus = 200;
        icyHealth.lastSuccessAt = Date.now();
        icyHealth.lastError = null;
        return { ok: true };
      }
      // Only retry the next credential on auth failure — other errors (5xx,
      // mount-not-found) won't be helped by switching user.
      if (status !== 401 && status !== 403) break;
    }

    icyHealth.lastStatus = lastStatus;
    const msg = `ICY metadata HTTP ${lastStatus} for ${mount}`;
    icyHealth.lastError = msg;
    console.warn(`[IcyMetadata] ${msg}`);
    return { ok: false, status: lastStatus, error: msg };
  } catch (e: any) {
    icyHealth.lastStatus = null;
    icyHealth.lastError = e?.message || String(e);
    console.warn(`[IcyMetadata] ${icyHealth.lastError}`);
    return { ok: false, error: icyHealth.lastError! };
  }
}
