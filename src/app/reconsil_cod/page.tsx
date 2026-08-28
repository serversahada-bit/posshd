'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Swal from 'sweetalert2';
import { Loader2, Upload, HelpCircle, History, Trash2 } from 'lucide-react';

type PreviewData = {
  headers: string[];
  sampleRows: string[][];
  totalRows: number;
  suggestedResiColumn: number;
  suggestedAmountColumn: number;
};

type ReconciliationItem = {
  id: number;
  tracking_number: string;
  reported_amount: string;
  expected_amount: string | null;
  difference: string | null;
  order_code: string | null;
  source_table: string | null;
  status: 'matched' | 'mismatch' | 'not_found';
};

type ReconciliationResult = {
  id: number;
  courier_name: string | null;
  file_name: string | null;
  total_rows: number;
  matched_count: number;
  mismatch_count: number;
  not_found_count: number;
  created_at: string;
  created_by_name: string;
  items: ReconciliationItem[];
};

type HistoryRow = {
  id: number;
  courier_name: string | null;
  file_name: string | null;
  total_rows: number;
  matched_count: number;
  mismatch_count: number;
  not_found_count: number;
  created_at: string;
  created_by_name: string;
};

const formatCurrency = (value: string | number | null) => `Rp ${Number(value || 0).toLocaleString('id-ID')}`;

const formatDate = (value: string) =>
  new Date(value).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });

