import http from 'http';
import { getSetting } from '../db';

/**
 * Updates ICY stream metadata via Icecast admin API.
 * Listeners in VLC/Winamp see the song title in real-time.
 */
export async function setIcyMetadata(mount: string, title: string): Promise<void> {
  try {
    const host = await getSetting('icecast_host') || 'localhost';
    const port = parseInt(await getSetting('icecast_port') || '8000');
    const password = await getSetting('icecast_admin_password') || 'hackme';

    const encoded = encodeURIComponent(title);
    const path = `/admin/metadata?mount=${mount}&mode=updinfo&song=${encoded}&charset=UTF-8`;
    const auth = Buffer.from(`admin:${password}`).toString('base64');

    await new Promise<void>((resolve, reject) => {
      const req = http.request({ host, port, path, method: 'GET',
        headers: { Authorization: `Basic ${auth}` },
      }, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve();
        else reject(new Error(`ICY metadata HTTP ${res.statusCode} for ${mount}`));
      });
      req.on('error', reject);
      req.setTimeout(3000, () => { req.destroy(); reject(new Error('ICY metadata timeout')); });
      req.end();
    });
  } catch (e: any) {
    // Non-fatal — metadata update failure should not disrupt audio
    console.warn(`[IcyMetadata] ${e.message}`);
  }
}
