import { io, Socket } from 'socket.io-client';

const FALLBACK_WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';

let socket: Socket | null = null;

// getSocket() hanya digunakan oleh client (React Frontend)
export const getSocket = (): Socket => {
  if (typeof window === 'undefined') {
    throw new Error('getSocket() should only be called on the client side');
  }
  
  if (!socket) {
    const WS_URL = process.env.NEXT_PUBLIC_WS_URL || `http://${window.location.hostname}:3001`;
    socket = io(WS_URL, {
      transports: ['websocket', 'polling'], // Fallback mechanism
      reconnectionAttempts: 5,
    });
  }
  return socket;
};

// emitEvent() digunakan oleh Backend API Route untuk menembak event via HTTP POST
export const emitEvent = async (eventName: string, payload?: any) => {
  try {
    const BACKEND_WS_URL = process.env.WS_URL || 'http://localhost:3001';
    await fetch(`${BACKEND_WS_URL}/emit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventName, payload }),
    });
  } catch (err: any) {
    console.error('Gagal mengirim event WebSocket via HTTP:', err.message);
  }
};
