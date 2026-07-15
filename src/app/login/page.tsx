'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Eye, EyeOff, LogIn } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated } = useAuth();
  const rememberedUsername = typeof window === 'undefined' ? '' : (localStorage.getItem('pos-remember-username') ?? '');

  const [username, setUsername] = useState(rememberedUsername);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(Boolean(rememberedUsername));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!username || !password) {
      setError('Username dan password harus diisi.');
      setLoading(false);
      return;
    }

    const result = await login(username, password);

    if (result.success) {
      if (rememberMe) {
        localStorage.setItem('pos-remember-username', username.trim());
      } else {
        localStorage.removeItem('pos-remember-username');
      }
      localStorage.removeItem('pos-remember-email');
      router.push('/');
      return;
    }

    setError(result.message);
    setLoading(false);
  };

  return (
    <main className="login-page">
      <div className="login-shell">
        <section className="login-showcase">
          <div>
            <div className="login-showcase__mark">
              GS
            </div>
            <p className="login-showcase__eyebrow">GreatSales</p>
            <h1 className="login-showcase__title">
              Login yang bersih, simpel, dan tidak bentrok dengan tema lama.
            </h1>
            <p className="login-showcase__text">
              Halaman login sekarang dibangun ulang penuh dengan utility class, jadi tidak lagi bergantung pada class global lama yang bikin tampilan rusak.
            </p>
          </div>

          <div className="login-showcase__notes">
            <div className="login-showcase__note">
              Arah baru: lebih netral, lebih rapi, dan lebih gampang dirawat.
            </div>
            <div className="login-showcase__note">
              Setelah ini kita bisa samakan seluruh modul ke gaya panel yang konsisten.
            </div>
          </div>
        </section>

        <section className="login-card">
          <div className="login-card__inner">
            <div className="login-card__header">
              <p className="login-card__eyebrow">Point Of Sale</p>
              <h2 className="login-card__title">Masuk ke sistem</h2>
              <p className="login-card__text">
                Gunakan username akun kamu untuk masuk ke panel GreatSales.
              </p>
            </div>

            {error && (
              <div className="login-error">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="login-form">
              <div className="form-group">
                <label htmlFor="login-username" className="form-label">
                  Username
                </label>
                <input
                  id="login-username"
                  type="text"
                  name="username"
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Contoh: min"
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="login-password" className="form-label">
                  Password
                </label>
                <div className="password-field">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Masukkan password"
                    className="form-input"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="password-field__toggle"
                    aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <label className="checkbox-row">
                <input
                  id="login-remember"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                Ingat Saya
              </label>

              <button
                id="btn-login"
                type="submit"
                disabled={loading}
                className="btn btn--primary login-submit"
              >
                {loading ? (
                  <>
                    <span className="spinner spinner--light" />
                    Memproses...
                  </>
                ) : (
                  <>
                    <LogIn size={16} />
                    Login ke Sistem
                  </>
                )}
              </button>
            </form>

            <div className="login-demo">
              <p className="login-demo__title">Akun Demo</p>
              <div className="login-demo__actions">
                <button
                  type="button"
                  onClick={() => { setUsername('min'); setPassword('admin'); }}
                  className="pill-btn"
                >
                  Admin
                </button>
                <button
                  type="button"
                  onClick={() => { setUsername('arga'); setPassword('arga'); }}
                  className="pill-btn"
                >
                  CS
                </button>
                <button
                  type="button"
                  onClick={() => { setUsername('erma'); setPassword('erma'); }}
                  className="pill-btn"
                >
                  CRM
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
