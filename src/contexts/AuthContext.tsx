'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '@/types';
import { AuthState } from '@/types/auth';
import { useRouter } from 'next/navigation';

interface AuthContextType extends AuthState {
  login: (username: string, password: string) => Promise<{ success: boolean; message: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [auth, setAuth] = useState<AuthState>({ user: null, isAuthenticated: false });
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const stored = localStorage.getItem('sahada-pos-session');
    if (stored) {
      try {
        const user = JSON.parse(stored);
        setAuth({ user, isAuthenticated: true });
      } catch {
        localStorage.removeItem('sahada-pos-session');
      }
    }
    setLoading(false);
  }, []);

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
        };
        localStorage.setItem('sahada-pos-session', JSON.stringify(sessionUser));
        setAuth({ user: sessionUser, isAuthenticated: true });
        return { success: true, message: 'Login berhasil' };
      }

      return { success: false, message: json.message ?? 'Login gagal' };
    } catch {
      return { success: false, message: 'Tidak dapat terhubung ke server. Pastikan DB aktif.' };
    }
  };

  const logout = () => {
    void fetch('/api/auth/logout', { method: 'POST' });
    localStorage.removeItem('sahada-pos-session');
    setAuth({ user: null, isAuthenticated: false });
    router.push('/login');
  };

  if (loading) return null;

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
