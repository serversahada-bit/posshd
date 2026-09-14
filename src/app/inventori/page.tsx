'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Swal from 'sweetalert2';
import { Image as ImageIcon, Search } from 'lucide-react';
import InventoriTabs from '@/components/InventoriTabs';

type Warehouse = { id: number; warehouse_name: string };

type InventoryItem = {
  item_type: 'product' | 'gift';
  id: number;
  name: string;
  sku: string | null;
  price: number;
  image_url: string | null;
  total_stock: number;
  warehouse_stocks: Record<string, number>;
};

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Terjadi kesalahan');

const normalizeImageSrc = (value: string) => {
  if (!value) return '';
  if (value.startsWith('http') || value.startsWith('/')) return value;
  return `/${value}`;
};

export default function InventoriBalancePage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'product' | 'gift'>('all');

  const fetchInventory = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/inventory', { cache: 'no-store' });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      setItems(json.data.items);
    } catch (error) {
      Swal.fire('Gagal', getErrorMessage(error), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchInventory();
  }, []);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (typeFilter !== 'all' && item.item_type !== typeFilter) return false;
      if (search) {
        const keyword = search.toLowerCase();
        if (!item.name.toLowerCase().includes(keyword) && !(item.sku || '').toLowerCase().includes(keyword)) return false;
      }
      return true;
    });
  }, [items, typeFilter, search]);

  return (
    <div className="p-6">
      <InventoriTabs active="balance" />

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col md:flex-row gap-3 md:items-center mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari nama produk/hadiah atau SKU..."
            className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:ring-1 focus:ring-purple-300"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value as 'all' | 'product' | 'gift')}
          className="border border-slate-300 text-slate-800 text-sm rounded-lg outline-none focus:ring-1 focus:ring-purple-300 px-3 py-2.5 bg-white"
        >
          <option value="all">Semua Kategori</option>
          <option value="product">Produk</option>
          <option value="gift">Hadiah</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/50">
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Item</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Kategori</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">SKU</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Tersedia (Total Gudang)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr><td colSpan={4} className="text-center py-12 text-slate-400 text-sm">Memuat data...</td></tr>
              ) : filteredItems.length === 0 ? (
                <tr><td colSpan={4} className="text-center text-slate-400 py-12">Tidak ada item yang cocok.</td></tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={`${item.item_type}-${item.id}`} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg border border-slate-200 bg-slate-50 overflow-hidden relative flex items-center justify-center shrink-0">
                          {item.image_url ? (
                            <Image src={normalizeImageSrc(item.image_url)} alt={item.name} fill className="object-cover" />
                          ) : (
                            <ImageIcon className="w-5 h-5 text-slate-300" />
                          )}
                        </div>
                        <div>
                          <p className="font-bold text-slate-700">{item.name}</p>
                          <p className="text-xs text-slate-400 mt-0.5">Rp {Number(item.price).toLocaleString('id-ID')}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${item.item_type === 'product' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                        {item.item_type === 'product' ? 'Produk' : 'Hadiah'}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-50 text-slate-500 border border-slate-200">{item.sku || '-'}</span>
                    </td>
                    <td className="p-4 text-center">
                      <span className={`text-lg font-bold ${item.total_stock > 10 ? 'text-emerald-600' : item.total_stock > 0 ? 'text-amber-500' : 'text-red-500'}`}>
                        {Number(item.total_stock).toLocaleString('id-ID')}
                      </span>
                    </td>
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
