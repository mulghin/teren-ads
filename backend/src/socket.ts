import { Server as IOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import { regionManager } from './engine/RegionManager';

let io: IOServer | null = null;

export function parseCorsOrigins(raw: string | undefined, fallback = 'http://localhost:5173'): string[] {
  const out: string[] = [];
  for (const entry of (raw || fallback).split(',')) {
    const s = entry.trim();
    if (!s) continue;
    try {
      const u = new URL(s);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        console.warn(`[cors] ignoring non-http(s) origin: ${s}`);
        continue;
      }
      out.push(u.origin);
    } catch {
      console.warn(`[cors] ignoring malformed origin: ${s}`);
    }
  }
  return out;
}

export function initSocket(server: HttpServer) {
  const corsOrigin = parseCorsOrigins(process.env.CORS_ORIGIN);
  io = new IOServer(server, {
    cors: { origin: corsOrigin }
  });

  // Authenticate socket connections via API key (same as HTTP)
  io.use((socket, next) => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) return next(); // Dev mode: no auth required

    const token = socket.handshake.auth?.token
      || socket.handshake.headers['x-api-key'];
    if (!token || token !== apiKey) {
      return next(new Error('Unauthorized'));
    }
    next();
  });

  io.on('connection', (socket) => {
    // Send current status on connect
    socket.emit('regions:status', regionManager.getStatus());

    socket.on('region:start', async ({ id }) => {
      try { await regionManager.startMain(id); } catch (e) { console.error('[socket] region:start error:', e); }
    });
    socket.on('region:stop', async ({ id }) => {
      try { await regionManager.stopRegion(id); } catch (e) { console.error('[socket] region:stop error:', e); }
    });
  });

  return io;
}

export function getIO(): IOServer | null {
  return io;
}
