import 'express-async-errors';
import express from 'express';
import session from 'express-session';
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
import authRouter from './routes/auth';
import usersRouter from './routes/users';
import { requireAuth } from './middleware/auth';
import { makeSameOrigin } from './middleware/csrf';
import { migrateUsers } from './auth/users';

const PORT = parseInt(process.env.PORT || '4000');

// Fail-fast — a fallback constant would let sessions survive a process
// restart on any box that shipped without SESSION_SECRET set, silently
// weakening auth. Generate with: openssl rand -hex 32
const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
  console.error('[fatal] SESSION_SECRET env var required (min 32 chars). Refusing to start.');
  console.error('        Generate one with: openssl rand -hex 32');
  process.exit(1);
}
const SECURE_COOKIES = process.env.SECURE_COOKIES === '1';

async function main() {
  await initDb();
  migrateUsers();

  const app = express();
  const server = http.createServer(app);

  app.set('trust proxy', 1); // behind vite proxy in dev; optional nginx in prod

  const corsOrigin = parseCorsOrigins(process.env.CORS_ORIGIN);
  // credentials:true lets the browser attach the session cookie on cross-
  // origin fetches. Origin list must be explicit — a reflected CORS origin
  // with credentials would let any site read our authenticated responses.
  app.use(cors({ origin: corsOrigin, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));

  app.use(session({
    name: 'tads.sid',
    secret: SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: SECURE_COOKIES,
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
    },
  }));

  // CSRF belt-and-braces on top of SameSite=strict + credentials-required
  // CORS. Same-origin dev (via vite proxy) and configured allowed origins
  // both pass cleanly.
  app.use(makeSameOrigin(corsOrigin));

  // Auth endpoints (login / logout / me / setup / status) — public.
  app.use('/api/auth', authRouter);

  // Every other /api route below requires a valid session.
  app.use('/uploads', requireAuth, express.static(path.join(process.cwd(), 'uploads')));

  app.use('/api/users', requireAuth, usersRouter);
  app.use('/api/regions', requireAuth, regionsRouter);
  app.use('/api/regions/:id/time-schedules', requireAuth, regionSchedulesRouter);
  app.use('/api/playlists', requireAuth, playlistsRouter);
  app.use('/api/settings', requireAuth, settingsRouter);
  app.use('/api/schedules', requireAuth, schedulesRouter);
  app.use('/api/logs', requireAuth, logsRouter);
  app.use('/api/reports', requireAuth, reportsRouter);

  // Status endpoint with Icecast listener counts
  app.get('/api/status', requireAuth, async (req, res) => {
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
