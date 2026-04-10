import { Server as IOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import { regionManager } from './engine/RegionManager';

let io: IOServer | null = null;

export function initSocket(server: HttpServer) {
  io = new IOServer(server, {
    cors: { origin: '*' }
  });

  io.on('connection', (socket) => {
    // Send current status on connect
    socket.emit('regions:status', regionManager.getStatus());

    socket.on('region:start', async ({ id }) => {
      await regionManager.startMain(id);
    });
    socket.on('region:stop', async ({ id }) => {
      await regionManager.stopRegion(id);
    });
  });

  return io;
}

export function getIO(): IOServer | null {
  return io;
}
