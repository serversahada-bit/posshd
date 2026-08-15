'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Swal from 'sweetalert2';
import { CheckCircle2, CircleDashed, RefreshCw, Search, Send } from 'lucide-react';

type ScalevOrderRow = {
  order_id: string;
  customer?: { name?: string; phone?: string } | null;
  store?: { name?: string } | null;
  handler?: { fullname?: string } | null;
  gross_revenue?: string | number | null;
  created_at?: string | null;
  draft_time?: string | null;
};

type ScalevOrdersResponse = {
  success: boolean;
  message?: string;
  data?: ScalevOrderRow[];
  hasNext?: boolean;
  nextCursor?: string | null;
};

type PosStatusEntry = {
  order_code: string;
  order_status: string | null;
  source_table: 'CSO' | 'CSO_AUTO' | 'CRM';
  scalev_synced_at: string | null;
};

type PosStatusResponse = {
  success: boolean;
  message?: string;
  data?: Record<string, PosStatusEntry>;
};

const PAGE_SIZE = 25;

const formatDate = (dateStr?: string | null) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const formatCurrency = (value?: string | number | null) => {
  if (value === null || value === undefined || value === '') return '-';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (Number.isNaN(num)) return '-';
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num);
};

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Terjadi kesalahan');

export default function PosToScalevPage() {
  const [data, setData] = useState<ScalevOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [onlyUnprocessed, setOnlyUnprocessed] = useState(false);
  const [posStatusMap, setPosStatusMap] = useState<Record<string, PosStatusEntry | null>>({});
  const [syncingOrderCode, setSyncingOrderCode] = useState<string | null>(null);

  const cursorRef = useRef<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const requestedStatusIdsRef = useRef<Set<string>>(new Set());

  // Menggantikan cek manual lewat Google Sheets (scalev_to_pos.py): begitu satu halaman draft
  // termuat, langsung dicek ke DB lokal order_id mana yang sudah punya pesanan POS.
  const fetchPosStatus = useCallback(async (orderIds: string[]) => {
    const toFetch = orderIds.filter((id) => !requestedStatusIdsRef.current.has(id));
    if (toFetch.length === 0) return;
    toFetch.forEach((id) => requestedStatusIdsRef.current.add(id));

    try {
      const res = await fetch('/api/scalev/pos-status?order_ids=' + toFetch.map(encodeURIComponent).join(','), { cache: 'no-store' });
      const json: PosStatusResponse = await res.json();
      const resultMap = json.success && json.data ? json.data : {};
      setPosStatusMap((prev) => {
        const next = { ...prev };
        for (const id of toFetch) next[id] = resultMap[id] || null;
        return next;
      });
    } catch {
      setPosStatusMap((prev) => {
        const next = { ...prev };
        for (const id of toFetch) next[id] = prev[id] ?? null;
        return next;
      });
    }
  }, []);

  // Trigger manual "Kirim ke Scalev" — dipakai kalau sinkronisasi otomatis saat pembuatan pesanan
  // sebelumnya gagal (mis. Scalev sempat bermasalah), tanpa harus buat ulang pesanannya di POS.
  const handleSyncToScalev = async (orderId: string, orderCode: string) => {
    setSyncingOrderCode(orderCode);
    try {
      const res = await fetch('/api/scalev/sync-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_code: orderCode }),
      });
      const json: { success: boolean; message?: string } = await res.json();

      if (!json.success) {
        throw new Error(json.message || 'Gagal mengirim ke Scalev');
      }

      await Swal.fire('Berhasil', json.message || 'Order berhasil dikirim ke Scalev.', 'success');
      requestedStatusIdsRef.current.delete(orderId);
      void fetchPosStatus([orderId]);
    } catch (error: unknown) {
      Swal.fire('Gagal', getErrorMessage(error), 'error');
    } finally {
      setSyncingOrderCode(null);
    }
  };

  const fetchOrders = useCallback(async (cursor: string | null, append: boolean) => {
    try {
      const query = new URLSearchParams();
      query.set('status', 'draft');
      query.set('page_size', String(PAGE_SIZE));
      if (search) query.set('search', search);
      if (cursor) query.set('cursor', cursor);

      const res = await fetch('/api/scalev/orders?' + query.toString(), { cache: 'no-store' });
      const json: ScalevOrdersResponse = await res.json();

      if (!json.success) {
        throw new Error(json.message || 'Gagal mengambil data order Scalev');
      }

      const rows = json.data || [];
      setData((prev) => (append ? [...prev, ...rows] : rows));
      setHasMore(Boolean(json.hasNext));
      cursorRef.current = json.nextCursor || null;
      void fetchPosStatus(rows.map((row) => row.order_id));
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
      if (!append) {
        setData([]);
        setHasMore(false);
      }
    }
  }, [search, fetchPosStatus]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    cursorRef.current = null;
    await fetchOrders(null, false);
    setLoading(false);
  }, [fetchOrders]);

  const loadMoreData = useCallback(async () => {
    setIsLoadingMore(true);
    await fetchOrders(cursorRef.current, true);
    setIsLoadingMore(false);
  }, [fetchOrders]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !loading && !isLoadingMore) {
        void loadMoreData();
      }
    }, { rootMargin: '200px' });

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loading, isLoadingMore, loadMoreData]);

  const visibleData = onlyUnprocessed ? data.filter((row) => posStatusMap[row.order_id] !== undefined && !posStatusMap[row.order_id]) : data;
  const processedCount = data.filter((row) => posStatusMap[row.order_id]).length;
  const columnCount = 6;

  return (
    <div className="h-full flex flex-col p-6 max-w-[1600px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">POS to Scalev</h1>
        <p className="text-sm text-slate-400 mt-1">
          Cek draft order Scalev mana yang sudah dibuatkan pesanan di POS dan mana yang belum — menggantikan pengecekan manual lewat Google Sheets.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-6">
        <div className="flex flex-col gap-4">
          <form
            className="flex flex-col md:flex-row gap-4 md:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(searchInput.trim());
            }}
          >
            <div className="w-full flex-1">
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Pencarian Order ID</label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cari Order ID..."
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  className="w-full border border-slate-300 rounded-lg pl-9 pr-4 py-2 focus:ring-1 focus:ring-blue-500 outline-none text-sm placeholder:text-slate-400"
                />
              </div>
            </div>
            <div className="flex gap-2 w-full md:w-auto">
              <button type="submit" className="w-full md:w-auto bg-slate-800 text-white px-5 py-2 rounded-lg text-sm font-bold hover:bg-slate-700 transition-colors">
                Cari
              </button>
              <button
                type="button"
                onClick={() => void fetchData()}
                className="w-full md:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-bold border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            </div>
          </form>

          <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={onlyUnprocessed}
              onChange={(event) => setOnlyUnprocessed(event.target.checked)}
              className="w-4 h-4 rounded border-slate-300 accent-blue-600"
            />
            Hanya tampilkan yang belum dibuat pesanan
          </label>
        </div>
      </div>

      {errorMessage ? (
        <div className="bg-white rounded-xl border border-red-200 shadow-sm p-8 text-center">
          <p className="text-red-500 text-sm font-medium">{errorMessage}</p>
        </div>
      ) : (
        <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="px-5 py-3 border-b border-slate-100 text-xs text-slate-500">
            {loading ? 'Memuat...' : `${processedCount} dari ${data.length} draft yang termuat sudah punya pesanan POS`}
          </div>
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50">
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Order ID</th>
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Customer</th>
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Sales Person</th>
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Total Order</th>
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Created At</th>
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Status POS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loading ? (
                  Array.from({ length: 8 }).map((_, index) => (
                    <tr key={`skeleton-${index}`}>
                      {Array.from({ length: columnCount }).map((__, colIndex) => (
                        <td className="p-4" key={colIndex}><div className="h-3.5 w-20 rounded bg-slate-200 animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                ) : visibleData.length === 0 ? (
                  <tr>
                    <td colSpan={columnCount} className="text-center py-12 text-slate-400">
                      <p className="text-sm">{onlyUnprocessed ? 'Semua draft yang termuat sudah punya pesanan POS.' : 'Tidak ada order berstatus Draft.'}</p>
                    </td>
                  </tr>
                ) : (
                  visibleData.map((row) => {
                    const status = posStatusMap[row.order_id];
                    return (
                      <tr key={row.order_id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-4 whitespace-nowrap font-semibold text-slate-700 text-sm">{row.order_id}</td>
                        <td className="p-4 whitespace-nowrap text-sm text-slate-600">
                          <p className="font-semibold text-slate-700">{row.customer?.name || '-'}</p>
                          <p className="text-xs text-slate-400">{row.customer?.phone || '-'}</p>
                        </td>
                        <td className="p-4 whitespace-nowrap text-sm text-slate-600">{row.handler?.fullname || '-'}</td>
                        <td className="p-4 whitespace-nowrap text-sm font-semibold text-slate-700">{formatCurrency(row.gross_revenue)}</td>
                        <td className="p-4 whitespace-nowrap text-xs text-slate-500">{formatDate(row.created_at || row.draft_time)}</td>
                        <td className="p-4 whitespace-nowrap">
                          {status === undefined ? (
                            <div className="h-6 w-24 rounded bg-slate-200 animate-pulse" />
                          ) : status ? (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Link
                                href={`/olahan/edit?id=${encodeURIComponent(status.order_code)}&source=${status.source_table}`}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                                title={`Lihat pesanan ${status.order_code}`}
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Sudah Dibuat
                              </Link>
                              {status.source_table === 'CSO' && !status.scalev_synced_at ? (
                                <button
                                  type="button"
                                  onClick={() => void handleSyncToScalev(row.order_id, status.order_code)}
                                  disabled={syncingOrderCode === status.order_code}
                                  title="Kirim data pesanan ini ke Scalev (kurir, gudang, alamat) & ubah status ke pending"
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <Send className={`w-3.5 h-3.5 ${syncingOrderCode === status.order_code ? 'animate-pulse' : ''}`} />
                                  {syncingOrderCode === status.order_code ? 'Mengirim...' : 'Kirim ke Scalev'}
                                </button>
                              ) : status.source_table === 'CSO' && status.scalev_synced_at ? (
                                <span className="inline-flex items-center gap-1 text-[11px] text-slate-400" title={`Terkirim ke Scalev: ${new Date(status.scalev_synced_at).toLocaleString('id-ID')}`}>
                                  Terkirim ke Scalev
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <Link
                              href={`/buat_pesanan_scalev?scalev_order_id=${encodeURIComponent(row.order_id)}`}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100 transition-colors"
                            >
                              <CircleDashed className="w-3.5 h-3.5" />
                              Belum Dibuat
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
                {isLoadingMore ? (
                  Array.from({ length: 4 }).map((_, index) => (
                    <tr key={`more-skeleton-${index}`}>
                      {Array.from({ length: columnCount }).map((__, colIndex) => (
                        <td className="p-4" key={colIndex}><div className="h-3.5 w-20 rounded bg-slate-200 animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                ) : null}
                {hasMore ? (
                  <tr>
                    <td colSpan={columnCount} className="p-0 border-0">
                      <div ref={sentinelRef} className="h-px" />
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
