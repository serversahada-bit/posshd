'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Download, Upload, Trash2, FileSpreadsheet, Search, Edit, Truck, SlidersHorizontal, X, ExternalLink } from 'lucide-react';
import Swal from 'sweetalert2';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import Select, { components, type MultiValueProps } from 'react-select';

import { useAuth } from '@/contexts/AuthContext';
import { useSocketEvent } from '@/hooks/useSocketEvent';

type OrderItem = {
  order_id: number;
  order_code: string;
  order_status: string;
  created_at: string;
  processing_at: string | null;
  last_update: string;
  advertiser_name: string | null;
  ad_source: string | null;
  notes: string | null;
  warehouse_id: number | null;
  warehouse_name: string | null;
  customer_name: string;
  whatsapp_number: string;
  desa: string | null;
  product_names: string | null;
  resi: string | null;
  id_reff: string | null;
  courier_name: string | null;
  courier_service: string | null;
  creator_name: string | null;
  source_table: string;
  source_label: string;
};

type OlahanResponse = {
  status: 'success' | 'error';
  message?: string;
  data?: OrderItem[];
  hasMore?: boolean;
  total?: number;
};

const PAGE_SIZE = 20;

type UserFilterOption = {
  id: number;
  name: string;
  email: string;
  role: string;
};

type WarehouseFilterOption = {
  id: number;
  warehouse_name: string;
};

const statusOptions = [
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'ready_to_ship', label: 'Ready To Ship' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'completed', label: 'Completed' },
  { value: 'rts', label: 'RTS' },
  { value: 'problem', label: 'Problem' },
  { value: 'cancelled', label: 'Cancel' },
];

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

type FilterOption = { value: string; label: string };

// Collapses selected chips into a single "N dipilih" summary so the control keeps a fixed, single-line height.
const CompactMultiValue = (props: MultiValueProps<FilterOption, true>) => {
  if (props.index > 0) {
    return null;
  }

  const selected = props.getValue();
  if (selected.length > 1) {
    return <components.MultiValue {...props}>{`${selected.length} dipilih`}</components.MultiValue>;
  }

  return <components.MultiValue {...props} />;
};

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Terjadi kesalahan');

const formatCurrency = (value: number) => `Rp ${Number(value || 0).toLocaleString('id-ID')}`;

// Resend orders stash the original order code in notes as "[OLD:xxx]" (see orders_resend/route.ts).
const getOldOrderId = (notes: string | null) => notes?.match(/\[OLD:(.*?)\]/)?.[1]?.trim() || null;

const getProofUrl = (value?: string | null) => {
  if (!value) {
    return '';
  }

  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value;
  }

  return `/${value.replace(/^\/+/, '')}`;
};

