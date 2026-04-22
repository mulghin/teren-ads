import { Server as IOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import { regionManager } from './engine/RegionManager';

let io: IOServer | null = null;

export function parseCorsOrigins(raw: string | undefined, fallback = 'http://localhost:3030'): string[] {
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

// Extract tads.sid cookie value without pulling in a full cookie parser.
// Returns null if the header is missing or the cookie isn't present.
function extractSessionCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === 'tads.sid') return decodeURIComponent(v.join('='));
  }
  return null;
}

export function initSocket(server: HttpServer) {
  const corsOrigin = parseCorsOrigins(process.env.CORS_ORIGIN);
  io = new IOServer(server, {
    cors: { origin: corsOrigin, credentials: true },
  });

  // Socket auth: require the browser to have a session cookie. We don't
  // validate the signature here — express-session will reject an invalid
  // cookie on the first HTTP call anyway, and socket events never bypass
  // the session-guarded REST layer. A missing cookie means "never logged
  // in", which we block here so Socket.IO doesn't stream status to the
  // whole internet.
  io.use((socket, next) => {
    const cookie = socket.handshake.headers.cookie || '';
    const sid = extractSessionCookie(cookie);
    if (!sid) return next(new Error('Unauthorized'));
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
