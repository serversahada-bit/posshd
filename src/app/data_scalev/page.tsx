'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Columns3, RefreshCw, Search, Settings, X } from 'lucide-react';
import Select, { components, type MultiValueProps } from 'react-select';

type ScalevOrderRow = {
  id: string;
  order_id: string;
  status: string;
  payment_status: string;
  payment_method?: string | null;
  customer?: { name?: string; phone?: string; email?: string } | null;
  store?: { name?: string } | null;
  handler?: { id?: number; fullname?: string; phone?: string } | null;
  gross_revenue?: string | number | null;
  product_price?: string | number | null;
  shipping_cost?: string | number | null;
  product_discount?: string | number | null;
  shipping_discount?: string | number | null;
  total_weight?: string | number | null;
  courier_service?: { name?: string; code?: string } | null;
  destination_address?: {
    address?: string;
    city?: string;
    province?: string;
    postal_code?: string;
  } | null;
  is_dropshipping?: boolean | null;
  is_repeat?: boolean | null;
  is_probably_spam?: boolean | null;
  tags?: { id?: number; name?: string }[] | null;
  notes?: string | null;
  created_at?: string | null;
  draft_time?: string | null;
};

type ScalevOrderLineRow = {
  product_name?: string;
  quantity?: number | null;
  variant_option1_value?: string | null;
  variant_option2_value?: string | null;
  variant_option3_value?: string | null;
};

type ScalevOrdersResponse = {
  success: boolean;
  message?: string;
  data?: ScalevOrderRow[];
  hasNext?: boolean;
  nextCursor?: string | null;
};

const PAGE_SIZE = 25;
const COLUMNS_STORAGE_KEY = 'data_scalev_visible_columns';

