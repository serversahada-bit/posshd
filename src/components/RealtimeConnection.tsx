'use client';

import { useEffect } from 'react';
import { getSocket } from '@/lib/socket';

export default function RealtimeConnection() {
  useEffect(() => {
    const socket = getSocket();

    if (!socket) {
      console.warn('RealtimeConnection: NEXT_PUBLIC_WS_URL belum dikonfigurasi atau URL socket tidak tersedia.');
      return;
    }

    const handleConnect = () => {
      console.log(`Realtime socket connected: ${socket.id}`);
    };

    const handleConnectError = (error: Error) => {
      console.error('Realtime socket connect_error:', error.message);
    };

    const handleDisconnect = (reason: string) => {
      console.warn(`Realtime socket disconnected: ${reason}`);
    };

    socket.on('connect', handleConnect);
    socket.on('connect_error', handleConnectError);
    socket.on('disconnect', handleDisconnect);

    if (!socket.connected) {
      socket.connect();
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('connect_error', handleConnectError);
      socket.off('disconnect', handleDisconnect);
    };
  }, []);

  return null;
}
