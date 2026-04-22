import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

// Connect to same origin — works in dev (proxied via /socket.io) and production
// Pass API key if configured (VITE_API_KEY env var)
const API_KEY = import.meta.env.VITE_API_KEY as string | undefined;

let globalSocket: Socket | null = null;
let globalSocketKey: string | undefined;

function getSocket(): Socket {
  if (globalSocket && globalSocketKey !== API_KEY) {
    try { globalSocket.disconnect(); } catch {}
    globalSocket = null;
  }
  if (!globalSocket) {
    globalSocket = io({
      auth: API_KEY ? { token: API_KEY } : undefined,
    });
    globalSocketKey = API_KEY;
  }
  return globalSocket;
}

export function disconnectSocket() {
  if (globalSocket) {
    try { globalSocket.disconnect(); } catch {}
    globalSocket = null;
    globalSocketKey = undefined;
  }
}

if (typeof import.meta.hot !== 'undefined') {
  import.meta.hot.dispose(() => disconnectSocket());
}

export function useSocket() {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const s = getSocket();
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    setConnected(s.connected);
    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
    };
  }, []);

  return { socket: globalSocket, connected };
}

export function useLogEntries(onEntry: (data: any) => void) {
  const cbRef = useRef(onEntry);
  cbRef.current = onEntry;

  useEffect(() => {
    const s = getSocket();
    const handler = (data: any) => cbRef.current(data);
    s.on('log:entry', handler);
    return () => { s.off('log:entry', handler); };
  }, []);
}

export function useRegionUpdates(onUpdate: (data: any) => void) {
  const cbRef = useRef(onUpdate);
  cbRef.current = onUpdate;

  useEffect(() => {
    const s = getSocket();
    const handleUpdate = (data: any) => cbRef.current(data);
    const handleStatus = (list: any[]) => list.forEach(r => cbRef.current(r));
    s.on('region:update', handleUpdate);
    s.on('regions:status', handleStatus);
    return () => {
      s.off('region:update', handleUpdate);
      s.off('regions:status', handleStatus); // was missing — memory leak fixed
    };
  }, []);
}