const paymentStatusMap: Record<string, { label: string; className: string }> = {
  paid: { label: 'Paid', className: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
  unpaid: { label: 'Unpaid', className: 'bg-amber-50 text-amber-600 border-amber-200' },
  conflict: { label: 'Conflict', className: 'bg-red-50 text-red-600 border-red-200' },
  settled: { label: 'Settled', className: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
};

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

const formatWeight = (value?: string | number | null) => {
  if (value === null || value === undefined || value === '') return '-';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (Number.isNaN(num)) return '-';
  return `${num.toLocaleString('id-ID')} gr`;
};

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Terjadi kesalahan');

type SalesPersonOption = { value: string; label: string };

const filterSelectStyles = {
  control: (base: Record<string, unknown>) => ({
    ...base,
    borderRadius: '0.5rem',
    borderColor: '#cbd5e1',
    minHeight: '2.375rem',
    boxShadow: 'none',
    flexWrap: 'nowrap' as const,
    '&:hover': { borderColor: '#94a3b8' },
  }),
  valueContainer: (base: Record<string, unknown>) => ({ ...base, flexWrap: 'nowrap' as const }),
  menuPortal: (base: Record<string, unknown>) => ({ ...base, zIndex: 200 }),
};

// Collapses selected chips into a single "N dipilih" summary so the control keeps a fixed, single-line height.
const CompactMultiValue = (props: MultiValueProps<SalesPersonOption, true>) => {
  if (props.index > 0) {
    return null;
  }

  const selected = props.getValue();
  if (selected.length > 1) {
    return <components.MultiValue {...props}>{`${selected.length} dipilih`}</components.MultiValue>;
  }

  return <components.MultiValue {...props} />;
};

const BooleanBadge = ({ value }: { value?: boolean | null }) => (
  value ? (
    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-600 border border-blue-200">Ya</span>
  ) : (
    <span className="text-xs text-slate-300">-</span>
  )
);

const SkeletonBar = ({ className = 'w-24' }: { className?: string }) => (
  <div className={`h-3.5 rounded bg-slate-200 animate-pulse ${className}`} />
);

function SkeletonRow({ columnCount }: { columnCount: number }) {
  return (
    <tr>
      {Array.from({ length: columnCount }).map((_, index) => (
        <td className="p-4" key={index}><SkeletonBar className="w-16" /></td>
      ))}
    </tr>
  );
}

type RenderCtx = {
  orderlinesMap: Record<string, ScalevOrderLineRow[] | undefined>;
};

type ColumnDef = {
  key: string;
  label: string;
  group: string;
  render: (row: ScalevOrderRow, ctx: RenderCtx) => ReactNode;
  wrap?: boolean;
};

const COLUMN_DEFS: ColumnDef[] = [
  {
    key: 'customer',
    label: 'Customer',
    group: 'Detail Order',
    render: (row) => (
      <>
        <p className="font-semibold text-slate-700 text-sm">{row.customer?.name || '-'}</p>
        <p className="text-xs text-slate-400">{row.customer?.phone || '-'}</p>
        {row.customer?.email ? <p className="text-xs text-slate-400">{row.customer.email}</p> : null}
      </>
    ),
  },
  {
    key: 'status',
    label: 'Status',
    group: 'Detail Order',
    render: () => (
      <span className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">Draft</span>
    ),
  },
  {
    key: 'payment_status',
    label: 'Payment Status',
    group: 'Detail Order',
    render: (row) => {
      const badge = paymentStatusMap[row.payment_status] || { label: row.payment_status, className: 'bg-slate-50 text-slate-500 border-slate-200' };
      return <span className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${badge.className}`}>{badge.label}</span>;
    },
  },
  { key: 'payment_method', label: 'Metode Bayar', group: 'Detail Order', render: (row) => row.payment_method || '-' },
  { key: 'store', label: 'Store', group: 'Detail Order', render: (row) => row.store?.name || '-' },
  {
    key: 'produk',
    label: 'Produk',
    group: 'Detail Order',
    render: (row, ctx) => {
      const lines = ctx.orderlinesMap[row.order_id];
      if (lines === undefined) {
        return <div className="h-3 w-16 rounded bg-slate-200 animate-pulse" />;
      }
      if (lines.length === 0) return '-';
      return (
        <ul className="space-y-0.5">
          {lines.map((line, idx) => {
            const variant = [line.variant_option1_value, line.variant_option2_value, line.variant_option3_value].filter(Boolean).join(' / ');
            return (
              <li key={idx} className="text-xs">
                <span className="font-semibold text-slate-700">{line.quantity ?? 1}x</span>{' '}
                {line.product_name || 'Produk'}
                {variant ? <span className="text-slate-400"> ({variant})</span> : null}
              </li>
            );
          })}
        </ul>
      );
    },
    wrap: true,
  },
  {
    key: 'handler',
    label: 'Sales Person',
    group: 'Detail Order',
    render: (row) => (
      <>
        <p className="text-sm text-slate-700">{row.handler?.fullname || '-'}</p>
        {row.handler?.phone ? <p className="text-xs text-slate-400">{row.handler.phone}</p> : null}
      </>
    ),
  },
  {
    key: 'gross_revenue',
    label: 'Total Order',
    group: 'Finansial',
    render: (row) => <span className="font-semibold text-slate-700">{formatCurrency(row.gross_revenue)}</span>,
  },
  { key: 'product_price', label: 'Harga Produk', group: 'Finansial', render: (row) => formatCurrency(row.product_price) },
  { key: 'shipping_cost', label: 'Ongkir', group: 'Finansial', render: (row) => formatCurrency(row.shipping_cost) },
  { key: 'product_discount', label: 'Diskon Produk', group: 'Finansial', render: (row) => formatCurrency(row.product_discount) },
  { key: 'shipping_discount', label: 'Diskon Ongkir', group: 'Finansial', render: (row) => formatCurrency(row.shipping_discount) },
  { key: 'total_weight', label: 'Berat', group: 'Pengiriman', render: (row) => formatWeight(row.total_weight) },
  { key: 'courier_service', label: 'Kurir', group: 'Pengiriman', render: (row) => row.courier_service?.name || '-' },
  {
    key: 'destination_address',
    label: 'Alamat Tujuan',
    group: 'Pengiriman',
    render: (row) => {
      const address = row.destination_address;
      const line = [address?.address, address?.city, address?.province, address?.postal_code].filter(Boolean).join(', ');
      return line || '-';
    },
    wrap: true,
  },
  {
    key: 'tags',
    label: 'Tags',
    group: 'Lainnya',
    render: (row) => (row.tags || []).map((tag) => tag.name).filter(Boolean).join(', ') || '-',
    wrap: true,
  },
  {
    key: 'notes',
    label: 'Notes',
    group: 'Lainnya',
    render: (row) => row.notes || '-',
    wrap: true,
  },
  {
    key: 'flags',
    label: 'Dropship / Repeat / Spam',
    group: 'Lainnya',
    render: (row) => (
      <div className="flex items-center gap-1.5">
        <BooleanBadge value={row.is_dropshipping} />
        <BooleanBadge value={row.is_repeat} />
        {row.is_probably_spam ? (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-red-50 text-red-600 border border-red-200">Spam?</span>
        ) : null}
      </div>
    ),
  },
  {
    key: 'created_at',
    label: 'Created At',
    group: 'Lainnya',
    render: (row) => <span className="text-xs text-slate-500">{formatDate(row.created_at || row.draft_time)}</span>,
  },
];

const ALL_COLUMN_KEYS = COLUMN_DEFS.map((column) => column.key);
const COLUMN_GROUPS = Array.from(new Set(COLUMN_DEFS.map((column) => column.group)));

function loadStoredColumns(): string[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(COLUMNS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((key): key is string => ALL_COLUMN_KEYS.includes(key));
  } catch {
    return null;
  }
}

export default function DataScalevPage() {
  const [data, setData] = useState<ScalevOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [salesPeople, setSalesPeople] = useState<SalesPersonOption[]>([]);
  const [csFilterInput, setCsFilterInput] = useState<string[]>([]);
  const [csFilter, setCsFilter] = useState<string[]>([]);
  const [startDateInput, setStartDateInput] = useState('');
  const [endDateInput, setEndDateInput] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [visibleColumns, setVisibleColumns] = useState<string[]>(ALL_COLUMN_KEYS);
  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);
  const [draftColumns, setDraftColumns] = useState<string[]>(ALL_COLUMN_KEYS);
  const [orderlinesMap, setOrderlinesMap] = useState<Record<string, ScalevOrderLineRow[] | undefined>>({});
  const cursorRef = useRef<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const requestedOrderlineIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const stored = loadStoredColumns();
    if (stored && stored.length > 0) {
      setVisibleColumns(stored);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadSalesPeople = async () => {
      try {
        const res = await fetch('/api/scalev/sales-people', { cache: 'no-store' });
        const json: { success: boolean; data?: { id: number; fullname: string }[]; message?: string } = await res.json();
        if (!isMounted || !json.success || !json.data) return;
        setSalesPeople(json.data.map((person) => ({ value: String(person.id), label: person.fullname })));
      } catch {
        // Filter CS bersifat opsional — biarkan kosong kalau gagal dimuat, tidak perlu menghentikan halaman.
      }
    };

    void loadSalesPeople();
    return () => {
      isMounted = false;
    };
  }, []);

  // Diambil terpisah dari list utama (lihat catatan di route API) supaya load tabel tetap cepat;
  // kolom Produk terisi belakangan begitu request ini selesai, per order_id yang belum diminta.
  const fetchOrderlines = useCallback(async (orderIds: string[]) => {
    const toFetch = orderIds.filter((id) => !requestedOrderlineIdsRef.current.has(id));
    if (toFetch.length === 0) return;
    toFetch.forEach((id) => requestedOrderlineIdsRef.current.add(id));

    try {
      const res = await fetch('/api/scalev/orders/products?order_ids=' + toFetch.map(encodeURIComponent).join(','), { cache: 'no-store' });
      const json = await res.json();
      const resultMap: Record<string, ScalevOrderLineRow[]> = json.success && json.data ? json.data : {};
      setOrderlinesMap((prev) => {
        const next = { ...prev };
        for (const id of toFetch) next[id] = resultMap[id] || [];
        return next;
      });
    } catch {
      setOrderlinesMap((prev) => {
        const next = { ...prev };
        for (const id of toFetch) next[id] = prev[id] || [];
        return next;
      });
    }
  }, []);

  const activeColumns = useMemo(
    () => COLUMN_DEFS.filter((column) => visibleColumns.includes(column.key)),
    [visibleColumns]
  );
  const columnCount = activeColumns.length + 1;

  // Filter CS (handler) tidak didukung sebagai filter server-side oleh Scalev, jadi difilter di sini
  // dari data yang sudah termuat; infinite scroll tetap jalan karena `hasMore` mengikuti data mentah.
  const filteredData = useMemo(() => {
    if (csFilter.length === 0) return data;
    return data.filter((row) => row.handler?.id !== undefined && csFilter.includes(String(row.handler.id)));
  }, [data, csFilter]);

  const openColumnModal = () => {
    setDraftColumns(visibleColumns);
    setIsColumnModalOpen(true);
  };

  const toggleDraftColumn = (key: string) => {
    setDraftColumns((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]));
  };

  const saveColumns = () => {
    const next = draftColumns.length > 0 ? draftColumns : ALL_COLUMN_KEYS;
    setVisibleColumns(next);
    window.localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(next));
    setIsColumnModalOpen(false);
  };

  const fetchOrders = useCallback(async (cursor: string | null, append: boolean) => {
    try {
      const query = new URLSearchParams();
      query.set('status', 'draft');
      query.set('page_size', String(PAGE_SIZE));
      if (search) query.set('search', search);
      if (startDate) query.set('start_date', startDate);
      if (endDate) query.set('end_date', endDate);
      if (cursor) query.set('cursor', cursor);

      const res = await fetch('/api/scalev/orders?' + query.toString(), { cache: 'no-store' });
      const json: ScalevOrdersResponse = await res.json();

      if (!json.success) {
        setNeedsSetup(res.status === 400);
        throw new Error(json.message || 'Gagal mengambil data order Scalev');
      }

      setNeedsSetup(false);
      const rows = json.data || [];
      setData((prev) => (append ? [...prev, ...rows] : rows));
      setHasMore(Boolean(json.hasNext));
      cursorRef.current = json.nextCursor || null;
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
      if (!append) {
        setData([]);
        setHasMore(false);
      }
    }
  }, [search, startDate, endDate]);

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

  // Ambil `orderlines` untuk baris yang sedang tampil begitu kolom Produk aktif —
  // baik saat data baru masuk (initial/infinite scroll) maupun saat kolom baru dicentang di modal Kolom.
  useEffect(() => {
    if (visibleColumns.includes('produk') && data.length > 0) {
      void fetchOrderlines(data.map((row) => row.order_id));
    }
  }, [visibleColumns, data, fetchOrderlines]);

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

  return (
    <div className="h-full flex flex-col p-6 max-w-[1900px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Data Scalev</h1>
        <p className="text-sm text-slate-400 mt-1">Daftar order berstatus Draft yang ditarik langsung dari Scalev.</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-6">
        <form
          className="flex flex-col md:flex-row md:flex-wrap gap-4 md:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(searchInput.trim());
            setCsFilter(csFilterInput);
            setStartDate(startDateInput);
            setEndDate(endDateInput);
          }}
        >
          <div className="w-full md:flex-1 md:min-w-[220px]">
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
          <div className="w-full md:flex-1 md:min-w-[220px]">
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Nama CS</label>
            <Select
              isMulti
              value={salesPeople.filter((option) => csFilterInput.includes(option.value))}
              onChange={(selected) => setCsFilterInput(selected.map((item) => item.value))}
              options={salesPeople}
              placeholder="Semua CS"
              closeMenuOnSelect={false}
              components={{ MultiValue: CompactMultiValue }}
              menuPortalTarget={typeof document !== 'undefined' ? document.body : undefined}
              className="text-sm text-slate-800"
              styles={filterSelectStyles}
              noOptionsMessage={() => 'Tidak ada data CS'}
            />
          </div>
          <div className="w-full md:w-auto">
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Tanggal Mulai</label>
            <input
              type="date"
              value={startDateInput}
              max={endDateInput || undefined}
              onChange={(event) => setStartDateInput(event.target.value)}
              className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-1 focus:ring-blue-500 outline-none text-sm"
            />
          </div>
          <div className="w-full md:w-auto">
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Tanggal Akhir</label>
            <input
              type="date"
              value={endDateInput}
              min={startDateInput || undefined}
              onChange={(event) => setEndDateInput(event.target.value)}
              className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-1 focus:ring-blue-500 outline-none text-sm"
            />
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <button type="submit" className="px-4 py-2 rounded-lg text-sm font-bold border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors">
              Terapkan
            </button>
            {(searchInput || csFilterInput.length > 0 || startDateInput || endDateInput) ? (
              <button
                type="button"
                onClick={() => {
                  setSearchInput('');
                  setCsFilterInput([]);
                  setStartDateInput('');
                  setEndDateInput('');
                  setSearch('');
                  setCsFilter([]);
                  setStartDate('');
                  setEndDate('');
                }}
                className="px-4 py-2 rounded-lg text-sm font-bold border border-slate-300 text-slate-500 hover:bg-slate-50 transition-colors"
              >
                Reset
              </button>
            ) : null}
            <button
              type="button"
              onClick={openColumnModal}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <Columns3 className="w-4 h-4" />
              Kolom
            </button>
            <button
              type="button"
              onClick={() => void fetchData()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </form>
      </div>

      {needsSetup ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 flex flex-col items-center justify-center text-center">
          <Settings className="w-10 h-10 text-slate-300 mb-3" />
          <p className="text-slate-600 font-semibold">API Key Scalev belum dikonfigurasi</p>
          <p className="text-sm text-slate-400 mt-1 mb-4">Tambahkan atau aktifkan koneksi Scalev terlebih dahulu untuk menampilkan data order.</p>
          <Link href="/setting_scalev" className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors">
            Buka Pengaturan API
          </Link>
        </div>
      ) : errorMessage ? (
        <div className="bg-white rounded-xl border border-red-200 shadow-sm p-8 text-center">
          <p className="text-red-500 text-sm font-medium">{errorMessage}</p>
        </div>
      ) : (
        <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50">
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Order ID</th>
                  {activeColumns.map((column) => (
                    <th key={column.key} className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loading ? (
                  Array.from({ length: 8 }).map((_, index) => <SkeletonRow key={`initial-skeleton-${index}`} columnCount={columnCount} />)
                ) : filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={columnCount} className="text-center py-12 text-slate-400">
                      <p className="text-sm">{csFilter.length > 0 ? 'Tidak ada order dengan CS tersebut.' : 'Tidak ada order berstatus Draft.'}</p>
                    </td>
                  </tr>
                ) : (
                  filteredData.map((row) => (
                    <tr key={row.order_id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 whitespace-nowrap">
                        <Link
                          href={`/buat_pesanan_scalev?scalev_order_id=${encodeURIComponent(row.order_id)}`}
                          className="font-semibold text-blue-700 text-sm hover:underline"
                          title="Buat pesanan (Akuisisi) dari order Scalev ini"
                        >
                          {row.order_id}
                        </Link>
                      </td>
                      {activeColumns.map((column) => (
                        <td key={column.key} className={`p-4 text-sm text-slate-600 ${column.wrap ? 'max-w-[260px] align-top' : 'whitespace-nowrap'}`}>
                          {column.render(row, { orderlinesMap })}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
                {isLoadingMore ? (
                  Array.from({ length: 4 }).map((_, index) => <SkeletonRow key={`more-skeleton-${index}`} columnCount={columnCount} />)
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

      {isColumnModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setIsColumnModalOpen(false)}>
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-[640px] max-h-[85vh] flex flex-col"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-base font-bold text-slate-800">Customize Columns</h2>
              <button type="button" onClick={() => setIsColumnModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-4 overflow-y-auto custom-scrollbar space-y-5">
              {COLUMN_GROUPS.map((group) => (
                <div key={group}>
                  <p className="text-sm font-semibold text-slate-700 border-b border-slate-200 pb-1.5 mb-3">{group}</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {COLUMN_DEFS.filter((column) => column.group === group).map((column) => (
                      <label key={column.key} className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={draftColumns.includes(column.key)}
                          onChange={() => toggleDraftColumn(column.key)}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        {column.label}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setDraftColumns(ALL_COLUMN_KEYS)}
                className="text-sm font-semibold text-red-500 hover:text-red-600"
              >
                Reset Columns
              </button>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsColumnModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-sm font-bold border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setDraftColumns(ALL_COLUMN_KEYS)}
                  className="px-4 py-2 rounded-lg text-sm font-bold border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={saveColumns}
                  className="px-4 py-2 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
