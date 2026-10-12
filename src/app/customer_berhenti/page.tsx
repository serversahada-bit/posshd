'use client';

import CustomerSegmentList from '@/components/CustomerSegmentList';

export default function CustomerBerhentiPage() {
  return (
    <div className="h-full flex flex-col">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Customer Berhenti Beli</h1>
        <p className="mt-1 text-sm text-slate-400">
          Customer berdasarkan bulan pembelian terakhir, yaitu yang belum beli lagi sejak bulan itu. Urutkan dari total belanja terbesar untuk prioritas follow up.
        </p>
      </div>
      <CustomerSegmentList variant="berhenti" />
    </div>
  );
}
