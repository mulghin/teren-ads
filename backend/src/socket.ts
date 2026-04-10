import { Server as IOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import { regionManager } from './engine/RegionManager';

let io: IOServer | null = null;

export function initSocket(server: HttpServer) {
  io = new IOServer(server, {
    cors: { origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }
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