const statusBadge = (status: ReconciliationItem['status']) => {
  if (status === 'matched') return { label: 'Cocok', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  if (status === 'mismatch') return { label: 'Selisih', className: 'bg-amber-50 text-amber-700 border-amber-200' };
  return { label: 'Tidak Ditemukan', className: 'bg-red-50 text-red-600 border-red-200' };
};

export default function ReconsilCodPage() {
  const { user } = useAuth();

  const [file, setFile] = useState<File | null>(null);
  const [courierName, setCourierName] = useState('');
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [resiColumn, setResiColumn] = useState(0);
  const [amountColumn, setAmountColumn] = useState(0);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [processing, setProcessing] = useState(false);

  const [result, setResult] = useState<ReconciliationResult | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [couriers, setCouriers] = useState<{ id: number; courier_name: string }[]>([]);
  const [loadingDetailId, setLoadingDetailId] = useState<number | null>(null);

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch('/api/reconsil_cod', { cache: 'no-store' });
      const json = await res.json();
      if (json.status === 'success') setHistory(json.data || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    void fetchHistory();
    fetch('/api/couriers', { cache: 'no-store' })
      .then((res) => res.json())
      .then((json) => {
        if (json.success) setCouriers(json.data || []);
      })
      .catch(() => {});
  }, []);

  const resetUpload = () => {
    setFile(null);
    setCourierName('');
    setPreview(null);
    setResiColumn(0);
    setAmountColumn(0);
  };

  const handleFileChange = async (selected: File | null) => {
    setFile(selected);
    setPreview(null);
    setResult(null);
    if (!selected) return;

    setLoadingPreview(true);
    try {
      const fd = new FormData();
      fd.append('file', selected);
      const res = await fetch('/api/reconsil_cod/preview', { method: 'POST', body: fd });
      const json = await res.json();
      if (json.status !== 'success') {
        Swal.fire('Gagal', json.message || 'Gagal membaca file', 'error');
        return;
      }
      setPreview(json);
      setResiColumn(json.suggestedResiColumn || 1);
      setAmountColumn(json.suggestedAmountColumn || 2);
    } catch (error) {
      Swal.fire('Gagal', 'Terjadi kesalahan saat membaca file', 'error');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleProcess = async () => {
    if (!file || !resiColumn || !amountColumn) return;

    setProcessing(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('resi_column', String(resiColumn));
      fd.append('amount_column', String(amountColumn));
      fd.append('courier_name', courierName);
      fd.append('user_id', String(user?.id ?? 0));

      const res = await fetch('/api/reconsil_cod/process', { method: 'POST', body: fd });
      const json = await res.json();
      if (json.status !== 'success') {
        Swal.fire('Gagal', json.message || 'Gagal memproses file', 'error');
        return;
      }

      Swal.fire('Berhasil', json.message, 'success');
      resetUpload();
      await fetchHistory();
      await loadDetail(json.reconciliationId);
    } catch (error) {
      Swal.fire('Gagal', 'Terjadi kesalahan saat memproses file', 'error');
    } finally {
      setProcessing(false);
    }
  };

  const loadDetail = async (id: number) => {
    setLoadingDetailId(id);
    try {
      const res = await fetch(`/api/reconsil_cod/${id}`, { cache: 'no-store' });
      const json = await res.json();
      if (json.status !== 'success') {
        Swal.fire('Gagal', json.message || 'Gagal memuat detail riwayat ini', 'error');
        return;
      }
      setResult(json.data);
      setTimeout(() => document.getElementById('reconsil-result')?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (error) {
      console.error(error);
      Swal.fire('Gagal', 'Terjadi kesalahan saat memuat detail. Coba muat ulang halaman.', 'error');
    } finally {
      setLoadingDetailId(null);
    }
  };

  const handleDelete = async (id: number) => {
    const confirm = await Swal.fire({
      title: 'Hapus riwayat ini?',
      text: 'Seluruh data hasil pencocokan pada riwayat ini akan dihapus permanen.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Ya, hapus',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#dc2626',
    });
    if (!confirm.isConfirmed) return;

    try {
      const res = await fetch(`/api/reconsil_cod/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.status !== 'success') {
        Swal.fire('Gagal', json.message || 'Gagal menghapus riwayat', 'error');
        return;
      }
      if (result?.id === id) setResult(null);
      await fetchHistory();
    } catch (error) {
      Swal.fire('Gagal', 'Terjadi kesalahan saat menghapus riwayat', 'error');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Data Reconsil COD</h1>
        <p className="text-sm text-slate-500 mt-1">
          Upload laporan setoran COD dari kurir untuk dicocokkan otomatis dengan Total Pembayaran di sistem berdasarkan nomor resi.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-5">
        <h2 className="font-bold text-slate-800">1. Upload File Kurir</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">File Laporan Kurir (.xlsx, .xls, .csv)</label>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(event) => void handleFileChange(event.target.files?.[0] || null)}
              className="block w-full text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100 transition-colors border border-slate-200 rounded-xl cursor-pointer"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Nama Kurir (Opsional)</label>
            <select
              value={courierName}
              onChange={(event) => setCourierName(event.target.value)}
              className="w-full border border-slate-300 text-slate-800 text-sm rounded-lg outline-none focus:ring-1 focus:ring-purple-300 px-3 py-2.5 bg-white"
            >
              <option value="">-- Pilih Kurir --</option>
              {couriers.map((courier) => (
                <option key={courier.id} value={courier.courier_name}>{courier.courier_name}</option>
              ))}
            </select>
          </div>
        </div>

        {loadingPreview && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Membaca file...
          </div>
        )}

        {preview && (
          <div className="space-y-4 border-t border-slate-100 pt-5">
            <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3">
              <HelpCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>Format laporan tiap kurir berbeda-beda. Pilih kolom mana yang berisi <b>No Resi</b> dan <b>Nominal COD</b> berdasarkan preview di bawah.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Kolom No Resi</label>
                <select
                  value={resiColumn}
                  onChange={(event) => setResiColumn(Number(event.target.value))}
                  className="w-full border border-slate-300 text-slate-800 text-sm rounded-lg outline-none focus:ring-1 focus:ring-purple-300 px-3 py-2.5 bg-white"
                >
                  {preview.headers.map((header, index) => (
                    <option key={index} value={index + 1}>{header}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Kolom Nominal COD</label>
                <select
                  value={amountColumn}
                  onChange={(event) => setAmountColumn(Number(event.target.value))}
                  className="w-full border border-slate-300 text-slate-800 text-sm rounded-lg outline-none focus:ring-1 focus:ring-purple-300 px-3 py-2.5 bg-white"
                >
                  {preview.headers.map((header, index) => (
                    <option key={index} value={index + 1}>{header}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50">
                  <tr>
                    {preview.headers.map((header, index) => (
                      <th key={index} className={`p-2 font-semibold whitespace-nowrap ${index + 1 === resiColumn || index + 1 === amountColumn ? 'text-purple-600' : 'text-slate-500'}`}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.sampleRows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex} className="p-2 text-slate-600 whitespace-nowrap">{cell || '-'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-400">Total {preview.totalRows} baris data akan diproses.</p>

            <button
              type="button"
              onClick={() => void handleProcess()}
              disabled={processing}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-white bg-purple-600 hover:bg-purple-700 transition-colors disabled:opacity-50"
            >
              {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Proses & Cocokkan
            </button>
          </div>
        )}
      </div>

      {result && (
        <div id="reconsil-result" className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-slate-800">Hasil Pencocokan {result.courier_name ? `- ${result.courier_name}` : ''}</h2>
              <p className="text-xs text-slate-400 mt-0.5">{result.file_name} &bull; {formatDate(result.created_at)} &bull; oleh {result.created_by_name}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-bold">
              <span className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600">Total: {result.total_rows}</span>
              <span className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700">Cocok: {result.matched_count}</span>
              <span className="px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700">Selisih: {result.mismatch_count}</span>
              <span className="px-3 py-1.5 rounded-lg bg-red-50 text-red-600">Tidak Ditemukan: {result.not_found_count}</span>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="p-3 font-semibold text-slate-600">No Resi</th>
                  <th className="p-3 font-semibold text-slate-600">ID Pesanan</th>
                  <th className="p-3 font-semibold text-slate-600 text-right">Nominal Laporan</th>
                  <th className="p-3 font-semibold text-slate-600 text-right">Total Pembayaran</th>
                  <th className="p-3 font-semibold text-slate-600 text-right">Selisih</th>
                  <th className="p-3 font-semibold text-slate-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.items.map((item) => {
                  const badge = statusBadge(item.status);
                  return (
                    <tr key={item.id} className={item.status === 'not_found' ? 'bg-red-50/30' : item.status === 'mismatch' ? 'bg-amber-50/30' : ''}>
                      <td className="p-3 font-medium text-slate-700">{item.tracking_number}</td>
                      <td className="p-3 text-slate-600">{item.order_code || '-'}</td>
                      <td className="p-3 text-right text-slate-700">{formatCurrency(item.reported_amount)}</td>
                      <td className="p-3 text-right text-slate-700">{item.expected_amount !== null ? formatCurrency(item.expected_amount) : '-'}</td>
                      <td className={`p-3 text-right font-bold ${item.difference && item.difference !== '0' ? 'text-red-600' : 'text-slate-400'}`}>
                        {item.difference !== null ? formatCurrency(item.difference) : '-'}
                      </td>
                      <td className="p-3">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold border ${badge.className}`}>{badge.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
          <History className="w-4 h-4 text-slate-500" />
          <h2 className="font-bold text-slate-800">Riwayat Upload</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="p-3 font-semibold text-slate-600">Tanggal</th>
                <th className="p-3 font-semibold text-slate-600">Kurir</th>
                <th className="p-3 font-semibold text-slate-600">File</th>
                <th className="p-3 font-semibold text-slate-600">Diupload Oleh</th>
                <th className="p-3 font-semibold text-slate-600 text-center">Total</th>
                <th className="p-3 font-semibold text-slate-600 text-center">Cocok</th>
                <th className="p-3 font-semibold text-slate-600 text-center">Selisih</th>
                <th className="p-3 font-semibold text-slate-600 text-center">Tidak Ditemukan</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loadingHistory ? (
                <tr><td colSpan={9} className="text-center py-8 text-slate-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></td></tr>
              ) : history.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-8 text-slate-400">Belum ada riwayat upload.</td></tr>
              ) : (
                history.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/50">
                    <td className="p-3 text-slate-500 text-xs whitespace-nowrap">{formatDate(row.created_at)}</td>
                    <td className="p-3 text-slate-700">{row.courier_name || '-'}</td>
                    <td className="p-3 text-slate-500 text-xs truncate max-w-[160px]" title={row.file_name || ''}>{row.file_name || '-'}</td>
                    <td className="p-3 text-slate-500 text-xs">{row.created_by_name}</td>
                    <td className="p-3 text-center font-semibold text-slate-700">{row.total_rows}</td>
                    <td className="p-3 text-center font-semibold text-emerald-600">{row.matched_count}</td>
                    <td className="p-3 text-center font-semibold text-amber-600">{row.mismatch_count}</td>
                    <td className="p-3 text-center font-semibold text-red-500">{row.not_found_count}</td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <button type="button" onClick={() => void loadDetail(row.id)} disabled={loadingDetailId === row.id} className="text-xs font-bold text-purple-600 hover:text-purple-700 hover:underline mr-3 disabled:opacity-50 disabled:no-underline">
                        {loadingDetailId === row.id ? 'Memuat...' : 'Lihat Detail'}
                      </button>
                      <button type="button" onClick={() => void handleDelete(row.id)} title="Hapus riwayat ini" className="inline-flex items-center text-red-500 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
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
