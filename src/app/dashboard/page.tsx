'use client';

export default function DashboardPage() {
  return (
    <section className="dashboard-layout">
      <div className="panel hero-panel">
        <p className="section-eyebrow">Dashboard</p>
        <h1 className="hero-panel__title" style={{ fontSize: '36px' }}>
          Tema lama sudah dibersihkan.
        </h1>
        <p className="hero-panel__text" style={{ maxWidth: '760px' }}>
          Sekarang tampilan dashboard dibuat netral dan sederhana dulu supaya kita punya dasar yang bersih untuk rebuild halaman, card, table, dan sidebar tanpa CSS lama yang saling tabrak.
        </p>
      </div>

      <div className="page-grid page-grid--3">
        <div className="panel info-card">
          <p className="info-card__title" style={{ marginTop: 0 }}>Fondasi Bersih</p>
          <p className="info-card__text">Background, border, panel, dan spacing sekarang dibuat netral dan konsisten.</p>
        </div>
        <div className="panel info-card">
          <p className="info-card__title" style={{ marginTop: 0 }}>Sidebar Baru</p>
          <p className="info-card__text">Navigasi direset jadi flat, rapi, dan lebih gampang dibangun ulang per halaman.</p>
        </div>
        <div className="panel info-card">
          <p className="info-card__title" style={{ marginTop: 0 }}>Siap Rebuild</p>
          <p className="info-card__text">Setelah ini kita bisa desain ulang dashboard dan tiap modul dengan arah visual yang lebih bagus.</p>
        </div>
      </div>
    </section>
  );
}
