'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Minus, ArrowLeftRight, RotateCcw, FileText } from 'lucide-react';
import InventoriTabs from '@/components/InventoriTabs';

type HistoryRow = {
  id: number;
  item_type: 'product' | 'gift';
  stock_type: 'good' | 'bad';
  item_name: string;
  warehouse_name: string;
  quantity_before: number;
  quantity_change: number;
  quantity_after: number;
  reason: string | null;
  invoice_note: string | null;
  supplier_name: string | null;
  invoice_proof_url: string | null;
  created_at: string;
  created_by_name: string;
};

const formatDate = (value: string) =>
  new Date(value).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });

const getProofUrl = (value: string) => (value.startsWith('http') ? value : `/${value.replace(/^\/+/, '')}`);

export default function InventoriFlowPage() {
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch('/api/inventory/history', { cache: 'no-store' });
      const json = await res.json();
      if (json.success) setHistory(json.data || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    void fetchHistory();
  }, []);

  return (
    <div className="p-6">
      <InventoriTabs active="flow" />

      <div className="flex flex-wrap gap-3 mb-6">
        <Link href="/inventori/flow/tambah" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-bold transition-colors">
          <Plus className="w-4 h-4" />
          Tambah Inventori
        </Link>
        <Link href="/inventori/flow/kurangi" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-500 hover:bg-slate-600 text-white text-sm font-bold transition-colors">
          <Minus className="w-4 h-4" />
          Kurangi Inventori
        </Link>
        <Link href="/inventori/flow/pindahkan" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-500 hover:bg-slate-600 text-white text-sm font-bold transition-colors">
          <ArrowLeftRight className="w-4 h-4" />
          Pindahkan Inventori
        </Link>
        <Link href="/inventori/flow/retur" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold transition-colors">
          <RotateCcw className="w-4 h-4" />
          Input Retur
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-slate-50/50">
          <h2 className="font-bold text-slate-800">Riwayat Pergerakan Inventori</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="p-3 font-semibold text-slate-600">Tanggal</th>
                <th className="p-3 font-semibold text-slate-600">Item</th>
                <th className="p-3 font-semibold text-slate-600">Gudang</th>
                <th className="p-3 font-semibold text-slate-600 text-center">Sebelum</th>
                <th className="p-3 font-semibold text-slate-600 text-center">Perubahan</th>
                <th className="p-3 font-semibold text-slate-600 text-center">Sesudah</th>
                <th className="p-3 font-semibold text-slate-600">Catatan</th>
                <th className="p-3 font-semibold text-slate-600">Supplier</th>
                <th className="p-3 font-semibold text-slate-600">Invoice</th>
                <th className="p-3 font-semibold text-slate-600">Oleh</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loadingHistory ? (
                <tr><td colSpan={10} className="text-center py-8 text-slate-400">Memuat...</td></tr>
              ) : history.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-8 text-slate-400">Belum ada pergerakan inventori.</td></tr>
              ) : (
                history.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/50">
                    <td className="p-3 text-slate-500 text-xs whitespace-nowrap">{formatDate(row.created_at)}</td>
                    <td className="p-3 text-slate-700 font-medium">
                      {row.item_name}
                      <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold border ${row.stock_type === 'bad' ? 'bg-red-50 text-red-600 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                        {row.stock_type === 'bad' ? 'Rusak' : 'Baik'}
                      </span>
                    </td>
                    <td className="p-3 text-slate-500">{row.warehouse_name}</td>
                    <td className="p-3 text-center text-slate-500">{row.quantity_before}</td>
                    <td className={`p-3 text-center font-bold ${row.quantity_change > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {row.quantity_change > 0 ? `+${row.quantity_change}` : row.quantity_change}
                    </td>
                    <td className="p-3 text-center font-bold text-slate-700">{row.quantity_after}</td>
                    <td className="p-3 text-slate-500 text-xs">{row.reason || '-'}</td>
                    <td className="p-3 text-slate-500 text-xs">{row.supplier_name || '-'}</td>
                    <td className="p-3 text-slate-500 text-xs">
                      {row.invoice_note ? <p className="mb-0.5">{row.invoice_note}</p> : null}
                      {row.invoice_proof_url ? (
                        <a href={getProofUrl(row.invoice_proof_url)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-purple-600 hover:underline font-semibold">
                          <FileText className="w-3 h-3" /> Lihat Bukti
                        </a>
                      ) : (!row.invoice_note ? '-' : null)}
                    </td>
                    <td className="p-3 text-slate-500 text-xs">{row.created_by_name}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
