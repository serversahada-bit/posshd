import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';

let socket: Socket | null = null;

const isLocalHostname = (hostname: string) => hostname === 'localhost' || hostname === '127.0.0.1';

export const getBrowserSocketUrl = (): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  if (process.env.NEXT_PUBLIC_WS_URL) {
    return process.env.NEXT_PUBLIC_WS_URL;
  }

  if (isLocalHostname(window.location.hostname)) {
    return `http://${window.location.hostname}:3001`;
  }

  return null;
};

export const getSocket = (): Socket | null => {
  if (typeof window === 'undefined') {
    throw new Error('getSocket() should only be called on the client side');
  }

  if (!socket) {
    const socketUrl = getBrowserSocketUrl();
    if (!socketUrl) {
      return null;
    }

    socket = io(socketUrl, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 10000,
    });
  }

  return socket;
};

export const disconnectSocket = () => {
  if (!socket) {
    return;
  }

  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
};
