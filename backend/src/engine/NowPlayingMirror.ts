import { getSetting } from '../db';
import { regionManager } from './RegionManager';
import { setIcyMetadata } from './IcyMetadata';

/**
 * Polls the master Icecast status JSON for the current song title and
 * mirrors it to every region mount that is currently in `main` mode.
 *
 * Why: the per-region ffmpeg relay carries MP3 audio but not the ICY
 * side-channel metadata, so region listeners saw an empty "Currently
 * playing" field. We push it through the Icecast admin metadata API
 * instead — same mechanism used for ad titles.
 */
class NowPlayingMirror {
  private timer: NodeJS.Timeout | null = null;
  private lastPushedByMount = new Map<string, string>();
  private lastMasterTitle = '';
  private readonly intervalMs = 4000;

  async start() {
    if (this.timer) return;
    await this.tick().catch(() => {});
    this.timer = setInterval(() => { this.tick().catch(() => {}); }, this.intervalMs);
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.lastPushedByMount.clear();
  }

  /** Called by RegionProcess when it clears metadata so the next poll force-re-pushes. */
  invalidate(mount: string) {
    this.lastPushedByMount.delete(mount.startsWith('/') ? mount : '/' + mount);
  }

  getMasterTitle(): string {
    return this.lastMasterTitle;
  }

  private async tick() {
    const sourceUrl = await getSetting('source_url');
    if (!sourceUrl) return;

    let masterMount: string;
    try {
      const u = new URL(sourceUrl);
      masterMount = u.pathname || '';
      if (!masterMount || masterMount === '/') return;
    } catch {
      return;
    }

    const title = await this.fetchMasterTitle(masterMount);
    if (title === null) return; // master unreachable — keep last known title

    this.lastMasterTitle = title;

    for (const rp of regionManager.getAll()) {
      if (rp.state.mode !== 'main') continue;
      const rawMount = rp.state.mount;
      if (!rawMount) continue;
      const mount = rawMount.startsWith('/') ? rawMount : '/' + rawMount;

      if (this.lastPushedByMount.get(mount) === title) continue;
      const result = await setIcyMetadata(mount, title);
      if (result.ok) this.lastPushedByMount.set(mount, title);
    }
  }

  private async fetchMasterTitle(masterMount: string): Promise<string | null> {
    const host = (await getSetting('icecast_host')) || 'localhost';
    const port = (await getSetting('icecast_port')) || '8000';
    const url = `http://${host}:${port}/status-json.xsl`;

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (!res.ok) return null;
      const json: any = await res.json();
      const rawSources = json?.icestats?.source;
      const sources: any[] = Array.isArray(rawSources) ? rawSources : (rawSources ? [rawSources] : []);
      const target = sources.find(s => {
        if (typeof s?.listenurl !== 'string') return false;
        try { return new URL(s.listenurl).pathname === masterMount; } catch { return false; }
      });
      if (!target) return null;
      const title = typeof target.title === 'string' ? target.title.trim()
        : typeof target.yp_currently_playing === 'string' ? target.yp_currently_playing.trim()
        : '';
      return title;
    } catch {
      return null;
    }
  }
}

export const nowPlayingMirror = new NowPlayingMirror();
