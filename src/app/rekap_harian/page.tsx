'use client';

import { useEffect, useState } from 'react';
import { Download, Loader2, Wallet, Truck, Tag } from 'lucide-react';
import Swal from 'sweetalert2';
import { formatCurrency, formatShortDate } from '@/lib/utils';

type DailyRecapEntry = { date: string; omset: number; voucherOngkir: number; orderCount: number };
type PromoUsageEntry = { promoId: string; promoName: string; usageCount: number };

type RekapHarianData = {
  startDate: string;
  endDate: string;
  totals: { omset: number; voucherOngkir: number; orderCount: number };
  dailyRecap: DailyRecapEntry[];
  promoUsage: PromoUsageEntry[];
};

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultRange(): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 29);
  return { start: toDateInputValue(start), end: toDateInputValue(end) };
}

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Terjadi kesalahan');

export default function RekapHarianPage() {
  const [data, setData] = useState<RekapHarianData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [range, setRange] = useState(defaultRange);

  const fetchRekap = async (start: string, end: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/rekap_harian?start_date=${start}&end_date=${end}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRekap(range.start, range.end);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const downloadBlob = (blob: Blob, filename: string, response?: Response) => {
    const headerName = response?.headers.get('content-disposition')?.match(/filename="?([^";]+)"?/)?.[1];
    const finalFilename = headerName || filename;

    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = finalFilename;
    document.body.appendChild(anchor);
    anchor.click();
    window.URL.revokeObjectURL(url);
    anchor.remove();
  };

  const submitExport = async () => {
    setExporting(true);
    try {
      const response = await fetch('/api/rekap_harian/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: range.start, endDate: range.end }),
      });

      if (!response.ok) {
        throw new Error('Gagal mengekspor rekap harian');
      }

      const blob = await response.blob();
      downloadBlob(blob, `Rekap_Harian_${Date.now()}.xlsx`, response);
    } catch (error: unknown) {
      Swal.fire('Error', getErrorMessage(error), 'error');
    } finally {
      setExporting(false);
    }
  };

  const summaryCards = [
    { label: 'Omset', value: formatCurrency(data?.totals.omset ?? 0), icon: Wallet, color: 'bg-sky-500' },
    { label: 'Voucher Ongkir', value: formatCurrency(data?.totals.voucherOngkir ?? 0), icon: Truck, color: 'bg-orange-500' },
    { label: 'Jumlah Pesanan', value: (data?.totals.orderCount ?? 0).toLocaleString('id-ID'), icon: Tag, color: 'bg-purple-500' },
  ];

  return (
    <div className="h-full flex flex-col">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Rekap Harian</h1>
        <p className="text-sm text-slate-400 mt-1">Rekap omset, voucher ongkir, dan promo yang digunakan per hari.</p>
      </div>

      <form
        className="flex flex-wrap items-end gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          fetchRekap(range.start, range.end);
        }}
      >
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">Tanggal Mulai</label>
          <input
            type="date"
            value={range.start}
            max={range.end}
            onChange={(event) => setRange((r) => ({ ...r, start: event.target.value }))}
            className="border border-slate-300 rounded-lg px-4 py-2 focus:ring-1 focus:ring-blue-500 outline-none text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">Tanggal Akhir</label>
          <input
            type="date"
            value={range.end}
            min={range.start}
            onChange={(event) => setRange((r) => ({ ...r, end: event.target.value }))}
            className="border border-slate-300 rounded-lg px-4 py-2 focus:ring-1 focus:ring-blue-500 outline-none text-sm"
          />
        </div>
        <button
          type="submit"
          className="bg-slate-800 hover:bg-slate-900 text-white px-5 py-2 rounded-lg text-sm font-bold transition-all duration-200 shadow-sm hover:shadow-md active:scale-95"
        >
          Terapkan
        </button>
        <button
          type="button"
          disabled={exporting}
          onClick={submitExport}
          className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-purple-700 disabled:opacity-70"
        >
          <Download className="h-4 w-4" />
          {exporting ? 'Mengekspor...' : 'Export Excel'}
        </button>
        {loading && <Loader2 size={18} className="animate-spin text-slate-400" />}
      </form>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        {summaryCards.map((card) => (
          <div key={card.label} className={`rounded-xl ${card.color} text-white p-5`}>
            <p className="text-sm font-medium opacity-90 flex items-center gap-2">
              <card.icon className="h-4 w-4" />
              {card.label}
            </p>
            <p className="text-xl font-extrabold mt-1">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6 mt-6">
        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 bg-slate-50">
            <h2 className="font-bold text-slate-800">Rekap Per Tanggal</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50">
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Tanggal</th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 text-right">Omset</th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 text-right">Voucher Ongkir</th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 text-right">Pesanan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-sm text-slate-400">Memuat data...</td>
                  </tr>
                ) : !data?.dailyRecap.length ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-slate-400">Belum ada data pada rentang ini.</td>
                  </tr>
                ) : (
                  data.dailyRecap.map((day) => (
                    <tr key={day.date} className="transition-colors hover:bg-slate-50/50">
                      <td className="px-6 py-3 text-sm font-medium text-slate-600">{formatShortDate(day.date)}</td>
                      <td className="px-6 py-3 text-sm text-right text-slate-800 font-semibold">{formatCurrency(day.omset)}</td>
                      <td className="px-6 py-3 text-sm text-right text-orange-600">{formatCurrency(day.voucherOngkir)}</td>
                      <td className="px-6 py-3 text-sm text-right text-slate-500">{day.orderCount}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {Boolean(data?.dailyRecap.length) && (
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50/70 font-bold">
                    <td className="px-6 py-3 text-sm text-slate-800">Total</td>
                    <td className="px-6 py-3 text-sm text-right text-slate-800">{formatCurrency(data?.totals.omset ?? 0)}</td>
                    <td className="px-6 py-3 text-sm text-right text-orange-600">{formatCurrency(data?.totals.voucherOngkir ?? 0)}</td>
                    <td className="px-6 py-3 text-sm text-right text-slate-600">{data?.totals.orderCount ?? 0}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden h-fit">
          <div className="p-5 border-b border-slate-100 bg-slate-50">
            <h2 className="font-bold text-slate-800">Promo Digunakan</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {loading ? (
              <p className="px-6 py-8 text-center text-sm text-slate-400">Memuat data...</p>
            ) : !data?.promoUsage.length ? (
              <p className="px-6 py-8 text-center text-sm text-slate-400">Tidak ada promo yang digunakan.</p>
            ) : (
              data.promoUsage.map((promo) => (
                <div key={promo.promoId} className="flex items-center justify-between px-6 py-3">
                  <span className="text-sm font-medium text-slate-700">{promo.promoName}</span>
                  <span className="rounded-lg border border-purple-200 bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-600">
                    {promo.usageCount}x
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
