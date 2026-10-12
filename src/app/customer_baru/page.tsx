'use client';

import CustomerSegmentList from '@/components/CustomerSegmentList';

export default function CustomerBaruPage() {
  return (
    <div className="h-full flex flex-col">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Customer Baru</h1>
        <p className="mt-1 text-sm text-slate-400">
          Customer berdasarkan bulan pembelian pertama. Pilih tahun lalu bulan untuk melihat siapa yang masuk dan sudah berapa kali RO sejak itu.
        </p>
      </div>
      <CustomerSegmentList variant="baru" />
    </div>
  );
}