export default function OlahanPage() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sortByParam = searchParams.get('sort') ?? 'created_at';
  const statusParam = searchParams.getAll('status');

  const [data, setData] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);

  // Items detail modal state
  const [isItemsModalOpen, setIsItemsModalOpen] = useState(false);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [selectedItems, setSelectedItems] = useState<any[]>([]);
  const [selectedTotals, setSelectedTotals] = useState<any>(null);
  const [selectedOrderCode, setSelectedOrderCode] = useState('');
  const [selectedProofUrl, setSelectedProofUrl] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>(statusParam);
  const [creatorFilter, setCreatorFilter] = useState<string[]>([]);
  const [warehouseFilter, setWarehouseFilter] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Draft copies edited inside the filter modal; only committed to the real filters on "Terapkan".
  const [draftStartDate, setDraftStartDate] = useState('');
  const [draftEndDate, setDraftEndDate] = useState('');
  const [draftStatusFilter, setDraftStatusFilter] = useState<string[]>([]);
  const [draftCreatorFilter, setDraftCreatorFilter] = useState<string[]>([]);
  const [draftWarehouseFilter, setDraftWarehouseFilter] = useState<string[]>([]);

  // Sync state when searchParams change
  useEffect(() => {
    setStatusFilter(searchParams.getAll('status'));
  }, [searchParams]);

  const sortBy = sortByParam;
  const [users, setUsers] = useState<UserFilterOption[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseFilterOption[]>([]);

  const [bulkStatus, setBulkStatus] = useState('');
  const [selectedIds, setSelectedIds] = useState<{ id: number; source: string }[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [problemCount, setProblemCount] = useState(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const fetchOrders = useCallback(async (offsetValue: number, append: boolean) => {
    try {
      const query = new URLSearchParams();
      query.append('sort', sortBy);
      if (startDate) query.append('start_date', startDate);
      if (endDate) query.append('end_date', endDate);
      statusFilter.forEach((value) => query.append('status', value));
      creatorFilter.forEach((value) => query.append('creator_name', value));
      warehouseFilter.forEach((value) => query.append('warehouse_id', value));
      if (searchQuery) query.append('search', searchQuery);
      query.append('limit', String(PAGE_SIZE));
      query.append('offset', String(offsetValue));

      const res = await fetch('/api/olahan?' + query.toString(), { cache: 'no-store' });
      const json: OlahanResponse = await res.json();

      if (json.status !== 'success' || !json.data) {
        throw new Error(json.message || 'Gagal mengambil data pesanan');
      }

      setData((prev) => (append ? [...prev, ...json.data!] : json.data!));
      setHasMore(Boolean(json.hasMore));
      if (typeof json.total === 'number') {
        setTotal(json.total);
      }
    } catch (error: unknown) {
      Swal.fire('Error', getErrorMessage(error), 'error');
      if (!append) {
        setData([]);
        setHasMore(false);
        setTotal(null);
      }
    }
  }, [creatorFilter, endDate, sortBy, startDate, statusFilter, warehouseFilter, searchQuery]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    await fetchOrders(0, false);
    setLoading(false);
  }, [fetchOrders]);

  const loadMoreData = useCallback(async () => {
    setIsLoadingMore(true);
    await fetchOrders(data.length, true);
    setIsLoadingMore(false);
  }, [fetchOrders, data.length]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchData();
    }, 0);

  return () => window.clearTimeout(timer);
  }, [fetchData]);

  // Infinite scroll: load the next page once the sentinel row scrolls into view.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !loading && !isLoadingMore) {
        void loadMoreData();
      }
    }, { rootMargin: '200px' });

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loading, isLoadingMore, loadMoreData]);

  const fetchProblemCount = useCallback(async () => {
    try {
      const res = await fetch('/api/olahan?status=problem', { cache: 'no-store' });
      const json = await res.json();
      if (json.status === 'success' && json.data) {
        setProblemCount(json.data.length);
      }
    } catch (err) {
      console.error('Failed to fetch problem count:', err);
    }
  }, []);

  useEffect(() => {
    void fetchProblemCount();
  }, [fetchProblemCount]);

  useSocketEvent('NEW_OLAHAN', () => {
    void fetchData();
    void fetchProblemCount();
  });

  useSocketEvent('REFRESH_OLAHAN', () => {
    void fetchData();
    void fetchProblemCount();
  });

  useSocketEvent('NEW_ORDER', () => {
    void fetchData();
  });

  useEffect(() => {
    let isMounted = true;

    const loadUsers = async () => {
      try {
        const response = await fetch('/api/users', { cache: 'no-store' });
        const json: { success: boolean; data?: UserFilterOption[]; message?: string } = await response.json();

        if (!isMounted) return;
        if (!json.success || !json.data) throw new Error(json.message || 'Gagal mengambil data user');

        setUsers(json.data.filter((item) => item.role !== 'admin'));
      } catch (error: unknown) {
        if (isMounted) Swal.fire('Error', getErrorMessage(error), 'error');
      }
    };

    const loadWarehouses = async () => {
      try {
        const response = await fetch('/api/warehouses', { cache: 'no-store' });
        const json: { success: boolean; data?: WarehouseFilterOption[]; message?: string } = await response.json();

        if (!isMounted) return;
        if (!json.success || !json.data) throw new Error(json.message || 'Gagal mengambil data gudang');

        setWarehouses(json.data);
      } catch (error: unknown) {
        if (isMounted) Swal.fire('Error', getErrorMessage(error), 'error');
      }
    };

    void loadUsers();
    void loadWarehouses();

  return () => {
      isMounted = false;
    };
  }, []);

  const handleSelectAll = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      setSelectedIds(data.map((item) => ({ id: item.order_id, source: item.source_table })));
      return;
    }

    setSelectedIds([]);
  };

  const handleSelectOne = (id: number, source: string, checked: boolean) => {
    if (checked) {
      setSelectedIds((prev) => [...prev, { id, source }]);
      return;
    }

    setSelectedIds((prev) => prev.filter((item) => !(item.id === id && item.source === source)));
  };

  const getIdsBySource = (source: string) => selectedIds.filter((item) => item.source === source).map((item) => item.id).join(',');
  const serializeSelectedIds = () => selectedIds.map((item) => `${item.source}:${item.id}`).join(',');

  const handleViewItems = async (order: OrderItem) => {
    setSelectedOrderCode(order.order_code);
    setSelectedItems([]);
    setSelectedTotals(null);
    setSelectedProofUrl('');
    setSelectedCustomer(null);
    setIsItemsModalOpen(true);
    setItemsLoading(true);
    try {
      const res = await fetch(`/api/validasi_pembayaran/items?order_id=${order.order_id}&source_table=${order.source_table}`);
      const json = await res.json();
      if (json.status === 'success') {
        setSelectedItems(json.data?.items || []);
        setSelectedTotals(json.data?.totals || null);
        setSelectedProofUrl(json.data?.payment_proof_url || '');
        setSelectedCustomer(json.data?.customer || null);
      } else {
        Swal.fire('Error', json.message || 'Gagal mengambil data produk', 'error');
      }
    } catch (e: any) {
      Swal.fire('Error', e.message || 'Gagal mengambil data produk', 'error');
    } finally {
      setItemsLoading(false);
    }
  };

  const applyBulkStatus = async () => {
    if (selectedIds.length === 0) {
      await Swal.fire('Perhatian', 'Pilih minimal satu pesanan!', 'warning');
      return;
    }

    if (!bulkStatus) {
      await Swal.fire('Perhatian', 'Pilih status baru!', 'warning');
      return;
    }

    const selectedLabel = statusOptions.find((item) => item.value === bulkStatus)?.label ?? bulkStatus;
    const result = await Swal.fire({
      title: 'Konfirmasi',
      text: `Apakah Anda yakin mengubah ${selectedIds.length} pesanan menjadi ${selectedLabel}?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Ya, Ubah',
      cancelButtonText: 'Batal',
    });

    if (!result.isConfirmed) {
      return;
    }

    try {
      const response = await fetch('/api/olahan/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bulk_update_status',
          bulk_status: bulkStatus,
          csoIds: getIdsBySource('CSO'),
          csoAutoIds: getIdsBySource('CSO_AUTO'),
          crmIds: getIdsBySource('CRM'),
          userId: user?.id ?? 0,
        }),
      });

      const json: { status: 'success' | 'error'; message: string } = await response.json();
      if (json.status !== 'success') {
        throw new Error(json.message || 'Gagal mengubah status pesanan');
      }

      await Swal.fire('Berhasil', json.message, 'success');
      setSelectedIds([]);
      await fetchData();
    } catch (error: unknown) {
      await Swal.fire('Error', getErrorMessage(error), 'error');
    }
  };

  const applyBulkDelete = async () => {
    if (selectedIds.length === 0) {
      await Swal.fire('Perhatian', 'Pilih minimal satu pesanan!', 'warning');
      return;
    }

    const result = await Swal.fire({
      title: 'Hapus Pesanan?',
      html: `Anda akan menghapus <b>${selectedIds.length}</b> pesanan. Aksi ini <b>tidak dapat dibatalkan</b>! Stok akan dikembalikan otomatis.<br/><br/>Ketik <b>HAPUS</b> untuk konfirmasi.`,
      icon: 'warning',
      input: 'text',
      inputPlaceholder: 'Ketik HAPUS',
      showCancelButton: true,
      confirmButtonText: 'Ya, Hapus',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#ef4444',
      reverseButtons: true,
      focusCancel: true,
      preConfirm: (value: string) => {
        if (value !== 'HAPUS') {
          Swal.showValidationMessage('Ketik "HAPUS" (huruf besar) untuk melanjutkan');
          return false;
        }

        return true;
      },
    });

    if (!result.isConfirmed) {
      return;
    }

    try {
      const response = await fetch('/api/olahan/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bulk_delete',
          csoIds: getIdsBySource('CSO'),
          csoAutoIds: getIdsBySource('CSO_AUTO'),
          crmIds: getIdsBySource('CRM'),
          userId: user?.id ?? 0,
        }),
      });

      const json: { status: 'success' | 'error'; message: string } = await response.json();
      if (json.status !== 'success') {
        throw new Error(json.message || 'Gagal menghapus pesanan');
      }

      await Swal.fire('Berhasil', json.message, 'success');
      setSelectedIds([]);
      await fetchData();
    } catch (error: unknown) {
      await Swal.fire('Error', getErrorMessage(error), 'error');
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

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
    try {
      setExporting(true);
      const response = await fetch('/api/data_lengkap_customer/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate,
          endDate,
          status: statusFilter,
          creatorName: creatorFilter,
          warehouseId: warehouseFilter,
          selectedIds: serializeSelectedIds(),
        }),
      });

      if (!response.ok) {
        throw new Error('Gagal mengekspor data');
      }

      const blob = await response.blob();
      downloadBlob(blob, `Data_Lengkap_Customer_${Date.now()}.xlsx`, response);
    } catch (error: unknown) {
      await Swal.fire('Error', getErrorMessage(error), 'error');
    } finally {
      setExporting(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      setIsDownloadingTemplate(true);
      const response = await fetch('/api/olahan/template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate,
          endDate,
          status: statusFilter,
          creatorName: creatorFilter,
          warehouseId: warehouseFilter,
          selectedIds: serializeSelectedIds(),
        }),
      });

      if (!response.ok) {
        throw new Error('Gagal mengunduh template');
      }

      const blob = await response.blob();
      downloadBlob(blob, `Template_Update_Status_${Date.now()}.xlsx`, response);
    } catch (error: unknown) {
      await Swal.fire('Error', getErrorMessage(error), 'error');
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  const openUploadModal = () => {
    setUploadFile(null);
    setIsUploadModalOpen(true);
  };

  const closeUploadModal = () => {
    if (isUploading) {
      return;
    }

    setUploadFile(null);
    setIsUploadModalOpen(false);
  };

  const openFilterModal = () => {
    setDraftStartDate(startDate);
    setDraftEndDate(endDate);
    setDraftStatusFilter(statusFilter);
    setDraftCreatorFilter(creatorFilter);
    setDraftWarehouseFilter(warehouseFilter);
    setIsFilterModalOpen(true);
  };

  const closeFilterModal = () => {
    setIsFilterModalOpen(false);
  };

  const applyFilterModal = () => {
    setStartDate(draftStartDate);
    setEndDate(draftEndDate);
    setStatusFilter(draftStatusFilter);
    setCreatorFilter(draftCreatorFilter);
    setWarehouseFilter(draftWarehouseFilter);
    setIsFilterModalOpen(false);
  };

  const resetFilterModalDraft = () => {
    setDraftStartDate('');
    setDraftEndDate('');
    setDraftStatusFilter([]);
    setDraftCreatorFilter([]);
    setDraftWarehouseFilter([]);
  };

  const clearAllFilters = () => {
    setStartDate('');
    setEndDate('');
    setStatusFilter([]);
    setCreatorFilter([]);
    setWarehouseFilter([]);
    setSearchQuery('');
  };

  const handleUploadStatus = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!uploadFile) {
      await Swal.fire('Perhatian', 'Pilih file XLSX terlebih dahulu.', 'warning');
      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.set('file', uploadFile);
      formData.set('user_id', String(user?.id ?? 0));

      const response = await fetch('/api/olahan/import-status', {
        method: 'POST',
        body: formData,
      });

      const json: { status: 'success' | 'error'; message: string } = await response.json();
      if (json.status !== 'success') {
        throw new Error(json.message || 'Gagal memproses file status');
      }

      await Swal.fire('Berhasil', json.message, 'success');
      closeUploadModal();
      await fetchData();
    } catch (error: unknown) {
      await Swal.fire('Error', getErrorMessage(error), 'error');
    } finally {
      setIsUploading(false);
    }
  };


  const sortDescriptions: Record<string, string> = {
    created_at: 'Daftar semua data pesanan, diurutkan berdasarkan Create Order. Gunakan filter untuk mencari data tertentu.',
    processing_at: 'Menampilkan hanya pesanan yang sudah memiliki Processing At. Gunakan filter untuk mencari data tertentu.',
    last_update: 'Daftar semua data pesanan, diurutkan berdasarkan Last Update. Gunakan filter untuk mencari data tertentu.',
  };

  const currentSortDescription = sortDescriptions[sortBy] ?? sortDescriptions.created_at;
  const dateFilterColumnLabels: Record<string, string> = {
    created_at: 'Create Order',
    processing_at: 'Processing At',
    last_update: 'Last Update',
  };
  const dateFilterColumnLabel = dateFilterColumnLabels[sortBy] ?? dateFilterColumnLabels.created_at;
  const showCreatedAtColumn = sortBy === 'created_at';
  const showProcessingAtColumn = sortBy === 'processing_at';
  const showLastUpdateColumn = sortBy === 'last_update';
  const visibleColumnCount = 8 + (showCreatedAtColumn ? 1 : 0) + (showProcessingAtColumn ? 1 : 0) + (showLastUpdateColumn ? 1 : 0);
  const activeFilterCount = (startDate ? 1 : 0) + (endDate ? 1 : 0) + statusFilter.length + creatorFilter.length + warehouseFilter.length;

  // Sama seperti submenu "Data Lengkap" di sidebar — disediakan juga sebagai dropdown di halaman ini.
  const viewValue = searchParams.get('status') === 'problem'
    ? 'problem'
    : !searchParams.has('status') && !searchParams.has('sort')
      ? 'all'
      : (['created_at', 'processing_at', 'last_update'].includes(sortByParam) && searchParams.has('sort'))
        ? sortByParam
        : '';

  // Menyamakan perilaku dengan klik link submenu sidebar: reset filter lain (yang tidak
  // tersimpan di URL) supaya hasilnya konsisten walau dropdown ini dipakai tanpa pindah halaman.
  const handleViewChange = (value: string) => {
    setStartDate('');
    setEndDate('');
    setCreatorFilter([]);
    setWarehouseFilter([]);
    setSearchQuery('');
    setStatusFilter(value === 'problem' ? ['problem'] : []);

    if (value === 'all') router.push('/data_lengkap_customer');
    else if (value === 'problem') router.push('/data_lengkap_customer?status=problem');
    else router.push(`/data_lengkap_customer?sort=${value}`);
  };
  const hasAnyFilterOrSearch = activeFilterCount > 0 || Boolean(searchQuery);

  return (
    <div className="h-full flex flex-col p-6 max-w-[1600px] mx-auto">
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-bold text-slate-800">Data Lengkap</h1>
          {!loading && total !== null ? (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-bold border border-blue-100">
              {total.toLocaleString('id-ID')} pesanan
            </span>
          ) : null}
        </div>
        <p className="text-sm text-slate-400 mt-1">{currentSortDescription}</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-6">
        <div className="flex flex-col gap-4">
          <form className="flex-1 flex flex-col md:flex-row gap-4 md:items-end" onSubmit={(event) => { event.preventDefault(); void fetchData(); }}>
            <div className="w-full flex-1">
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Pencarian</label>
              <input type="text" placeholder="Nama, WA, atau ID Order" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-1 focus:ring-blue-500 outline-none text-sm placeholder:text-slate-400" />
            </div>
            <div className="w-full md:w-56">
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Tampilan</label>
              <select value={viewValue} onChange={(event) => handleViewChange(event.target.value)} className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-1 focus:ring-blue-500 outline-none text-sm bg-white">
                <option value="all">Semua Status</option>
                <option value="created_at">Create Order</option>
                <option value="processing_at">Processing At</option>
                <option value="last_update">Last Update</option>
                <option value="problem">Problem{problemCount ? ` (${problemCount})` : ''}</option>
              </select>
            </div>
            <div className="flex gap-2 w-full md:w-auto">
              <button type="button" onClick={openFilterModal} className="relative inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors w-full md:w-auto justify-center">
                <SlidersHorizontal className="w-4 h-4" />
                Filter
                {activeFilterCount > 0 ? (
                  <span className="absolute -top-2 -right-2 flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold">{activeFilterCount}</span>
                ) : null}
              </button>
              <button type="submit" className="bg-slate-800 hover:bg-slate-900 text-white px-5 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors w-full md:w-auto">Cari</button>
              {hasAnyFilterOrSearch ? (
                <button type="button" onClick={clearAllFilters} className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm font-bold transition-colors w-full md:w-auto">
                  Reset
                </button>
              ) : null}
            </div>
          </form>

          <div className="w-full h-px bg-slate-200" />

          <div className="flex flex-col md:flex-row md:flex-wrap md:items-center md:justify-between gap-3">
            <div className="flex flex-col md:flex-row md:flex-wrap md:items-center gap-3">
              <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap">
                <button type="button" onClick={() => void downloadTemplate()} disabled={isDownloadingTemplate} title="Download Template" className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-600 bg-white hover:bg-slate-50 hover:border-slate-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold">
                  {isDownloadingTemplate ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  Template
                </button>

                <button type="button" onClick={openUploadModal} title="Upload Status" className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-600 bg-white hover:bg-slate-50 hover:border-slate-400 transition-colors text-sm font-semibold">
                  <Upload className="w-4 h-4" />
                  Upload Status
                </button>

                <button type="button" onClick={() => void submitExport()} disabled={exporting} title="Export Excel" className="col-span-2 md:col-span-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-600 bg-white hover:bg-slate-50 hover:border-slate-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold">
                  {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
                  Export Excel
                </button>
              </div>

              {user?.role === 'admin' ? (
                <>
                  <div className="hidden md:block w-px self-stretch bg-slate-200" />

                  {/* Bulk Update Status */}
                  <div className="w-full md:w-auto flex items-center gap-1.5 p-1 bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-300">
                    <select value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value)} className="flex-1 min-w-0 text-sm font-semibold text-slate-600 bg-transparent border-none focus:ring-0 outline-none cursor-pointer px-3 py-1.5">
                      <option value="" disabled>-- Ubah Status Massal --</option>
                      {statusOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <button type="button" onClick={() => void applyBulkStatus()} className="shrink-0 bg-slate-800 hover:bg-slate-900 text-white px-4 py-1.5 rounded-lg text-sm font-bold transition-all duration-200 shadow-sm hover:shadow-md active:scale-95">
                      Terapkan
                    </button>
                  </div>
                </>
              ) : null}
            </div>

            {user?.role === 'admin' ? (
              /* Delete — separated and disabled until rows are picked, so it can't be hit by a stray/sleepy click */
              <button
                type="button"
                onClick={() => void applyBulkDelete()}
                disabled={selectedIds.length === 0}
                title={selectedIds.length === 0 ? 'Pilih pesanan terlebih dahulu' : `Hapus ${selectedIds.length} pesanan terpilih`}
                className="group relative w-full md:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 text-red-600 hover:bg-red-500 hover:text-white rounded-xl text-sm font-bold transition-all duration-300 shadow-sm hover:shadow-[0_4px_12px_rgba(239,68,68,0.3)] hover:-translate-y-0.5 border border-red-100 hover:border-red-500 overflow-hidden disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none disabled:hover:transform-none"
              >
                <Trash2 className="w-4 h-4 transition-transform group-hover:rotate-12 relative z-10" />
                <span className="relative z-10">Hapus{selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}</span>
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="p-4 text-center w-12"><input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-blue-600" onChange={handleSelectAll} checked={data.length > 0 && selectedIds.length === data.length} /></th>
                {showCreatedAtColumn ? <th className="p-4 font-semibold text-slate-600">Order Masuk</th> : null}
                {showProcessingAtColumn ? <th className="p-4 font-semibold text-slate-600">Processing At</th> : null}
                {showLastUpdateColumn ? <th className="p-4 font-semibold text-slate-600">Last Update</th> : null}
                <th className="p-4 font-semibold text-slate-600">ID Pesanan</th>
                <th className="p-4 font-semibold text-slate-600">Data Pelanggan</th>
                <th className="p-4 font-semibold text-slate-600">Nama Desa</th>
                <th className="p-4 font-semibold text-slate-600">Produk Pilihan</th>
                <th className="p-4 font-semibold text-slate-600">Ekspedisi</th>
                <th className="p-4 font-semibold text-slate-600">Status</th>
                <th className="p-4 font-semibold text-slate-600 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={visibleColumnCount} className="text-center py-12">
                    <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-2" />
                    <p className="text-slate-500 font-medium">Memuat data...</p>
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumnCount} className="text-center py-12">
                    <Search className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-slate-500">Belum ada data pesanan yang cocok.</p>
                  </td>
                </tr>
              ) : (
                <>
                {data.map((row) => (
                  <tr key={`${row.source_table}-${row.order_id}`} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 text-center align-top">
                      <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-blue-600" checked={selectedIds.some((item) => item.id === row.order_id && item.source === row.source_table)} onChange={(event) => handleSelectOne(row.order_id, row.source_table, event.target.checked)} />
                    </td>
                    {showCreatedAtColumn ? <td className="p-4 text-slate-500 text-xs align-top whitespace-nowrap">{formatDate(row.created_at)}</td> : null}
                    {showProcessingAtColumn ? <td className="p-4 text-slate-500 text-xs align-top whitespace-nowrap">{row.processing_at ? formatDate(row.processing_at) : '-'}</td> : null}
                    {showLastUpdateColumn ? <td className="p-4 text-slate-500 text-xs align-top whitespace-nowrap">{formatDate(row.last_update)}</td> : null}
                    <td className="p-4 align-top">
                      <button
                        type="button"
                        onClick={() => handleViewItems(row)}
                        className="font-bold text-blue-600 hover:text-blue-700 hover:underline"
                      >
                        {row.order_code}
                      </button>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        {(() => {
                          let badgeClass = 'bg-blue-50 text-blue-700 border-blue-200';
                          if (row.source_label === 'CRM') badgeClass = 'bg-cyan-50 text-cyan-700 border-cyan-200';
                          else if (row.source_label === 'CSO AKUISISI') badgeClass = 'bg-blue-50 text-blue-700 border-blue-200';
                          else if (row.source_label === 'RESEND') badgeClass = 'bg-orange-50 text-orange-700 border-orange-200';
                          else if (row.source_label === 'RESEND CRM') badgeClass = 'bg-pink-50 text-pink-700 border-pink-200';
                          return <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${badgeClass}`}>{row.source_label}</span>;
                        })()}
                        {row.advertiser_name ? <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border bg-emerald-50 text-emerald-700 border-emerald-200">ADV: {row.advertiser_name}</span> : null}
                        {row.ad_source ? <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border bg-amber-50 text-amber-700 border-amber-200">SRC: {row.ad_source}</span> : null}
                      </div>
                      {row.creator_name ? <div className="text-[11px] text-slate-500 font-medium mt-1.5 truncate">Creator: <span className="font-bold text-slate-700">{row.creator_name}</span></div> : null}
                      {row.warehouse_name ? <div className="text-[11px] text-slate-500 font-medium mt-1 truncate">Gudang: <span className="font-bold text-slate-700">{row.warehouse_name}</span></div> : null}
                      {row.id_reff ? <div className="text-[11px] text-slate-500 font-medium mt-1.5 truncate">ID Reff: <span className="font-bold text-slate-700">{row.id_reff}</span></div> : null}
                      {row.resi ? <div className="text-[11px] text-slate-500 font-medium mt-1 truncate">Resi: <span className="font-bold text-slate-700">{row.resi}</span></div> : null}
                      {getOldOrderId(row.notes) ? <div className="text-[11px] text-slate-500 font-medium mt-1 truncate">Order Lama: <span className="font-bold text-slate-700">{getOldOrderId(row.notes)}</span></div> : null}
                    </td>
                    <td className="p-4 align-top"><p className="font-bold text-slate-700">{row.customer_name}</p><p className="text-xs text-slate-500 mt-0.5">{row.whatsapp_number}</p></td>
                    <td className="p-4 text-slate-600 align-top max-w-[150px] truncate">{row.desa || '-'}</td>
                    <td className="p-4 text-slate-600 align-top max-w-[200px] truncate" title={row.product_names || ''}>{row.product_names || '-'}</td>
                    <td className="p-4 text-slate-500 text-xs align-top">
                      {row.courier_name ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          <Truck className="w-3 h-3 mr-1" />
                          {row.courier_name}
                          {row.courier_service ? <span className="ml-1 text-indigo-400">� {row.courier_service}</span> : null}
                        </span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="p-4 align-top">
                      {(() => {
                        const statusMap: Record<string, { label: string; className: string }> = {
                          pending: { label: 'Pending', className: 'bg-amber-50 text-amber-600 border-amber-200' },
                          processing: { label: 'Processing', className: 'bg-blue-50 text-blue-600 border-blue-200' },
                          ready_to_ship: { label: 'Ready To Ship', className: 'bg-teal-50 text-teal-600 border-teal-200' },
                          shipped: { label: 'Shipped', className: 'bg-purple-50 text-purple-600 border-purple-200' },
                          completed: { label: 'Completed', className: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
                          rts: { label: 'RTS', className: 'bg-orange-50 text-orange-600 border-orange-200' },
                          problem: { label: 'Problem', className: 'bg-red-50 text-red-600 border-red-200' },
                        };
                        const currentStatus = statusMap[row.order_status] || { label: row.order_status, className: 'bg-slate-50 text-slate-600 border-slate-200' };
                        return <span className={`px-2.5 py-1 rounded border text-xs font-bold ${currentStatus.className}`}>{currentStatus.label}</span>;
                      })()}
                    </td>
                    <td className="p-4 align-top text-right">
                      <Link href={`/olahan/edit?id=${row.order_code}&source=${row.source_table}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-bold transition-colors">
                        <Edit className="w-3.5 h-3.5" />
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
                {hasMore ? (
                  <tr>
                    <td colSpan={visibleColumnCount} className="text-center py-5">
                      <div ref={sentinelRef} className="flex items-center justify-center gap-2 text-slate-400 text-xs">
                        {isLoadingMore ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Memuat data...
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr>
                    <td colSpan={visibleColumnCount} className="text-center py-4 text-slate-300 text-xs">Semua data telah dimuat</td>
                  </tr>
                )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isUploadModalOpen ? (
        <div className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 opacity-100 transition-opacity duration-300" onClick={closeUploadModal}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden transform scale-100 transition-transform duration-300" onClick={(event) => event.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="text-lg font-bold text-slate-800">Upload Update Status</h3>
              <button type="button" onClick={closeUploadModal} className="text-slate-400 hover:text-slate-600 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
              </button>
            </div>
            <form onSubmit={handleUploadStatus} className="p-6">
              <div className="mb-4">
                <label className="block text-sm font-semibold text-slate-700 mb-2">File Template (.xlsx)</label>
                <input type="file" accept=".xlsx" required onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100 transition-colors border border-slate-200 rounded-xl cursor-pointer" />
                <p className="text-xs text-slate-500 mt-2">Pastikan Anda menggunakan file hasil dari &quot;Download Template&quot; dan menyimpannya dalam format XLSX.</p>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={closeUploadModal} className="px-5 py-2.5 rounded-xl font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">Batal</button>
                <button type="submit" disabled={isUploading} className="px-5 py-2.5 rounded-xl font-semibold text-white bg-purple-600 hover:bg-purple-700 transition-colors disabled:opacity-70 inline-flex items-center gap-2">
                  {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {isUploading ? 'Upload & Update...' : 'Upload & Update'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isFilterModalOpen ? (
        <div className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 opacity-100 transition-opacity duration-300" onClick={closeFilterModal}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden transform scale-100 transition-transform duration-300 flex flex-col max-h-[85vh]" onClick={(event) => event.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
              <h3 className="text-lg font-bold text-slate-800">Filter Pesanan</h3>
              <button type="button" onClick={closeFilterModal} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto">
              <div className="w-full md:col-span-2 -mb-1">
                <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  Rentang tanggal di bawah memfilter berdasarkan kolom <strong>{dateFilterColumnLabel}</strong> (sesuai "Tampilan" yang sedang aktif di halaman).
                </p>
              </div>
              <div className="w-full">
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Tanggal Mulai</label>
                <input type="date" value={draftStartDate} onChange={(event) => setDraftStartDate(event.target.value)} className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-1 focus:ring-blue-500 outline-none text-sm" />
              </div>
              <div className="w-full">
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Tanggal Akhir</label>
                <input type="date" value={draftEndDate} onChange={(event) => setDraftEndDate(event.target.value)} className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-1 focus:ring-blue-500 outline-none text-sm" />
              </div>
              <div className="w-full md:col-span-2">
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Status Pesanan</label>
                <Select
                  isMulti
                  value={statusOptions.filter((option) => draftStatusFilter.includes(option.value))}
                  onChange={(selected) => setDraftStatusFilter(selected.map((item) => item.value))}
                  options={statusOptions}
                  placeholder="Semua Status"
                  closeMenuOnSelect={false}
                  components={{ MultiValue: CompactMultiValue }}
                  menuPortalTarget={typeof document !== 'undefined' ? document.body : undefined}
                  className="text-sm text-slate-800"
                  styles={filterSelectStyles}
                />
              </div>
              <div className="w-full">
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Creator Order</label>
                <Select
                  isMulti
                  value={users
                    .filter((option) => draftCreatorFilter.includes(option.name || option.email))
                    .map((option) => ({ value: option.name || option.email, label: option.name || option.email }))}
                  onChange={(selected) => setDraftCreatorFilter(selected.map((item) => item.value))}
                  options={users.map((option) => ({ value: option.name || option.email, label: option.name || option.email }))}
                  placeholder="Semua Creator"
                  closeMenuOnSelect={false}
                  components={{ MultiValue: CompactMultiValue }}
                  menuPortalTarget={typeof document !== 'undefined' ? document.body : undefined}
                  className="text-sm text-slate-800"
                  styles={filterSelectStyles}
                />
              </div>
              <div className="w-full">
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Gudang</label>
                <Select
                  isMulti
                  value={warehouses
                    .filter((option) => draftWarehouseFilter.includes(String(option.id)))
                    .map((option) => ({ value: String(option.id), label: option.warehouse_name }))}
                  onChange={(selected) => setDraftWarehouseFilter(selected.map((item) => item.value))}
                  options={warehouses.map((option) => ({ value: String(option.id), label: option.warehouse_name }))}
                  placeholder="Semua Gudang"
                  closeMenuOnSelect={false}
                  components={{ MultiValue: CompactMultiValue }}
                  menuPortalTarget={typeof document !== 'undefined' ? document.body : undefined}
                  className="text-sm text-slate-800"
                  styles={filterSelectStyles}
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
              <button type="button" onClick={resetFilterModalDraft} className="text-red-500 hover:text-red-600 font-semibold text-sm transition-colors">
                Reset Filter
              </button>
              <div className="flex gap-3">
                <button type="button" onClick={closeFilterModal} className="px-5 py-2.5 rounded-xl font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">Batal</button>
                <button type="button" onClick={applyFilterModal} className="px-5 py-2.5 rounded-xl font-semibold text-white bg-slate-800 hover:bg-slate-900 transition-colors">Terapkan</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Modal Detail Produk */}
      {isItemsModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-3xl rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Detail Produk</h3>
                <p className="text-xs text-slate-400 mt-0.5">{selectedOrderCode}</p>
              </div>
              <button onClick={() => setIsItemsModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_280px]">
              <div className="p-6 max-h-[70vh] overflow-y-auto">
                {selectedCustomer && (
                  <div className="mb-4 pb-4 border-b border-slate-200">
                    <p className="text-sm font-bold text-slate-800">{selectedCustomer.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{selectedCustomer.whatsapp_number}</p>
                    <p className="text-xs text-slate-500 mt-1">{selectedCustomer.address}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{selectedCustomer.subdistrict}</p>
                  </div>
                )}
                {itemsLoading ? (
                  <p className="text-center text-sm text-slate-400 py-8">Memuat data...</p>
                ) : selectedItems.length === 0 ? (
                  <p className="text-center text-sm text-slate-400 py-8">Tidak ada produk ditemukan.</p>
                ) : (
                  <>
                    <div className="divide-y divide-slate-100">
                      {selectedItems.map((item, idx) => (
                        <div key={idx} className="flex items-start justify-between py-2.5 gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-slate-700">{item.product_name}</span>
                              {item.is_bundle ? (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold border bg-indigo-50 text-indigo-600 border-indigo-200">Bundle</span>
                              ) : item.is_gift ? (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold border bg-emerald-50 text-emerald-600 border-emerald-200">Hadiah</span>
                              ) : null}
                            </div>
                            <p className="text-xs text-slate-400 mt-0.5">{item.qty} x {formatCurrency(item.price)}</p>
                          </div>
                          <span className="text-sm font-bold text-slate-800 shrink-0">
                            {formatCurrency(Number(item.price || 0) * Number(item.qty || 0) - Number(item.discount || 0))}
                          </span>
                        </div>
                      ))}
                    </div>

                    {selectedTotals && (
                      <div className="mt-4 pt-4 border-t border-slate-200 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Harga Produk</span>
                          <span className="font-medium text-slate-700">{formatCurrency(selectedTotals.product_price)}</span>
                        </div>
                        {selectedTotals.product_discount > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-500">Diskon Produk</span>
                            <span className="font-medium text-rose-600">- {formatCurrency(selectedTotals.product_discount)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Ongkir</span>
                          <span className="font-medium text-slate-700">{formatCurrency(selectedTotals.shipping_cost)}</span>
                        </div>
                        {selectedTotals.shipping_discount > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-500">Diskon Ongkir</span>
                            <span className="font-medium text-rose-600">- {formatCurrency(selectedTotals.shipping_discount)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Fee COD</span>
                          <span className="font-medium text-slate-700">{formatCurrency(selectedTotals.cod_fee)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Biaya Lainnya</span>
                          <span className="font-medium text-slate-700">{formatCurrency(selectedTotals.other_fee)}</span>
                        </div>
                        <div className="flex justify-between text-sm pt-2 mt-1 border-t border-dashed border-slate-200">
                          <span className="font-bold text-slate-800">Total Pembayaran</span>
                          <span className="font-black text-purple-600">{formatCurrency(selectedTotals.total_payment)}</span>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="p-6 border-t md:border-t-0 md:border-l border-slate-100 bg-slate-50/50 flex flex-col">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Bukti Transfer</p>
                {selectedProofUrl ? (
                  <a href={getProofUrl(selectedProofUrl)} target="_blank" rel="noreferrer" className="block group">
                    <img
                      src={getProofUrl(selectedProofUrl)}
                      alt="Bukti Transfer"
                      className="w-full rounded-xl border border-slate-200 object-contain max-h-64 bg-white group-hover:opacity-90 transition-opacity"
                    />
                    <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-purple-600 group-hover:underline">
                      <ExternalLink className="w-3.5 h-3.5" /> Lihat ukuran penuh
                    </span>
                  </a>
                ) : (
                  <div className="flex-1 flex items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-10">
                    <p className="text-sm text-slate-400">Tidak ada bukti transfer</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


