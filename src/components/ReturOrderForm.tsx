'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search, PackageCheck, Gift, Boxes } from 'lucide-react';
import Swal from 'sweetalert2';
import { useAuth } from '@/contexts/AuthContext';

type Source = 'CSO' | 'CSO_AUTO' | 'CRM';

type OrderSearchResult = {
  source: Source;
  source_label: string;
  order_id: number;
  order_code: string;
  warehouse_id: number;
  warehouse_name: string;
  customer_name: string;
  resi: string | null;
  created_at: string;
};

type OrderItem = {
  order_item_id: number;
  product_id: number;
  product_name: string;
  qty: number;
  is_gift: boolean;
  is_bundle: boolean;
};

type OrderDetail = {
  source: Source;
  order_id: number;
  order_code: string;
  warehouse_id: number;
  warehouse_name: string;
  customer_name: string;
  items: OrderItem[];
};

type ItemInput = OrderItem & { good: number | ''; bad: number | '' };

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Terjadi kesalahan');

const toDatetimeLocalValue = (date: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const formatDate = (value: string) =>
  new Date(value).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });

export default function ReturOrderForm() {
  const router = useRouter();
  const { user } = useAuth();

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<OrderSearchResult[]>([]);
  const [searched, setSearched] = useState(false);

  const [loadingDetail, setLoadingDetail] = useState(false);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [itemInputs, setItemInputs] = useState<ItemInput[]>([]);

  const [occurredAt, setOccurredAt] = useState(() => toDatetimeLocalValue(new Date()));
  const [catatan, setCatatan] = useState('');
  const [invoiceNote, setInvoiceNote] = useState('');
  const [invoiceProofFile, setInvoiceProofFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const runSearch = async (q: string) => {
    setSearching(true);
    try {
      const res = await fetch(`/api/inventory/retur/search?q=${encodeURIComponent(q)}`, { cache: 'no-store' });
      const json = await res.json();
      if (json.success) setResults(json.data || []);
    } catch (error) {
      console.error(error);
    } finally {
      setSearching(false);
      setSearched(true);
    }
  };

  useEffect(() => {
    void runSearch('');
  }, []);

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runSearch(query.trim());
  };

  const selectOrder = async (result: OrderSearchResult) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/inventory/retur/order?source=${result.source}&order_id=${result.order_id}`, { cache: 'no-store' });
      const json = await res.json();
      if (!json.success) {
        Swal.fire('Gagal', json.message, 'error');
        return;
      }
      const detail: OrderDetail = json.data;
      if (detail.items.length === 0) {
        Swal.fire('Gagal', 'Order ini tidak punya item produk yang bisa diretur.', 'error');
        return;
      }
      setOrder(detail);
      setItemInputs(detail.items.map((item) => ({ ...item, good: item.qty, bad: 0 })));
    } catch (error) {
      Swal.fire('Gagal', getErrorMessage(error), 'error');
    } finally {
      setLoadingDetail(false);
    }
  };

  const resetOrder = () => {
    setOrder(null);
    setItemInputs([]);
  };

  const updateItemInput = (orderItemId: number, field: 'good' | 'bad', value: string) => {
    const numeric = value === '' ? '' : Math.max(0, Number(value));
    setItemInputs((prev) => prev.map((item) => (item.order_item_id === orderItemId ? { ...item, [field]: numeric } : item)));
  };

  const totalBoxes = itemInputs.reduce((sum, item) => sum + item.qty, 0);
  const isBalanced = itemInputs.every((item) => (Number(item.good) || 0) + (Number(item.bad) || 0) === item.qty);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!order) return;
    if (!isBalanced) {
      Swal.fire('Gagal', 'Total Baik + Rusak tiap produk harus sama dengan jumlah yang dibeli.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('source', order.source);
      fd.append('order_id', String(order.order_id));
      fd.append('items', JSON.stringify(itemInputs.map((item) => ({
        product_id: item.product_id,
        product_name: item.product_name,
        is_gift: item.is_gift,
        qty: item.qty,
        quantity_good: Number(item.good) || 0,
        quantity_bad: Number(item.bad) || 0,
      }))));
      if (catatan.trim()) fd.append('reason', catatan.trim());
      if (occurredAt) fd.append('occurred_at', new Date(occurredAt).toISOString());
      fd.append('user_id', String(user?.id ?? ''));
      if (invoiceNote.trim()) fd.append('invoice_note', invoiceNote.trim());
      if (invoiceProofFile) fd.append('invoice_proof', invoiceProofFile);

      const res = await fetch('/api/inventory/retur/confirm', { method: 'POST', body: fd });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);

      Swal.fire('Berhasil', json.message, 'success');
      router.push('/inventori/flow');
    } catch (error) {
      Swal.fire('Gagal', getErrorMessage(error), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Input Retur Barang</h1>
          <p className="text-sm text-slate-400 mt-1">
            <Link href="/inventori/flow" className="text-purple-600 hover:underline">Inventory Flow</Link> / Input Retur
          </p>
        </div>
        <Link href="/inventori/flow" className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-colors">
          Cancel
        </Link>
      </div>

      {!order ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
          <form onSubmit={handleSearchSubmit} className="flex gap-3">
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari ID Order atau No. Resi (status Shipped)..."
              className="flex-1 border border-slate-300 rounded-lg px-4 py-2.5 focus:ring-1 focus:ring-purple-300 outline-none text-sm"
            />
            <button type="submit" disabled={searching} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm transition-colors disabled:opacity-60">
              <Search className="w-4 h-4" />
              Cari
            </button>
          </form>

          <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden">
            {searching ? (
              <p className="text-center py-8 text-slate-400 text-sm">Mencari...</p>
            ) : results.length === 0 ? (
              <p className="text-center py-8 text-slate-400 text-sm">{searched ? 'Tidak ada order Shipped yang cocok.' : 'Memuat...'}</p>
            ) : (
              results.map((result) => (
                <button
                  type="button"
                  key={`${result.source}-${result.order_id}`}
                  onClick={() => void selectOrder(result)}
                  disabled={loadingDetail}
                  className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex items-center justify-between gap-3 disabled:opacity-60"
                >
                  <div>
                    <p className="font-semibold text-slate-800 text-sm">
                      {result.order_code}
                      <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold border bg-blue-50 text-blue-600 border-blue-200">{result.source_label}</span>
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">{result.customer_name} • {result.warehouse_name}{result.resi ? ` • Resi: ${result.resi}` : ''}</p>
                  </div>
                  <span className="text-xs text-slate-400 whitespace-nowrap">{formatDate(result.created_at)}</span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-5">
          <div className="flex items-start justify-between gap-3 bg-slate-50 border border-slate-200 rounded-lg p-4">
            <div>
              <p className="font-bold text-slate-800 flex items-center gap-2">
                <PackageCheck className="w-4 h-4 text-purple-600" />
                {order.order_code}
              </p>
              <p className="text-xs text-slate-500 mt-1">{order.customer_name} • Gudang: {order.warehouse_name} • Total {totalBoxes} box</p>
            </div>
            <button type="button" onClick={resetOrder} className="text-xs font-semibold text-purple-600 hover:underline whitespace-nowrap">
              Ganti Order
            </button>
          </div>

          <div className="space-y-3">
            <label className="block text-xs font-medium text-slate-500">Alokasi Stok Baik / Rusak per Produk</label>
            {itemInputs.map((item) => {
              const good = Number(item.good) || 0;
              const bad = Number(item.bad) || 0;
              const balanced = good + bad === item.qty;
              return (
                <div key={item.order_item_id} className="border border-slate-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="font-semibold text-slate-700 text-sm flex items-center gap-2">
                      {item.is_gift ? <Gift className="w-4 h-4 text-pink-500" /> : <Boxes className="w-4 h-4 text-slate-400" />}
                      {item.product_name}
                      {item.is_gift ? <span className="px-1.5 py-0.5 rounded text-[10px] font-bold border bg-pink-50 text-pink-600 border-pink-200">Hadiah</span> : null}
                      {item.is_bundle ? <span className="px-1.5 py-0.5 rounded text-[10px] font-bold border bg-amber-50 text-amber-600 border-amber-200">Bundle</span> : null}
                    </p>
                    <span className="text-xs font-semibold text-slate-500">Dibeli: {item.qty}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">Jumlah Stok Baik</label>
                      <input
                        type="number"
                        min="0"
                        value={item.good}
                        onChange={(event) => updateItemInput(item.order_item_id, 'good', event.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-1 focus:ring-emerald-300 outline-none text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">Jumlah Stok Rusak</label>
                      <input
                        type="number"
                        min="0"
                        value={item.bad}
                        onChange={(event) => updateItemInput(item.order_item_id, 'bad', event.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-1 focus:ring-red-300 outline-none text-sm"
                      />
                    </div>
                  </div>
                  {!balanced ? (
                    <p className="text-[11px] text-red-500 mt-2">Baik + Rusak harus = {item.qty} (sekarang {good + bad}).</p>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Keterangan Retur</label>
              <input
                type="text"
                value={invoiceNote}
                onChange={(event) => setInvoiceNote(event.target.value)}
                placeholder="Contoh: No. Resi / Alasan Retur dari Ekspedisi"
                className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:ring-1 focus:ring-purple-300 outline-none text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Upload Bukti Retur</label>
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.pdf"
                onChange={(event) => setInvoiceProofFile(event.target.files?.[0] || null)}
                className="block w-full text-sm text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100 transition-colors border border-slate-300 rounded-lg cursor-pointer"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Waktu Retur Diterima <span className="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                required
                value={occurredAt}
                onChange={(event) => setOccurredAt(event.target.value)}
                className="w-full md:w-1/2 border border-slate-300 rounded-lg px-4 py-2.5 focus:ring-1 focus:ring-purple-300 outline-none text-sm"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-500 mb-1">Catatan Tambahan</label>
              <textarea
                value={catatan}
                onChange={(event) => setCatatan(event.target.value)}
                rows={3}
                placeholder="Masukan alasan retur (jika ada)"
                className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:ring-1 focus:ring-purple-300 outline-none text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button type="button" onClick={resetOrder} className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-colors">
              Batal
            </button>
            <button type="submit" disabled={isSubmitting || !isBalanced} className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm transition-colors disabled:opacity-60">
              {isSubmitting ? 'Menyimpan...' : 'Konfirmasi Retur (Ubah Status ke RTS)'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
