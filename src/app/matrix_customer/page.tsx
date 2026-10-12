'use client';

import React, { useEffect, useState } from 'react';
import { MessageCircle, Search, Users } from 'lucide-react';

type MatrixCustomer = {
  phone: string;
  name: string | null;
  city: string | null;
  agent: string | null;
  per_year: number[];
  total_transaksi: number;
  total_belanja: number;
  last_order_at: string;
};

type MatrixData = {
  years: number[];
  start: number;
  end: number;
  mode: 'loyal' | 'akhir';
  range_years: number[];
  summary: {
    cohort_customers: number;
    loyal_customers: number;
    still_buying_customers: number;
  };
  yearly: { year: number; beli: number; tanpa_putus: number }[];
  customers: MatrixCustomer[];
  pagination: { page: number; limit: number; totalRows: number; totalPages: number };
};

const BAR_COLOR = '#2a78d6';

const formatNumber = (value: number) => value.toLocaleString('id-ID');
const formatRupiah = (value: number) => `Rp ${value.toLocaleString('id-ID')}`;
const formatPercent = (value: number, total: number) =>
  `${(total > 0 ? (value / total) * 100 : 0).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`;
const formatDate = (value: string) =>
  new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Terjadi kesalahan');

const selectClassName =
  'h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none transition-colors focus:border-slate-400 focus:ring-1 focus:ring-slate-400';

