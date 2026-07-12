'use client';

import { useEffect, useRef } from 'react';
import { getSocket } from '@/lib/socket';

export const useSocketEvent = (eventName: string, callback: (data?: any) => void) => {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    const socket = getSocket();
    
    const listener = (data?: any) => {
      if (savedCallback.current) {
        savedCallback.current(data);
      }
    };

    socket.on(eventName, listener);

    return () => {
      socket.off(eventName, listener);
    };
  }, [eventName]);
};
