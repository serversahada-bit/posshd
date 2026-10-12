'use client';

import React, { useEffect, useState } from 'react';
import { MessageCircle, Search, Users } from 'lucide-react';

type SegmentCustomer = {
  phone: string;
  name: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  agent: string | null;
  total_transaksi: number;
  total_belanja: number;
  first_order_at: string;
  last_order_at: string;
  days_since_last_order: number;
};

type SegmentData = {
  years: number[];
  provinces: string[];
  customers: SegmentCustomer[];
  summary: { customers: number; ro_customers: number; total_belanja: number };
  pagination: { page: number; limit: number; totalRows: number; totalPages: number };
};

// baru = filter pembelian pertama, berhenti = filter pembelian terakhir, wilayah = filter provinsi saja.
export type SegmentVariant = 'baru' | 'berhenti' | 'wilayah';

export const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

export const RO_OPTIONS = [
  { value: '', label: 'Semua RO' },
  { value: '1', label: 'Baru 1x beli' },
  { value: '2', label: 'RO 2x ke atas' },
  { value: '5', label: 'RO 5x ke atas' },
  { value: '10', label: 'RO 10x ke atas' },
];

const SORT_OPTIONS = [
  { value: 'belanja', label: 'Total belanja terbesar' },
  { value: 'first', label: 'Pertama beli terbaru' },
  { value: 'last', label: 'Terakhir beli terbaru' },
];

const DEFAULT_SORT: Record<SegmentVariant, string> = { baru: 'first', berhenti: 'belanja', wilayah: 'belanja' };

export const selectClassName =
  'h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none transition-colors focus:border-slate-400 focus:ring-1 focus:ring-slate-400';

const formatNumber = (value: number) => value.toLocaleString('id-ID');
const formatRupiah = (value: number) => `Rp ${value.toLocaleString('id-ID')}`;
const formatDate = (value: string) =>
  new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));

export function ProvinceSelect({
  value,
  provinces,
  onChange,
}: {
  value: string;
  provinces: string[];
  onChange: (value: string) => void;
}) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className={selectClassName} aria-label="Provinsi">
      <option value="">Semua Provinsi</option>
      {provinces.map((province) => (
        <option key={province} value={province}>
          {province}
        </option>
      ))}
      <option value="unknown">Tidak diketahui</option>
    </select>
  );
}

