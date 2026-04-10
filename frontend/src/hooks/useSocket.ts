import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

let globalSocket: Socket | null = null;

export function useSocket() {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!globalSocket) {
      globalSocket = io('http://localhost:4000');
    }
    const s = globalSocket;
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    setConnected(s.connected);
    return () => {
      s.off('connect');
      s.off('disconnect');
    };
  }, []);

  return { socket: globalSocket, connected };
}

export function useLogEntries(onEntry: (data: any) => void) {
  const cbRef = useRef(onEntry);
  cbRef.current = onEntry;

  useEffect(() => {
    if (!globalSocket) {
      globalSocket = io('http://localhost:4000');
    }
    const handler = (data: any) => cbRef.current(data);
    globalSocket.on('log:entry', handler);
    return () => {
      globalSocket?.off('log:entry', handler);
    };
  }, []);
}

export function useRegionUpdates(onUpdate: (data: any) => void) {
  const cbRef = useRef(onUpdate);
  cbRef.current = onUpdate;

  useEffect(() => {
    if (!globalSocket) {
      globalSocket = io('http://localhost:4000');
    }
    const handler = (data: any) => cbRef.current(data);
    globalSocket.on('region:update', handler);
    globalSocket.on('regions:status', (list: any[]) => list.forEach(r => cbRef.current(r)));
    return () => {
      globalSocket?.off('region:update', handler);
    };
  }, []);
}
