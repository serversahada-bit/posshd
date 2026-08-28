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

type Direction = 'add' | 'reduce';

const TEXT: Record<Direction, {
  title: string;
  submitLabel: string;
  occurredAtLabel: string;
  invoiceNoteLabel: string;
  invoiceNotePlaceholder: string;
  invoiceProofLabel: string;
  catatanPlaceholder: string;
}> = {
  add: {
    title: 'Tambah Inventori Baru',
    submitLabel: 'Tambah Inventori',
    occurredAtLabel: 'Waktu Inventori Ditambah',
    invoiceNoteLabel: 'Keterangan Invoice',
    invoiceNotePlaceholder: 'Contoh: No. Invoice / PO dari supplier',
    invoiceProofLabel: 'Upload Bukti Invoice',
    catatanPlaceholder: 'Masukan catatan (jika ada)',
  },
  reduce: {
    title: 'Kurangi Inventori',
    submitLabel: 'Kurangi Inventori',
    occurredAtLabel: 'Waktu Inventori Dikurangi',
    invoiceNoteLabel: '',
    invoiceNotePlaceholder: '',
    invoiceProofLabel: '',
    catatanPlaceholder: 'Masukan catatan (jika ada)',
  },
};

export default function InventoryAdjustForm({ direction }: { direction: Direction }) {
  const router = useRouter();
  const { user } = useAuth();

  const [loadingData, setLoadingData] = useState(true);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);

  const [kategori, setKategori] = useState<'product' | 'gift' | ''>('');
  const [warehouseId, setWarehouseId] = useState<number | ''>('');
  const [itemId, setItemId] = useState<number | ''>('');
  const [jumlah, setJumlah] = useState<number | ''>('');
  const [jumlahBaik, setJumlahBaik] = useState<number | ''>('');
  const [jumlahRusak, setJumlahRusak] = useState<number | ''>('');
  const [occurredAt, setOccurredAt] = useState(() => toDatetimeLocalValue(new Date()));
  const [catatan, setCatatan] = useState('');
  const [invoiceNote, setInvoiceNote] = useState('');
  const [invoiceProofFile, setInvoiceProofFile] = useState<File | null>(null);
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

  const isAddLike = direction !== 'reduce';
  const { title, submitLabel, occurredAtLabel, invoiceNoteLabel, invoiceNotePlaceholder, invoiceProofLabel, catatanPlaceholder } = TEXT[direction];

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!kategori || !warehouseId || !itemId) return;
    if (isAddLike) {
      if (!jumlahBaik && !jumlahRusak) {
        Swal.fire('Gagal', 'Isi minimal salah satu: Jumlah Stok Baik atau Jumlah Stok Rusak.', 'error');
        return;
      }
    } else if (!jumlah) {
      Swal.fire('Gagal', 'Jumlah tidak boleh 0.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('item_type', kategori);
      fd.append('item_id', String(itemId));
      fd.append('warehouse_id', String(warehouseId));
      if (isAddLike) {
        if (jumlahBaik) fd.append('quantity_good', String(Math.abs(Number(jumlahBaik))));
        if (jumlahRusak) fd.append('quantity_bad', String(Math.abs(Number(jumlahRusak))));
      } else {
        fd.append('quantity_change', String(-Math.abs(Number(jumlah))));
      }
      if (catatan.trim()) fd.append('reason', catatan.trim());
      if (occurredAt) fd.append('occurred_at', new Date(occurredAt).toISOString());
      fd.append('user_id', String(user?.id ?? ''));
      if (isAddLike) {
        if (invoiceNote.trim()) fd.append('invoice_note', invoiceNote.trim());
        if (invoiceProofFile) fd.append('invoice_proof', invoiceProofFile);
      }

      const res = await fetch('/api/inventory/adjust', { method: 'POST', body: fd });
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
          <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
          <p className="text-sm text-slate-400 mt-1">
            <Link href="/inventori/flow" className="text-purple-600 hover:underline">Inventory Flow</Link> / {title}
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/inventori/flow" className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-colors">
            Cancel
          </Link>
        </div>
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
            <label className="block text-xs font-medium text-slate-500 mb-1">Gudang <span className="text-red-500">*</span></label>
            <select
              required
              value={warehouseId}
              disabled={loadingData}
              onChange={(event) => setWarehouseId(Number(event.target.value))}
              className="w-full border border-slate-300 text-slate-800 text-sm rounded-lg outline-none focus:ring-1 focus:ring-purple-300 px-3 py-2.5 bg-white disabled:bg-slate-50"
            >
              <option value="" disabled>Pilih Gudang</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>{warehouse.warehouse_name}</option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
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

          {isAddLike ? (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Jumlah Stok Baik (Good Stock)</label>
                <input
                  type="number"
                  min="0"
                  value={jumlahBaik}
                  onChange={(event) => setJumlahBaik(event.target.value === '' ? '' : Number(event.target.value))}
                  placeholder="Contoh: 90"
                  className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:ring-1 focus:ring-emerald-300 outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Jumlah Stok Rusak (Bad Stock)</label>
                <input
                  type="number"
                  min="0"
                  value={jumlahRusak}
                  onChange={(event) => setJumlahRusak(event.target.value === '' ? '' : Number(event.target.value))}
                  placeholder="Contoh: 10"
                  className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:ring-1 focus:ring-red-300 outline-none text-sm"
                />
              </div>
            </>
          ) : (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Jumlah <span className="text-red-500">*</span></label>
              <input
                type="number"
                required
                min="1"
                value={jumlah}
                onChange={(event) => setJumlah(event.target.value === '' ? '' : Number(event.target.value))}
                placeholder="Contoh: 100"
                className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:ring-1 focus:ring-purple-300 outline-none text-sm"
              />
            </div>
          )}

          {!isAddLike ? (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                {occurredAtLabel} <span className="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                required
                value={occurredAt}
                onChange={(event) => setOccurredAt(event.target.value)}
                className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:ring-1 focus:ring-purple-300 outline-none text-sm"
              />
            </div>
          ) : null}

          {isAddLike ? (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">{invoiceNoteLabel}</label>
                <input
                  type="text"
                  value={invoiceNote}
                  onChange={(event) => setInvoiceNote(event.target.value)}
                  placeholder={invoiceNotePlaceholder}
                  className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:ring-1 focus:ring-purple-300 outline-none text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">{invoiceProofLabel}</label>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.pdf"
                  onChange={(event) => setInvoiceProofFile(event.target.files?.[0] || null)}
                  className="block w-full text-sm text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100 transition-colors border border-slate-300 rounded-lg cursor-pointer"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  {occurredAtLabel} <span className="text-red-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  required
                  value={occurredAt}
                  onChange={(event) => setOccurredAt(event.target.value)}
                  className="w-full md:w-1/2 border border-slate-300 rounded-lg px-4 py-2.5 focus:ring-1 focus:ring-purple-300 outline-none text-sm"
                />
              </div>
            </>
          ) : null}

          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-500 mb-1">Catatan Tambahan</label>
            <textarea
              value={catatan}
              onChange={(event) => setCatatan(event.target.value)}
              rows={3}
              placeholder={catatanPlaceholder}
              className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:ring-1 focus:ring-purple-300 outline-none text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
          <Link href="/inventori/flow" className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-colors">
            Cancel
          </Link>
          <button type="submit" disabled={isSubmitting} className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm transition-colors disabled:opacity-60">
            {isSubmitting ? 'Menyimpan...' : submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
