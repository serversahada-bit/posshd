'use client';

import Link from 'next/link';
import { ArrowRight, LayoutDashboard, ShieldCheck, Sparkles } from 'lucide-react';

export default function HomePage() {
  return (
    <section className="dashboard-layout">
      <div className="panel hero-panel">
        <p className="hero-panel__eyebrow">GreatSales</p>
        <h1 className="hero-panel__title">
              Fondasi tema sudah dibersihkan dan siap dibangun ulang.
        </h1>
        <p className="hero-panel__text">
          Halaman ini sekarang sengaja dibuat sederhana supaya tidak lagi bergantung pada class global lama. Dari sini kita bisa lanjut rebuild dashboard, form, dan tabel dengan tampilan yang jauh lebih rapi.
        </p>
        <div className="hero-actions">
            <Link
              href="/dashboard"
              className="btn btn--primary"
            >
              Buka Dashboard
              <ArrowRight size={16} />
            </Link>
            <Link
              href="/login"
              className="btn btn--secondary"
            >
              Halaman Login
            </Link>
        </div>
      </div>

      <div className="card-grid">
        <div className="panel info-card">
          <div className="icon-badge">
            <Sparkles size={20} />
          </div>
          <h2 className="info-card__title">Tanpa CSS lama</h2>
          <p className="info-card__text">
            Tidak ada lagi class seperti `page-header`, `card`, atau `stats-grid` yang rawan bentrok.
          </p>
        </div>

        <div className="panel info-card">
          <div className="icon-badge">
            <LayoutDashboard size={20} />
          </div>
          <h2 className="info-card__title">Siap jadi admin panel</h2>
          <p className="info-card__text">
            Struktur shell dan sidebar sudah bersih, jadi rebuild per modul sekarang lebih aman.
          </p>
        </div>

        <div className="panel info-card">
          <div className="icon-badge">
            <ShieldCheck size={20} />
          </div>
          <h2 className="info-card__title">Lebih mudah dikontrol</h2>
          <p className="info-card__text">
            Semua tampilan inti sekarang berbasis utility class, jadi styling lebih konsisten dan mudah dirawat.
          </p>
        </div>
      </div>
    </section>
  );
}
