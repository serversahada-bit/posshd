'use client';

import { useEffect, useState } from 'react';
import CustomerSegmentList, { RO_OPTIONS, selectClassName } from '@/components/CustomerSegmentList';

type ProvinceSummary = {
  key: string;
  name: string;
  customers: number;
  ro_customers: number;
  active_customers: number;
  total_belanja: number;
};

type WilayahData = {
  active_days: number;
  total_customers: number;
  provinces: ProvinceSummary[];
};

const BAR_COLOR = '#2a78d6';

const formatNumber = (value: number) => value.toLocaleString('id-ID');
const compactNumber = new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 });
const formatPercent = (value: number, total: number) =>
  `${(total > 0 ? (value / total) * 100 : 0).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`;

export default function CustomerWilayahPage() {
  const [ro, setRo] = useState('');
  const [province, setProvince] = useState('');
  const [data, setData] = useState<WilayahData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const params = ro ? `?ro=${ro}` : '';
    fetch(`/api/customers/wilayah${params}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (!json.success || !json.data) throw new Error(json.message || 'Gagal mengambil data wilayah');
        setData(json.data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Terjadi kesalahan');
      });
    return () => {
      cancelled = true;
    };
  }, [ro]);

  const maxCustomers = Math.max(1, ...(data?.provinces.map((item) => item.customers) ?? [1]));

  const selectProvince = (key: string) => {
    setProvince(key);
    document.getElementById('daftar-customer-wilayah')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="h-full flex flex-col">
      <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Customer per Wilayah</h1>
          <p className="mt-1 text-sm text-slate-400">Sebaran customer per provinsi. Klik provinsi untuk melihat daftar customernya.</p>
        </div>
        <select value={ro} onChange={(event) => setRo(event.target.value)} className={selectClassName} aria-label="RO ringkasan">
          {RO_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {error ? <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</div> : null}

      <div className="mb-8 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="max-h-[480px] overflow-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-slate-200">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Provinsi</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Customer</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Sudah RO</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Aktif {data ? `${data.active_days} hari` : ''}
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Total Belanja</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!data ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-sm text-slate-400">
                    Memuat data...
                  </td>
                </tr>
              ) : (
                data.provinces.map((item) => (
                  <tr
                    key={item.key}
                    onClick={() => selectProvince(item.key)}
                    className={`cursor-pointer hover:bg-slate-50 ${province === item.key ? 'bg-blue-50/60' : ''}`}
                  >
                    <td className="px-4 py-3 text-sm font-semibold text-slate-700">{item.name}</td>
                    <td className="w-[38%] px-4 py-3">
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="font-medium text-slate-700">{formatNumber(item.customers)}</span>
                        <span className="text-xs text-slate-500">{formatPercent(item.customers, data.total_customers)}</span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-slate-100">
                        <div
                          className="h-2 rounded-full"
                          style={{ width: `${Math.max(0.5, (item.customers / maxCustomers) * 100)}%`, backgroundColor: BAR_COLOR }}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-600">
                      {formatNumber(item.ro_customers)}{' '}
                      <span className="text-xs text-slate-400">({formatPercent(item.ro_customers, item.customers)})</span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-600">{formatNumber(item.active_customers)}</td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-slate-700">Rp {compactNumber.format(item.total_belanja)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div id="daftar-customer-wilayah" className="scroll-mt-4">
        <h2 className="mb-3 text-lg font-bold text-slate-800">
          Daftar Customer {province ? `· ${province === 'unknown' ? 'Provinsi tidak diketahui' : province}` : '· Semua Provinsi'}
        </h2>
        <CustomerSegmentList variant="wilayah" province={province} onProvinceChange={setProvince} />
      </div>
    </div>
  );
}