export default function MatrixCustomerPage() {
  const [start, setStart] = useState('2023');
  const [end, setEnd] = useState(String(new Date().getFullYear()));
  const [mode, setMode] = useState<'loyal' | 'akhir'>('loyal');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<MatrixData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function fetchMatrix() {
      setLoading(true);
      setError('');

      try {
        const params = new URLSearchParams({ start, end, mode, page: String(page) });
        if (searchQuery.trim()) params.set('search', searchQuery.trim());

        const res = await fetch(`/api/customers/database/matrix?${params.toString()}`, { cache: 'no-store' });
        const json = await res.json();
        if (!json.success || !json.data) {
          throw new Error(json.message || 'Gagal mengambil matrix customer');
        }
        if (!cancelled) setData(json.data);
      } catch (err: unknown) {
        if (!cancelled) setError(getErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchMatrix();
    return () => {
      cancelled = true;
    };
  }, [start, end, mode, page, searchQuery]);

  const years = data ? [...data.years].sort((a, b) => a - b) : [];
  const startYear = Number(start);
  const endYear = Number(end);
  const cohortSize = data?.summary.cohort_customers ?? 0;
  const rangeLabel = startYear === endYear ? `${startYear}` : `${startYear}–${endYear}`;

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setSearchQuery(searchInput);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Matrix Customer</h1>
        <p className="mt-1 text-sm text-slate-400">
          Lacak customer yang pertama kali beli di tahun awal: berapa yang masih repeat order (RO) sampai tahun akhir, dan siapa saja.
        </p>
      </div>

      <div className="mb-6 flex items-center gap-2 flex-wrap rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="text-sm font-medium text-slate-600" htmlFor="matrix-start">
          Customer baru tahun
        </label>
        <select
          id="matrix-start"
          value={start}
          onChange={(event) => {
            const value = event.target.value;
            setStart(value);
            if (Number(end) < Number(value)) setEnd(value);
            setPage(1);
          }}
          className={selectClassName}
        >
          {(years.length ? years : [startYear]).map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
        <label className="text-sm font-medium text-slate-600" htmlFor="matrix-end">
          masih RO sampai
        </label>
        <select
          id="matrix-end"
          value={end}
          onChange={(event) => {
            setEnd(event.target.value);
            setPage(1);
          }}
          className={selectClassName}
        >
          {(years.length ? years : [endYear])
            .filter((year) => year >= startYear)
            .map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
        </select>
      </div>

      {error ? <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</div> : null}

      {data ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Customer Baru {data.start}</p>
              <p className="mt-2 text-2xl font-bold text-slate-800">{formatNumber(cohortSize)}</p>
              <p className="mt-1 text-sm text-slate-500">Pertama kali beli di tahun {data.start}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Masih RO Tanpa Putus {rangeLabel}</p>
              <p className="mt-2 text-2xl font-bold text-slate-800">{formatNumber(data.summary.loyal_customers)}</p>
              <p className="mt-1 text-sm text-slate-500">
                {formatPercent(data.summary.loyal_customers, cohortSize)} ·{' '}
                {data.start === data.end ? `beli lebih dari sekali di ${data.start}` : `beli setiap tahun ${rangeLabel}`}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Masih Beli di {data.end}</p>
              <p className="mt-2 text-2xl font-bold text-slate-800">{formatNumber(data.summary.still_buying_customers)}</p>
              <p className="mt-1 text-sm text-slate-500">
                {formatPercent(data.summary.still_buying_customers, cohortSize)} · termasuk yang sempat putus
              </p>
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-4">
              <h2 className="font-bold text-slate-800">Perjalanan Customer Baru {data.start}</h2>
              <p className="mt-1 text-xs text-slate-500">
                &quot;Beli di tahun itu&quot; = semua yang belanja di tahun tersebut · &quot;Tanpa putus&quot; = belanja setiap tahun sejak {data.start}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/50">
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Tahun</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Beli di Tahun Itu</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Tanpa Putus Sejak {data.start}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.yearly.map((row) => (
                    <tr key={row.year}>
                      <td className="px-4 py-3 text-sm font-semibold text-slate-700">{row.year}</td>
                      {[row.beli, row.tanpa_putus].map((value, index) => (
                        <td key={index} className="px-4 py-3">
                          <div className="flex items-baseline justify-between gap-3 text-sm">
                            <span className="font-medium text-slate-700">{formatNumber(value)}</span>
                            <span className="text-xs text-slate-500">{formatPercent(value, cohortSize)}</span>
                          </div>
                          <div className="mt-1 h-2 rounded-full bg-slate-100">
                            <div
                              className="h-2 rounded-full"
                              style={{ width: `${Math.max(0.5, cohortSize > 0 ? (value / cohortSize) * 100 : 0)}%`, backgroundColor: BAR_COLOR }}
                            />
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-6 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col">
            <div className="flex items-center justify-between gap-4 flex-wrap border-b border-slate-100 p-4">
              <div className="flex gap-1 overflow-x-auto">
                {(
                  [
                    { key: 'loyal', label: `RO Tanpa Putus ${rangeLabel}`, total: data.summary.loyal_customers },
                    { key: 'akhir', label: `Masih Beli di ${data.end}`, total: data.summary.still_buying_customers },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => {
                      setMode(tab.key);
                      setPage(1);
                    }}
                    className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                      mode === tab.key ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {tab.label}
                    <span className={`ml-2 text-xs ${mode === tab.key ? 'text-white/80' : 'text-slate-500'}`}>{formatNumber(tab.total)}</span>
                  </button>
                ))}
              </div>
              <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="Cari nama, WA, kota, agen..."
                    className="h-10 w-64 rounded-xl border border-slate-300 pl-10 pr-4 text-sm text-slate-700 outline-none transition-colors focus:border-slate-400 focus:ring-1 focus:ring-slate-400"
                  />
                </div>
                <button type="submit" className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-700">
                  Cari
                </button>
              </form>
            </div>

            <div className="flex-1 overflow-x-auto">
              <table className="w-full min-w-[860px] text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/50">
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Customer</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Agen</th>
                    {data.range_years.map((year) => (
                      <th key={year} className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">
                        {year}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Total Belanja</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Beli Terakhir</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Hubungi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading && data.customers.length === 0 ? (
                    <tr>
                      <td colSpan={data.range_years.length + 5} className="py-12 text-center text-sm text-slate-400">
                        Memuat data...
                      </td>
                    </tr>
                  ) : data.customers.length === 0 ? (
                    <tr>
                      <td colSpan={data.range_years.length + 5} className="py-12 text-center text-slate-400">
                        <Users className="mx-auto mb-2 h-10 w-10 text-slate-300" />
                        Tidak ada customer yang cocok.
                      </td>
                    </tr>
                  ) : (
                    data.customers.map((customer) => (
                      <tr key={customer.phone} className={`hover:bg-slate-50 ${loading ? 'opacity-60' : ''}`}>
                        <td className="px-4 py-3">
                          <p className="text-sm font-semibold text-slate-700">{customer.name ?? '-'}</p>
                          <p className="text-xs text-slate-400">
                            <span className="font-mono">{customer.phone}</span>
                            {customer.city ? ` · ${customer.city}` : ''}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">{customer.agent ?? '-'}</td>
                        {customer.per_year.map((count, index) => (
                          <td key={data.range_years[index]} className="px-3 py-3 text-center">
                            {count > 0 ? (
                              <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700 border border-emerald-100">{count}x</span>
                            ) : (
                              <span className="text-xs text-slate-300">–</span>
                            )}
                          </td>
                        ))}
                        <td className="px-4 py-3 text-right text-sm font-medium text-slate-700">{formatRupiah(customer.total_belanja)}</td>
                        <td className="px-4 py-3 text-sm text-slate-500">{formatDate(customer.last_order_at)}</td>
                        <td className="px-4 py-3">
                          <a
                            href={`https://wa.me/${customer.phone}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
                          >
                            <MessageCircle size={14} />
                            WhatsApp
                          </a>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {data.pagination.totalPages > 1 ? (
              <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
                <div className="text-sm text-slate-500">
                  Halaman <span className="font-medium text-slate-700">{page}</span> dari{' '}
                  <span className="font-medium text-slate-700">{data.pagination.totalPages}</span>
                  <span className="ml-2 text-slate-400">({formatNumber(data.pagination.totalRows)} customer)</span>
                </div>
                <div className="flex items-center gap-1">
                  {page > 1 ? (
                    <button
                      type="button"
                      onClick={() => setPage((prev) => prev - 1)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                    >
                      Sebelumnya
                    </button>
                  ) : null}
                  {page < data.pagination.totalPages ? (
                    <button
                      type="button"
                      onClick={() => setPage((prev) => prev + 1)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                    >
                      Selanjutnya
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </>
      ) : loading ? (
        <div className="flex flex-1 items-center justify-center py-24 text-sm text-slate-400">Memuat matrix...</div>
      ) : null}
    </div>
  );
}
