'use client';

import React, { useEffect, useState } from 'react';
import { Search, Users } from 'lucide-react';
import { ProvinceSelect, RO_OPTIONS } from '@/components/CustomerSegmentList';

type CustomerItem = {
  id: string;
  name: string;
  whatsapp_number: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  total_transaksi: number;
  total_belanja: number;
  first_order_at: string;
  last_order_at: string;
};

type CustomersResponse = {
  success: boolean;
  message?: string;
  data?: {
    customers: CustomerItem[];
    years: number[];
    provinces: string[];
    pagination: {
      page: number;
      limit: number;
      totalRows: number;
      totalPages: number;
    };
  };
};

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

const formatRupiah = (value: number) => `Rp ${value.toLocaleString('id-ID')}`;

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Terjadi kesalahan');

export default function DataKostumerPage() {
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [province, setProvince] = useState('');
  const [ro, setRo] = useState('');
  const [provinces, setProvinces] = useState<string[]>([]);
  const [years, setYears] = useState<number[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRows, setTotalRows] = useState(0);
  const [error, setError] = useState('');

  async function fetchCustomers(currentPage: number, currentSearch: string, currentYear: string, currentMonth: string, currentProvince: string, currentRo: string) {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      params.set('page', String(currentPage));
      if (currentSearch.trim()) {
        params.set('search', currentSearch.trim());
      }
      if (currentYear) {
        params.set('year', currentYear);
      }
      if (currentMonth) {
        params.set('month', currentMonth);
      }
      if (currentProvince) {
        params.set('province', currentProvince);
      }
      if (currentRo) {
        params.set('ro', currentRo);
      }

      const res = await fetch(`/api/customers/database?${params.toString()}`, { cache: 'no-store' });
      const json: CustomersResponse = await res.json();

      if (!json.success || !json.data) {
        throw new Error(json.message || 'Gagal mengambil database customer');
      }

      setCustomers(json.data.customers);
      setYears(json.data.years);
      setProvinces(json.data.provinces);
      setTotalPages(json.data.pagination.totalPages);
      setTotalRows(json.data.pagination.totalRows);
    } catch (error: unknown) {
      setCustomers([]);
      setTotalPages(1);
      setTotalRows(0);
      setError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchCustomers(page, searchQuery, year, month, province, ro);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [page, searchQuery, year, month, province, ro]);

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setSearchQuery(searchInput);
  };

  const handleReset = () => {
    setSearchInput('');
    setSearchQuery('');
    setPage(1);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Database Customer</h1>
          <p className="mt-1 text-sm text-slate-400">Customer dari data transaksi (dataslu), tanpa transaksi batal dan nomor marketplace yang disensor.</p>
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 flex-wrap">
          <select
            value={year}
            onChange={(event) => {
              setYear(event.target.value);
              setPage(1);
            }}
            className="h-11 rounded-xl border border-slate-300 px-3 text-sm text-slate-700 outline-none transition-colors focus:border-slate-400 focus:ring-1 focus:ring-slate-400"
          >
            <option value="">Semua Tahun</option>
            {years.map((item) => (
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
            className="h-11 rounded-xl border border-slate-300 px-3 text-sm text-slate-700 outline-none transition-colors focus:border-slate-400 focus:ring-1 focus:ring-slate-400"
          >
            <option value="">Semua Bulan</option>
            {MONTHS.map((item, index) => (
              <option key={item} value={index + 1}>
                {item}
              </option>
            ))}
          </select>
          <ProvinceSelect
            value={province}
            provinces={provinces}
            onChange={(value) => {
              setProvince(value);
              setPage(1);
            }}
          />
          <select
            value={ro}
            onChange={(event) => {
              setRo(event.target.value);
              setPage(1);
            }}
            className="h-11 rounded-xl border border-slate-300 px-3 text-sm text-slate-700 outline-none transition-colors focus:border-slate-400 focus:ring-1 focus:ring-slate-400"
            aria-label="RO"
          >
            {RO_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Cari Nama, No. WhatsApp, Alamat, atau Kota..."
              className="h-11 w-full rounded-xl border border-slate-300 pl-10 pr-4 text-sm text-slate-700 outline-none transition-colors focus:border-slate-400 focus:ring-1 focus:ring-slate-400"
            />
          </div>
          <button type="submit" className="rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-700">
            Cari
          </button>
          {searchQuery ? (
            <button type="button" onClick={handleReset} className="rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-200">
              Reset
            </button>
          ) : null}
        </form>
      </div>

      <div className="flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col">
        <div className="flex-1 overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/50">
                <th className="p-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Customer</th>
                <th className="p-4 text-xs font-semibold uppercase tracking-wider text-slate-500">No. WhatsApp</th>
                <th className="p-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Alamat</th>
                <th className="p-4 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Transaksi</th>
                <th className="p-4 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Total Belanja</th>
                <th className="p-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Order Pertama</th>
                <th className="p-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Order Terakhir</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-sm text-slate-400">
                    Memuat data...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-sm text-red-500">
                    {error}
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <Users className="mx-auto mb-2 h-10 w-10 text-slate-300" />
                    Belum ada customer yang bertransaksi.
                  </td>
                </tr>
              ) : (
                customers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-slate-50">
                    <td className="p-4">
                      <p className="font-semibold text-slate-700">{customer.name}</p>
                    </td>
                    <td className="p-4">
                      <span className="font-mono text-sm text-slate-600">{customer.whatsapp_number ?? '-'}</span>
                    </td>
                    <td className="max-w-[320px] p-4">
                      <p className="line-clamp-2 text-sm text-slate-600" title={customer.address ?? undefined}>
                        {customer.address ?? '-'}
                      </p>
                      <p className="text-xs text-slate-400">
                        {[customer.city, customer.province ?? 'Provinsi tidak diketahui'].filter(Boolean).join(' · ')}
                      </p>
                    </td>
                    <td className="p-4 text-right">
                      {customer.total_transaksi > 1 ? (
                        <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700 border border-emerald-100">{customer.total_transaksi}x (RO)</span>
                      ) : (
                        <span className="text-sm text-slate-600">{customer.total_transaksi}x</span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <span className="text-sm font-medium text-slate-700">{formatRupiah(customer.total_belanja)}</span>
                    </td>
                    <td className="p-4">
                      <span className="text-sm text-slate-500">{formatDate(customer.first_order_at)}</span>
                    </td>
                    <td className="p-4">
                      <span className="text-sm text-slate-500">{formatDate(customer.last_order_at)}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
            <div className="text-sm text-slate-500">
              Menampilkan halaman <span className="font-medium text-slate-700">{page}</span> dari{' '}
              <span className="font-medium text-slate-700">{totalPages}</span>
              {totalRows > 0 ? <span className="ml-2 text-slate-400">({totalRows} customer)</span> : null}
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
              {page < totalPages ? (
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
