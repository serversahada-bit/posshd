'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Swal from 'sweetalert2';
import { useAuth } from '@/contexts/AuthContext';

type Warehouse = { id: number; warehouse_name: string };
type InventoryItem = {
  item_type: 'product' | 'gift';
  id: number;
  name: string;
  sku: string | null;
};

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Terjadi kesalahan');

const toDatetimeLocalValue = (date: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export default function PindahkanInventoriPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [loadingData, setLoadingData] = useState(true);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);

  const [kategori, setKategori] = useState<'product' | 'gift' | ''>('');
  const [itemId, setItemId] = useState<number | ''>('');
  const [fromWarehouseId, setFromWarehouseId] = useState<number | ''>('');
  const [toWarehouseId, setToWarehouseId] = useState<number | ''>('');
  const [jumlah, setJumlah] = useState<number | ''>('');
  const [occurredAt, setOccurredAt] = useState(() => toDatetimeLocalValue(new Date()));
  const [catatan, setCatatan] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetch('/api/inventory', { cache: 'no-store' })
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setWarehouses(json.data.warehouses);
          setItems(json.data.items);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingData(false));
  }, []);

  // Products and gifts have independent id sequences (a product and a gift can share the same id),
  // so only show items once a category is chosen — otherwise mixing both lists produces duplicate keys.
  const filteredItems = useMemo(() => (kategori ? items.filter((item) => item.item_type === kategori) : []), [items, kategori]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!kategori || !itemId || !fromWarehouseId || !toWarehouseId) return;
    if (fromWarehouseId === toWarehouseId) {
      Swal.fire('Gagal', 'Gudang asal dan tujuan tidak boleh sama.', 'error');
      return;
    }
    if (!jumlah) {
      Swal.fire('Gagal', 'Jumlah tidak boleh 0.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/inventory/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_type: kategori,
          item_id: itemId,
          from_warehouse_id: fromWarehouseId,
          to_warehouse_id: toWarehouseId,
          quantity: Math.abs(Number(jumlah)),
          reason: catatan.trim() || null,
          occurred_at: occurredAt ? new Date(occurredAt).toISOString() : null,
          user_id: user?.id,
        }),
      });
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
          <h1 className="text-2xl font-bold text-slate-800">Pindahkan Inventori</h1>
          <p className="text-sm text-slate-400 mt-1">
            <Link href="/inventori/flow" className="text-purple-600 hover:underline">Inventory Flow</Link> / Pindahkan Inventori
          </p>
        </div>
        <Link href="/inventori/flow" className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-colors">
          Cancel
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Kategori <span className="text-red-500">*</span></label>
            <select
              required
              value={kategori}
              disabled={loadingData}
              onChange={(event) => { setKategori(event.target.value as 'product' | 'gift'); setItemId(''); }}
              className="w-full border border-slate-300 text-slate-800 text-sm rounded-lg outline-none focus:ring-1 focus:ring-purple-300 px-3 py-2.5 bg-white disabled:bg-slate-50"
            >
              <option value="" disabled>Pilih Kategori</option>
              <option value="product">Produk</option>
              <option value="gift">Hadiah</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Produk / Varian <span className="text-red-500">*</span></label>
            <select
              required
              value={itemId}
              disabled={loadingData || !kategori}
              onChange={(event) => setItemId(Number(event.target.value))}
              className="w-full border border-slate-300 text-slate-800 text-sm rounded-lg outline-none focus:ring-1 focus:ring-purple-300 px-3 py-2.5 bg-white disabled:bg-slate-50"
            >
              <option value="" disabled>{kategori ? 'Pilih Produk / Varian' : 'Pilih Kategori dahulu'}</option>
              {filteredItems.map((item) => (
                <option key={`${item.item_type}-${item.id}`} value={item.id}>{item.name}{item.sku ? ` (${item.sku})` : ''}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Gudang Asal <span className="text-red-500">*</span></label>
            <select
              required
              value={fromWarehouseId}
              disabled={loadingData}
              onChange={(event) => setFromWarehouseId(Number(event.target.value))}
              className="w-full border border-slate-300 text-slate-800 text-sm rounded-lg outline-none focus:ring-1 focus:ring-purple-300 px-3 py-2.5 bg-white disabled:bg-slate-50"
            >
              <option value="" disabled>Pilih Gudang Asal</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>{warehouse.warehouse_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Gudang Tujuan <span className="text-red-500">*</span></label>
            <select
              required
              value={toWarehouseId}
              disabled={loadingData}
              onChange={(event) => setToWarehouseId(Number(event.target.value))}
              className="w-full border border-slate-300 text-slate-800 text-sm rounded-lg outline-none focus:ring-1 focus:ring-purple-300 px-3 py-2.5 bg-white disabled:bg-slate-50"
            >
              <option value="" disabled>Pilih Gudang Tujuan</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>{warehouse.warehouse_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Jumlah <span className="text-red-500">*</span></label>
            <input
              type="number"
              required
              min="1"
              value={jumlah}
              onChange={(event) => setJumlah(event.target.value === '' ? '' : Number(event.target.value))}
              placeholder="Contoh: 50"
              className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:ring-1 focus:ring-purple-300 outline-none text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Waktu Inventori Dipindahkan <span className="text-red-500">*</span></label>
            <input
              type="datetime-local"
              required
              value={occurredAt}
              onChange={(event) => setOccurredAt(event.target.value)}
              className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:ring-1 focus:ring-purple-300 outline-none text-sm"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-500 mb-1">Catatan Tambahan</label>
            <textarea
              value={catatan}
              onChange={(event) => setCatatan(event.target.value)}
              rows={3}
              placeholder="Masukan catatan (jika ada)"
              className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:ring-1 focus:ring-purple-300 outline-none text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
          <Link href="/inventori/flow" className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-colors">
            Cancel
          </Link>
          <button type="submit" disabled={isSubmitting} className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm transition-colors disabled:opacity-60">
            {isSubmitting ? 'Menyimpan...' : 'Pindahkan Inventori'}
          </button>
        </div>
      </form>
    </div>
  );
}
