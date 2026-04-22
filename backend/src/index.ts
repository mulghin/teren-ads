import 'express-async-errors';
import express from 'express';
import http from 'http';
import cors from 'cors';
import path from 'path';
import { randomUUID } from 'crypto';
import { initDb, pool } from './db';
import { initSocket, parseCorsOrigins } from './socket';
import { regionManager } from './engine/RegionManager';
import { toneDetector } from './engine/ToneDetector';
import { scheduler } from './engine/Scheduler';
import { silenceWatchdog } from './engine/SilenceWatchdog';
import { nowPlayingMirror } from './engine/NowPlayingMirror';
import regionsRouter from './routes/regions';
import playlistsRouter from './routes/playlists';
import settingsRouter from './routes/settings';
import schedulesRouter from './routes/schedules';
import logsRouter from './routes/logs';
import regionSchedulesRouter from './routes/region-schedules';
import reportsRouter from './routes/reports';
import { apiAuth } from './middleware/auth';

const PORT = parseInt(process.env.PORT || '4000');

async function main() {
  await initDb();

  const app = express();
  const server = http.createServer(app);

  const corsOrigin = parseCorsOrigins(process.env.CORS_ORIGIN);
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json());

  app.use('/uploads', apiAuth, express.static(path.join(process.cwd(), 'uploads')));

  app.use('/api/regions', apiAuth, regionsRouter);
  app.use('/api/regions/:id/time-schedules', apiAuth, regionSchedulesRouter);
  app.use('/api/playlists', apiAuth, playlistsRouter);
  app.use('/api/settings', apiAuth, settingsRouter);
  app.use('/api/schedules', apiAuth, schedulesRouter);
  app.use('/api/logs', apiAuth, logsRouter);
  app.use('/api/reports', apiAuth, reportsRouter);

  // Status endpoint with Icecast listener counts
  app.get('/api/status', apiAuth, async (req, res) => {
    const regions = regionManager.getStatus();

    // Try to fetch listener counts from Icecast
    let icecastSources: any[] = [];
    try {
      const { getSetting } = await import('./db'); // lazy import kept intentional — avoid circular dep risk at startup
      const host = (await getSetting('icecast_host')) || 'localhost';
      const port = (await getSetting('icecast_port')) || '8000';
      const url = `http://${host}:${port}/status-json.xsl`;
      const iceRes = await fetch(url, { signal: AbortSignal.timeout(2000) });
      const json = await iceRes.json() as any;
      icecastSources = Array.isArray(json?.icestats?.source)
        ? json.icestats.source
        : (json?.icestats?.source ? [json.icestats.source] : []);
    } catch {}

    const listenerMap: Record<string, number> = {};
    for (const s of icecastSources) {
      if (s.listenurl) {
        const mount = '/' + s.listenurl.split('/').slice(3).join('/');
        listenerMap[mount] = s.listeners ?? 0;
      }
    }

    res.json({
      ok: true,
      regions: regions.map(r => ({
        ...r,
        listeners: listenerMap[r.mount] ?? 0,
      })),
      icecastSources,
      masterTitle: nowPlayingMirror.getMasterTitle(),
    });
  });

  const isProd = process.env.NODE_ENV === 'production';
  app.use((err: any, req: any, res: any, next: any) => {
    const reqId = randomUUID().slice(0, 8);
    console.error(`[error ${reqId}]`, req.method, req.originalUrl, err);
    const payload: any = { error: 'internal server error', requestId: reqId };
    if (!isProd) payload.debug = err?.message;
    res.status(500).json(payload);
  });

  initSocket(server);

  let eaddrRetries = 0;
  const EADDR_MAX = 5;
  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      eaddrRetries += 1;
      if (eaddrRetries > EADDR_MAX) {
        console.error(`[server] Port ${PORT} still in use after ${EADDR_MAX} retries — exiting`);
        process.exit(1);
      }
      console.error(`[server] Port ${PORT} in use — retrying in 3s (${eaddrRetries}/${EADDR_MAX})`);
      setTimeout(() => server.listen(PORT), 3000);
    } else {
      console.error('[server] Fatal listen error:', err);
      process.exit(1);
    }
  });

  server.listen(PORT, () => {
    console.log(`[teren-ads] Backend running on http://localhost:${PORT}`);
  });

  await regionManager.init();
  await scheduler.init();
  await toneDetector.start();
  await silenceWatchdog.start();
  await nowPlayingMirror.start();
}

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
});

async function shutdown(signal: string) {
  console.log(`[PROCESS] Received ${signal} — shutting down gracefully`);
  try {
    nowPlayingMirror.stop();
    toneDetector.stop();
    silenceWatchdog.stop();
    scheduler.stop();
    await regionManager.stop();
    await pool.end();
  } catch (e) {
    console.error('[PROCESS] Error during shutdown:', e);
  }
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('exit', (code) => {
  console.log(`[PROCESS] Exiting with code=${code}`);
});

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
