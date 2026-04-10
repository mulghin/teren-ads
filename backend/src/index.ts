import 'express-async-errors';
import express from 'express';
import http from 'http';
import cors from 'cors';
import path from 'path';
import { initDb } from './db';
import { initSocket } from './socket';
import { regionManager } from './engine/RegionManager';
import { toneDetector } from './engine/ToneDetector';
import { scheduler } from './engine/Scheduler';
import regionsRouter from './routes/regions';
import playlistsRouter from './routes/playlists';
import settingsRouter from './routes/settings';
import schedulesRouter from './routes/schedules';
import logsRouter from './routes/logs';
import regionSchedulesRouter from './routes/region-schedules';

const PORT = parseInt(process.env.PORT || '4000');

async function main() {
  await initDb();

  const app = express();
  const server = http.createServer(app);

  app.use(cors());
  app.use(express.json());

  // Serve uploaded files
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  // API routes
  app.use('/api/regions', regionsRouter);
  app.use('/api/regions/:id/time-schedules', regionSchedulesRouter);
  app.use('/api/playlists', playlistsRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/schedules', schedulesRouter);
  app.use('/api/logs', logsRouter);

  // Status endpoint
  app.get('/api/status', (req, res) => {
    res.json({ ok: true, regions: regionManager.getStatus() });
  });

  // Error handler
  app.use((err: any, req: any, res: any, next: any) => {
    console.error('[error]', err.message);
    res.status(500).json({ error: err.message });
  });

  initSocket(server);

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[server] Port ${PORT} in use — retrying in 3s`);
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
}

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
});

process.on('SIGTERM', () => {
  console.log('[PROCESS] Received SIGTERM — PM2 restart or system shutdown');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[PROCESS] Received SIGINT');
  process.exit(0);});

process.on('exit', (code) => {
  console.log(`[PROCESS] Exiting with code=${code}`);
});

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
