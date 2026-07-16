'use client';

import React, { createContext, useContext, useSyncExternalStore, ReactNode } from 'react';
import { User } from '@/types';
import { AuthState } from '@/types/auth';
import { useRouter } from 'next/navigation';

interface AuthContextType extends AuthState {
  login: (username: string, password: string) => Promise<{ success: boolean; message: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const SESSION_KEY = 'sahada-pos-session';
const AUTH_UPDATED_EVENT = 'sahada-auth-updated';

const emptyAuth: AuthState = { user: null, isAuthenticated: false };
let lastSnapshotRaw: string | null = null;
let lastSnapshotValue: AuthState = emptyAuth;

const getServerSnapshot = () => emptyAuth;

const readStoredSession = (): AuthState => {
  if (typeof window === 'undefined') {
    return emptyAuth;
  }

  const stored = localStorage.getItem(SESSION_KEY);
  if (!stored) {
    lastSnapshotRaw = null;
    lastSnapshotValue = emptyAuth;
    return lastSnapshotValue;
  }

  if (stored === lastSnapshotRaw) {
    return lastSnapshotValue;
  }

  try {
    const user = JSON.parse(stored) as User;
    lastSnapshotRaw = stored;
    lastSnapshotValue = { user, isAuthenticated: true };
    return lastSnapshotValue;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    lastSnapshotRaw = null;
    lastSnapshotValue = emptyAuth;
    return lastSnapshotValue;
  }
};

const subscribeAuth = (onStoreChange: () => void) => {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handleChange = () => onStoreChange();
  window.addEventListener('storage', handleChange);
  window.addEventListener(AUTH_UPDATED_EVENT, handleChange);

  return () => {
    window.removeEventListener('storage', handleChange);
    window.removeEventListener(AUTH_UPDATED_EVENT, handleChange);
  };
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const auth = useSyncExternalStore(subscribeAuth, readStoredSession, getServerSnapshot);
  const router = useRouter();

  const login = async (username: string, password: string): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const json = await res.json() as { success: boolean; message?: string; data?: User };

      if (json.success && json.data) {
        const sessionUser = {
          id: json.data.id,
          name: json.data.name,
          email: json.data.email,
          role: json.data.role,
          permissions: json.data.permissions,
          photo_url: json.data.photo_url ?? null,
        };
        const nextRaw = JSON.stringify(sessionUser);
        localStorage.setItem(SESSION_KEY, nextRaw);
        lastSnapshotRaw = nextRaw;
        lastSnapshotValue = { user: sessionUser, isAuthenticated: true };
        window.dispatchEvent(new Event(AUTH_UPDATED_EVENT));
        return { success: true, message: 'Login berhasil' };
      }

      return { success: false, message: json.message ?? 'Login gagal' };
    } catch {
      return { success: false, message: 'Tidak dapat terhubung ke server. Pastikan DB aktif.' };
    }
  };

  const logout = () => {
    void fetch('/api/auth/logout', { method: 'POST' });
    localStorage.removeItem(SESSION_KEY);
    lastSnapshotRaw = null;
    lastSnapshotValue = emptyAuth;
    window.dispatchEvent(new Event(AUTH_UPDATED_EVENT));
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ ...auth, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
