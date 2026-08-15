const fs = require('fs');
const path = require('path');

const routes = [
  'dashboard', 'buat_pesanan', 'buat_pesanan_cso', 'buat_pesanan_crm', 'buat_pesanan_resend', 'orders',
  'validasi_pembayaran', 'olahan', 'pembelian_terbaru', 'data_kostumer',
  'products', 'promo', 'advertiser', 'ad_source', 'gifts', 'bundling',
  'pengaturan_ongkir', 'biaya_ongkir', 'penambahan_ekspedisi', 'penambahan_ongkir',
  'setting_gudang', 'stok_produk', 'stok_hadiah',
  'setting_payment', 'setting_no_payment',
  'manajemen_user', 'logs'
];

routes.forEach(route => {
  const dirPath = path.join(__dirname, 'src', 'app', route);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  
  const formattedTitle = route.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  
  const content = `'use client';

export default function ${formattedTitle.replace(/\s/g, '')}Page() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
      <h1 className="text-2xl font-bold text-slate-800 mb-2">${formattedTitle}</h1>
      <p className="text-slate-500">Halaman ini masih dalam tahap pengembangan (Placeholder).</p>
    </div>
  );
}
`;

  fs.writeFileSync(path.join(dirPath, 'page.tsx'), content);
  console.log('Created route /' + route);
});
