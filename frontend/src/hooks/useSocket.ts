import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

// Connect to same origin; browser attaches the session cookie automatically
// when `withCredentials: true` is set. Backend's socket.io CORS config must
// allow credentials against the frontend origin.
let globalSocket: Socket | null = null;

function getSocket(): Socket {
  if (!globalSocket) {
    globalSocket = io({ withCredentials: true });
  }
  return globalSocket;
}

export function disconnectSocket() {
  if (globalSocket) {
    try { globalSocket.disconnect(); } catch {}
    globalSocket = null;
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

// Broadcast of a region's DB row (event: 'created' | 'updated' | 'deleted'),
// used to keep config-derived UI (enabled flag, name) in sync across clients.
export function useRegionConfig(onEvent: (data: any) => void) {
  const cbRef = useRef(onEvent);
  cbRef.current = onEvent;

  useEffect(() => {
    const s = getSocket();
    const handler = (data: any) => cbRef.current(data);
    s.on('region:config', handler);
    return () => { s.off('region:config', handler); };
  }, []);
}
