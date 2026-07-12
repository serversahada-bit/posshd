import { io, Socket } from 'socket.io-client';

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

const getServerSocketUrl = (): string | null => {
  if (process.env.WS_URL) {
    return process.env.WS_URL;
  }

  if (process.env.NODE_ENV !== 'production') {
    return 'http://localhost:3001';
  }

  return null;
};

// getSocket() hanya digunakan oleh client (React Frontend)
export const getSocket = (): Socket | null => {
  if (typeof window === 'undefined') {
    throw new Error('getSocket() should only be called on the client side');
  }
  
  if (!socket) {
    const WS_URL = getBrowserSocketUrl();
    if (!WS_URL) {
      return null;
    }

    socket = io(WS_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
    });
  }
  return socket;
};

// emitEvent() digunakan oleh Backend API Route untuk menembak event via HTTP POST
export const emitEvent = async (eventName: string, payload?: unknown) => {
  try {
    const BACKEND_WS_URL = getServerSocketUrl();
    if (!BACKEND_WS_URL) {
      console.warn(`Socket server URL tidak dikonfigurasi. Event "${eventName}" tidak dikirim.`);
      return;
    }

    await fetch(`${BACKEND_WS_URL}/emit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventName, payload }),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Gagal mengirim event WebSocket via HTTP:', message);
  }
};