export default function CustomerSegmentList({
  variant,
  province: controlledProvince,
  onProvinceChange,
}: {
  variant: SegmentVariant;
  province?: string;
  onProvinceChange?: (value: string) => void;
}) {
  const currentYear = String(new Date().getFullYear());
  const [year, setYear] = useState(variant === 'wilayah' ? '' : currentYear);
  const [month, setMonth] = useState('');
  const [ownProvince, setOwnProvince] = useState('');
  const [ro, setRo] = useState('');
  const [sort, setSort] = useState(DEFAULT_SORT[variant]);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SegmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const province = controlledProvince ?? ownProvince;
  const setProvince = (value: string) => {
    if (onProvinceChange) onProvinceChange(value);
    else setOwnProvince(value);
    setPage(1);
  };

  // Halaman kembali ke 1 jika provinsi diubah dari luar (klik tabel wilayah).
  const [lastControlledProvince, setLastControlledProvince] = useState(controlledProvince);
  if (controlledProvince !== lastControlledProvince) {
    setLastControlledProvince(controlledProvince);
    setPage(1);
  }

  const filterParams = new URLSearchParams({ sort });
  const prefix = variant === 'berhenti' ? 'last' : 'first';
  if (variant !== 'wilayah') {
    if (year) filterParams.set(`${prefix}_year`, year);
    if (month) filterParams.set(`${prefix}_month`, month);
  }
  if (province) filterParams.set('province', province);
  if (ro) filterParams.set('ro', ro);
  if (searchQuery.trim()) filterParams.set('search', searchQuery.trim());
  const filterQuery = filterParams.toString();

  useEffect(() => {
    let cancelled = false;

    async function fetchCustomers() {
      setLoading(true);
      setError('');

      try {
        const params = new URLSearchParams(filterQuery);
        params.set('page', String(page));

        const res = await fetch(`/api/customers/segment?${params.toString()}`, { cache: 'no-store' });
        const json = await res.json();
        if (!json.success || !json.data) {
          throw new Error(json.message || 'Gagal mengambil data customer');
        }
        if (!cancelled) setData(json.data);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Terjadi kesalahan');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchCustomers();
    return () => {
      cancelled = true;
    };
  }, [filterQuery, page]);

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setSearchQuery(searchInput);
  };

  const periodLabel = variant === 'berhenti' ? 'Terakhir beli' : 'Pertama beli';
  const columnCount = 8;

  return (
    <div className="flex flex-col">
      <div className="mb-4 flex items-center gap-2 flex-wrap rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {variant !== 'wilayah' ? (
          <>
            <span className="text-sm font-medium text-slate-600">{periodLabel}:</span>
            <select
              value={year}
              onChange={(event) => {
                setYear(event.target.value);
                setPage(1);
              }}
              className={selectClassName}
              aria-label={`${periodLabel} tahun`}
            >
              <option value="">Semua Tahun</option>
              {(data?.years ?? [Number(currentYear)]).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select
              value={month}
              onChange={(event) => {
                setMonth(event.target.value);
                setPage(1);
              }}
              className={selectClassName}
              aria-label={`${periodLabel} bulan`}
            >
              <option value="">Semua Bulan</option>
              {MONTHS.map((item, index) => (
                <option key={item} value={index + 1}>
                  {item}
                </option>
              ))}
            </select>
          </>
        ) : null}
        <ProvinceSelect value={province} provinces={data?.provinces ?? []} onChange={setProvince} />
        <select
          value={ro}
          onChange={(event) => {
            setRo(event.target.value);
            setPage(1);
          }}
          className={selectClassName}
          aria-label="RO"
        >
          {RO_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(event) => {
            setSort(event.target.value);
            setPage(1);
          }}
          className={selectClassName}
          aria-label="Urutkan"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <form onSubmit={handleSearchSubmit} className="flex min-w-[260px] flex-1 items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Cari nama, WA, alamat, agen..."
              className="h-10 w-full rounded-xl border border-slate-300 pl-10 pr-4 text-sm text-slate-700 outline-none transition-colors focus:border-slate-400 focus:ring-1 focus:ring-slate-400"
            />
          </div>
          <button type="submit" className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-700">
            Cari
          </button>
        </form>
      </div>

      {data ? (
        <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-500">
          <span>
            <span className="font-bold text-slate-800">{formatNumber(data.summary.customers)}</span> customer
          </span>
          <span>
            <span className="font-bold text-slate-800">{formatNumber(data.summary.ro_customers)}</span> sudah RO (2x+)
          </span>
          <span>
            Total belanja <span className="font-bold text-slate-800">{formatRupiah(data.summary.total_belanja)}</span>
          </span>
        </div>
      ) : null}

      {error ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</div> : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/50">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Customer</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Alamat</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Agen</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">RO</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Total Belanja</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Pertama Beli</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Terakhir Beli</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Hubungi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!data && loading ? (
                <tr>
                  <td colSpan={columnCount} className="py-12 text-center text-sm text-slate-400">
                    Memuat data...
                  </td>
                </tr>
              ) : !data || data.customers.length === 0 ? (
                <tr>
                  <td colSpan={columnCount} className="py-12 text-center text-slate-400">
                    <Users className="mx-auto mb-2 h-10 w-10 text-slate-300" />
                    Tidak ada customer yang cocok dengan filter.
                  </td>
                </tr>
              ) : (
                data.customers.map((customer) => (
                  <tr key={customer.phone} className={`align-top hover:bg-slate-50 ${loading ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-slate-700">{customer.name ?? '-'}</p>
                      <p className="font-mono text-xs text-slate-400">{customer.phone}</p>
                    </td>
                    <td className="max-w-[320px] px-4 py-3">
                      <p className="line-clamp-2 text-sm text-slate-600" title={customer.address ?? undefined}>
                        {customer.address ?? '-'}
                      </p>
                      <p className="text-xs text-slate-400">
                        {[customer.city, customer.province ?? 'Provinsi tidak diketahui'].filter(Boolean).join(' · ')}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{customer.agent ?? '-'}</td>
                    <td className="px-4 py-3 text-right">
                      {customer.total_transaksi > 1 ? (
                        <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700 border border-emerald-100">
                          {customer.total_transaksi}x
                        </span>
                      ) : (
                        <span className="text-sm text-slate-500">1x</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-slate-700">{formatRupiah(customer.total_belanja)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">{formatDate(customer.first_order_at)}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <p className="text-sm text-slate-500">{formatDate(customer.last_order_at)}</p>
                      <p className="text-xs text-slate-400">{formatNumber(customer.days_since_last_order)} hari lalu</p>
                    </td>
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

        {data && data.pagination.totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
            <div className="text-sm text-slate-500">
              Halaman <span className="font-medium text-slate-700">{page}</span> dari{' '}
              <span className="font-medium text-slate-700">{formatNumber(data.pagination.totalPages)}</span>
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
    </div>
  );
}
