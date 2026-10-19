'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Swal from 'sweetalert2';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  ImagePlus,
  Link2,
  Loader2,
  RefreshCw,
  Save,
  Trash2,
  Upload,
  X,
  XCircle,
} from 'lucide-react';

import {
  IMPORT_COLUMNS,
  MAX_ITEMS_PER_ROW,
  PAYMENT_PROOF_MAX_BYTES,
  formatWhatsapp,
  matchesWhatsappFileName,
  type ImportOrderPreview,
  type OrderImportType,
} from '@/lib/orderImportShared';

type ProofFile = { id: string; file: File; url: string; originalName: string };
type SaveResult = { status: 'success' | 'error'; message: string; orderCode?: string };
type FilterTab = 'all' | 'ready' | 'error' | 'proof' | 'saved';
type PreviewResponse = {
  status: 'success' | 'error';
  message?: string;
  data?: { fileName: string; orders: ImportOrderPreview[] };
};

const JENIS_BADGE: Record<OrderImportType, string> = {
  Akuisisi: 'bg-purple-100 text-purple-700',
  CSO: 'bg-blue-100 text-blue-700',
  CRM: 'bg-emerald-100 text-emerald-700',
  Resend: 'bg-amber-100 text-amber-700',
};

const COMPRESS_ABOVE_BYTES = 1.5 * 1024 * 1024;
const COMPRESS_MAX_DIMENSION = 2000;

const formatCurrency = (value: number) => new Intl.NumberFormat('id-ID').format(value);
const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Terjadi kesalahan');
const baseName = (fileName: string) => fileName.replace(/\.[^.]+$/, '').trim();

// Foto bukti dari HP sering > 3 MB; kecilkan dulu di browser supaya upload cepat & lolos batas 5 MB.
async function compressImage(file: File): Promise<File> {
  if (file.size <= COMPRESS_ABOVE_BYTES || file.type === 'image/gif') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, COMPRESS_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], `${baseName(file.name)}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

export default function ImportPesananPage() {
  const [fileName, setFileName] = useState('');
  const [orders, setOrders] = useState<ImportOrderPreview[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);

  const [proofs, setProofs] = useState<Record<string, ProofFile>>({});
  const [assignments, setAssignments] = useState<Record<number, string>>({});
  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const [processingProofs, setProcessingProofs] = useState(false);
  const [viewProofUrl, setViewProofUrl] = useState<string | null>(null);

  const [results, setResults] = useState<Record<number, SaveResult>>({});
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [filter, setFilter] = useState<FilterTab>('all');
  const [dragOver, setDragOver] = useState<'excel' | 'proof' | null>(null);

  const excelInputRef = useRef<HTMLInputElement>(null);
  const proofInputRef = useRef<HTMLInputElement>(null);
  const rowProofInputRef = useRef<HTMLInputElement>(null);
  const rowProofTargetRef = useRef<number | null>(null);
  const proofsRef = useRef(proofs);

  useEffect(() => {
    proofsRef.current = proofs;
  }, [proofs]);

  useEffect(() => () => {
    Object.values(proofsRef.current).forEach((proof) => URL.revokeObjectURL(proof.url));
  }, []);

  const isSaved = (row: number) => results[row]?.status === 'success';
  const hasProof = (row: number) => Boolean(assignments[row] && proofs[assignments[row]]);
  const isReady = (order: ImportOrderPreview) =>
    order.errors.length === 0 && !isSaved(order.row) && (!order.needsProof || hasProof(order.row));

  const counts = useMemo(() => {
    const ready = orders.filter(isReady).length;
    const error = orders.filter((order) => order.errors.length > 0 || results[order.row]?.status === 'error').length;
    const proofNeeded = orders.filter((order) => order.needsProof && order.errors.length === 0 && !isSaved(order.row)).length;
    const proofMissing = orders.filter((order) => order.needsProof && order.errors.length === 0 && !isSaved(order.row) && !hasProof(order.row)).length;
    const saved = orders.filter((order) => isSaved(order.row)).length;
    return { ready, error, proofNeeded, proofMissing, saved };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, results, assignments, proofs]);

  const filteredOrders = orders.filter((order) => {
    if (filter === 'ready') return isReady(order);
    if (filter === 'error') return order.errors.length > 0 || results[order.row]?.status === 'error';
    if (filter === 'proof') return order.needsProof && order.errors.length === 0 && !isSaved(order.row) && !hasProof(order.row);
    if (filter === 'saved') return isSaved(order.row);
    return true;
  });

  const assignedProofIds = new Set(Object.values(assignments));
  const unassignedProofs = Object.values(proofs).filter((proof) => !assignedProofIds.has(proof.id));
  const proofTargets = orders.filter((order) => order.needsProof && order.errors.length === 0 && !isSaved(order.row));

  // ---------------------------------------------------------------- Excel
  const downloadTemplate = async () => {
    setDownloadingTemplate(true);
    try {
      const response = await fetch('/api/orders_import/template', { cache: 'no-store' });
      if (!response.ok) {
        const json = await response.json().catch(() => null);
        throw new Error(json?.message || 'Gagal mengunduh template');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'Template_Import_Pesanan.xlsx';
      link.click();
      URL.revokeObjectURL(url);
    } catch (error: unknown) {
      Swal.fire('Error', getErrorMessage(error), 'error');
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const resetAll = () => {
    Object.values(proofs).forEach((proof) => URL.revokeObjectURL(proof.url));
    setOrders([]);
    setFileName('');
    setProofs({});
    setAssignments({});
    setSelectedRows([]);
    setResults({});
    setFilter('all');
    setProgress({ done: 0, total: 0 });
  };

  const handleExcelFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      Swal.fire('Format tidak didukung', 'Gunakan file .xlsx (download template terlebih dahulu).', 'warning');
      return;
    }

    setLoadingPreview(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const response = await fetch('/api/orders_import/preview', { method: 'POST', body: fd });
      const json: PreviewResponse = await response.json();
      if (json.status !== 'success' || !json.data) throw new Error(json.message || 'Gagal membaca file');

      resetAll();
      setFileName(json.data.fileName);
      setOrders(json.data.orders);
    } catch (error: unknown) {
      Swal.fire('Gagal membaca file', getErrorMessage(error), 'error');
    } finally {
      setLoadingPreview(false);
      if (excelInputRef.current) excelInputRef.current.value = '';
    }
  };

  // ---------------------------------------------------------------- Bukti pembayaran
  const prepareProofs = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    const rejected: string[] = [];
    const prepared: ProofFile[] = [];

    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        rejected.push(`${file.name} (bukan gambar)`);
        continue;
      }
      const compressed = await compressImage(file);
      if (compressed.size > PAYMENT_PROOF_MAX_BYTES) {
        rejected.push(`${file.name} (lebih dari 5 MB)`);
        continue;
      }
      prepared.push({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        file: compressed,
        url: URL.createObjectURL(compressed),
        originalName: file.name,
      });
    }

    if (rejected.length > 0) {
      Swal.fire('Sebagian file dilewati', rejected.join('<br>'), 'warning');
    }
    return prepared;
  };

  // Nama file = No WhatsApp (mis. "081234567890.jpg", nomor luar negeri boleh tanpa kode negara)
  // atau nomor baris Excel (mis. "5.jpg") → otomatis dipasangkan ke pesanan yang butuh bukti.
  const handleProofFiles = async (fileList: FileList | File[] | null) => {
    if (!fileList || fileList.length === 0) return;
    setProcessingProofs(true);
    try {
      const prepared = await prepareProofs(fileList);
      const nextAssignments = { ...assignments };
      let matched = 0;

      prepared.forEach((proof) => {
        const name = baseName(proof.originalName);
        const byWa = proofTargets.filter((order) => matchesWhatsappFileName(name, order.whatsappKey, order.whatsappCountry));
        const byRow = /^\d{1,4}$/.test(name) ? proofTargets.find((order) => order.row === Number(name)) : undefined;
        const target = byWa.length === 1 ? byWa[0] : byRow;

        if (target && !nextAssignments[target.row]) {
          nextAssignments[target.row] = proof.id;
          matched += 1;
        }
      });

      setProofs((prev) => Object.fromEntries([...Object.entries(prev), ...prepared.map((proof) => [proof.id, proof] as const)]));
      setAssignments(nextAssignments);

      if (prepared.length > 0) {
        const unmatched = prepared.length - matched;
        Swal.fire({
          icon: unmatched > 0 ? 'info' : 'success',
          title: `${prepared.length} bukti ditambahkan`,
          html: `${matched} otomatis terpasang.${unmatched > 0 ? `<br>${unmatched} belum dipasangkan — pasangkan manual di kotak "Belum Dipasangkan".` : ''}`,
          timer: unmatched > 0 ? undefined : 2000,
        });
      }
    } finally {
      setProcessingProofs(false);
      if (proofInputRef.current) proofInputRef.current.value = '';
    }
  };

  const handleRowProof = async (fileList: FileList | null) => {
    const row = rowProofTargetRef.current;
    if (!row || !fileList || fileList.length === 0) return;
    const [proof] = await prepareProofs([fileList[0]]);
    if (proof) {
      setProofs((prev) => ({ ...prev, [proof.id]: proof }));
      setAssignments((prev) => ({ ...prev, [row]: proof.id }));
    }
    if (rowProofInputRef.current) rowProofInputRef.current.value = '';
  };

  const assignProof = (proofId: string, rows: number[]) => {
    if (rows.length === 0) return;
    setAssignments((prev) => ({ ...prev, ...Object.fromEntries(rows.map((row) => [row, proofId])) }));
  };

  const assignProofToSelected = (proofId: string) => {
    const rows = selectedRows.filter((row) => proofTargets.some((order) => order.row === row));
    if (rows.length === 0) {
      Swal.fire('Belum ada pesanan dipilih', 'Centang pesanan Transfer/Free di tabel terlebih dahulu.', 'info');
      return;
    }
    assignProof(proofId, rows);
    setSelectedRows([]);
  };

  const unassignProof = (row: number) => {
    setAssignments((prev) => {
      const next = { ...prev };
      delete next[row];
      return next;
    });
  };

  const deleteProof = (proofId: string) => {
    const proof = proofs[proofId];
    if (proof) URL.revokeObjectURL(proof.url);
    setProofs((prev) => {
      const next = { ...prev };
      delete next[proofId];
      return next;
    });
  };

  const toggleSelected = (row: number) => {
    setSelectedRows((prev) => (prev.includes(row) ? prev.filter((item) => item !== row) : [...prev, row]));
  };

  const selectableRows = filteredOrders.filter((order) => !isSaved(order.row)).map((order) => order.row);
  const allSelected = selectableRows.length > 0 && selectableRows.every((row) => selectedRows.includes(row));
  const toggleSelectAll = () => {
    setSelectedRows(allSelected ? selectedRows.filter((row) => !selectableRows.includes(row)) : [...new Set([...selectedRows, ...selectableRows])]);
  };

  // ---------------------------------------------------------------- Simpan
  const saveOrders = async () => {
    const readyOrders = orders.filter(isReady);
    if (readyOrders.length === 0) {
      Swal.fire('Tidak ada pesanan siap', 'Perbaiki error atau lampirkan bukti pembayaran terlebih dahulu.', 'info');
      return;
    }

    const skipped = orders.filter((order) => !isSaved(order.row)).length - readyOrders.length;
    const confirm = await Swal.fire({
      icon: 'question',
      title: `Simpan ${readyOrders.length} pesanan?`,
      html: skipped > 0 ? `${skipped} pesanan lain (error / belum ada bukti) <b>tidak</b> ikut disimpan.` : 'Semua pesanan di file ini akan disimpan.',
      showCancelButton: true,
      confirmButtonText: 'Ya, simpan',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#9333ea',
    });
    if (!confirm.isConfirmed) return;

    setSaving(true);
    setProgress({ done: 0, total: readyOrders.length });
    let success = 0;
    let failed = 0;

    // Disimpan satu per satu: tiap pesanan punya transaksi sendiri, jadi satu yang gagal tidak membatalkan lainnya.
    for (const order of readyOrders) {
      let result: SaveResult;
      try {
        const fd = new FormData();
        fd.append('order', JSON.stringify(order.input));
        fd.append('file_name', fileName);
        const proof = assignments[order.row] ? proofs[assignments[order.row]] : undefined;
        if (order.needsProof && proof) fd.append('payment_proof', proof.file, proof.file.name);

        const response = await fetch('/api/orders_import/commit', { method: 'POST', body: fd });
        const json: { status: string; message?: string; order_code?: string } = await response.json();
        result = json.status === 'success'
          ? { status: 'success', message: 'Tersimpan', orderCode: json.order_code }
          : { status: 'error', message: json.message || 'Gagal menyimpan' };
      } catch (error: unknown) {
        result = { status: 'error', message: getErrorMessage(error) };
      }

      if (result.status === 'success') success += 1;
      else failed += 1;
      setResults((prev) => ({ ...prev, [order.row]: result }));
      setProgress((prev) => ({ ...prev, done: prev.done + 1 }));
    }

    setSaving(false);
    setSelectedRows([]);
    Swal.fire({
      icon: failed > 0 ? 'warning' : 'success',
      title: 'Import selesai',
      html: `${success} pesanan berhasil disimpan.${failed > 0 ? `<br>${failed} pesanan gagal — lihat alasannya di tabel atau unduh Excel pesanan gagal.` : ''}`,
    });
    if (success > 0) {
      new Audio('/notif.mp3').play().catch(() => undefined);
    }
  };

  const getFailureReason = (order: ImportOrderPreview) => {
    if (results[order.row]?.status === 'error') return results[order.row].message;
    if (order.errors.length > 0) return order.errors.join(' | ');
    if (order.needsProof && !hasProof(order.row)) return 'Bukti pembayaran belum dilampirkan';
    return 'Belum disimpan';
  };

  // Excel berisi pesanan yang belum tersimpan + kolom "Alasan Error", siap diperbaiki & diupload ulang.
  const downloadFailed = async () => {
    const pending = orders.filter((order) => !isSaved(order.row));
    if (pending.length === 0) return;

    const XLSX = await import('xlsx');
    const header = [...IMPORT_COLUMNS.map((column) => column.header), 'Alasan Error'];
    const rows: string[][] = [header];

    // 1 pesanan = 1 baris, item kembali ke slot aslinya.
    pending.forEach((order) => {
      rows.push([
        ...IMPORT_COLUMNS.map((column) => {
          if (column.orderField) return order.input.fields[column.orderField];
          const item = order.input.items.find((entry) => entry.slot === column.slot);
          return item && column.itemField ? item[column.itemField] : '';
        }),
        getFailureReason(order),
      ]);
    });

    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    worksheet['!cols'] = [...IMPORT_COLUMNS.map((column) => ({ wch: column.width })), { wch: 60 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Pesanan');
    XLSX.writeFile(workbook, `Import_Gagal_${baseName(fileName) || 'Pesanan'}.xlsx`);
  };

  // ---------------------------------------------------------------- Render
  const renderStatus = (order: ImportOrderPreview) => {
    const result = results[order.row];
    if (result?.status === 'success') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" /> {result.orderCode}
        </span>
      );
    }
    if (result?.status === 'error' || order.errors.length > 0) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-600">
          <XCircle className="h-3.5 w-3.5" /> {result?.status === 'error' ? 'Gagal' : `${order.errors.length} error`}
        </span>
      );
    }
    if (order.needsProof && !hasProof(order.row)) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5" /> Butuh bukti
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-bold text-purple-700">
        <CheckCircle2 className="h-3.5 w-3.5" /> Siap
      </span>
    );
  };

  const renderProofCell = (order: ImportOrderPreview) => {
    if (!order.needsProof) return <span className="text-xs text-slate-400">Tidak perlu</span>;
    const proof = assignments[order.row] ? proofs[assignments[order.row]] : undefined;
    const locked = saving || isSaved(order.row);

    if (proof) {
      return (
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setViewProofUrl(proof.url)} className="shrink-0">
            <img src={proof.url} alt="Bukti" className="h-10 w-10 rounded-md border border-slate-200 object-cover" />
          </button>
          {!locked && (
            <button type="button" onClick={() => unassignProof(order.row)} className="text-slate-400 hover:text-red-500" title="Lepas bukti">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      );
    }

    if (order.errors.length > 0 || locked) return <span className="text-xs text-slate-400">-</span>;
    return (
      <button
        type="button"
        onClick={() => {
          rowProofTargetRef.current = order.row;
          rowProofInputRef.current?.click();
        }}
        className="inline-flex items-center gap-1 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100"
      >
        <ImagePlus className="h-3.5 w-3.5" /> Upload
      </button>
    );
  };

  const filterTabs: Array<{ key: FilterTab; label: string; count: number }> = [
    { key: 'all', label: 'Semua', count: orders.length },
    { key: 'ready', label: 'Siap Disimpan', count: counts.ready },
    { key: 'proof', label: 'Butuh Bukti', count: counts.proofMissing },
    { key: 'error', label: 'Error', count: counts.error },
    { key: 'saved', label: 'Tersimpan', count: counts.saved },
  ];

  return (
    <div className="w-full space-y-6 px-4 py-6 md:px-8 lg:px-12">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Import Pesanan (Excel)</h1>
          <p className="mt-1 text-sm text-slate-500">
            Buat banyak pesanan sekaligus dari file Excel. Harga, ongkir, fee COD &amp; total dihitung otomatis oleh sistem.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={downloadTemplate}
            disabled={downloadingTemplate}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
          >
            {downloadingTemplate ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download Template
          </button>
          {orders.length > 0 && (
            <button
              type="button"
              onClick={() => excelInputRef.current?.click()}
              disabled={saving || loadingPreview}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw className="h-4 w-4" /> Ganti File
            </button>
          )}
        </div>
      </div>

      <input ref={excelInputRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => handleExcelFile(e.target.files?.[0])} />
      <input ref={proofInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleProofFiles(e.target.files)} />
      <input ref={rowProofInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleRowProof(e.target.files)} />

      {orders.length === 0 ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver('excel'); }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => { e.preventDefault(); setDragOver(null); handleExcelFile(e.dataTransfer.files?.[0]); }}
            onClick={() => !loadingPreview && excelInputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-white p-10 text-center transition-colors lg:col-span-2 ${dragOver === 'excel' ? 'border-purple-400 bg-purple-50' : 'border-slate-300 hover:border-purple-300'}`}
          >
            {loadingPreview ? (
              <>
                <Loader2 className="h-12 w-12 animate-spin text-purple-400" />
                <p className="mt-4 font-semibold text-slate-700">Membaca &amp; memvalidasi file...</p>
              </>
            ) : (
              <>
                <FileSpreadsheet className="h-12 w-12 text-purple-400" />
                <p className="mt-4 font-semibold text-slate-700">Klik atau seret file Excel (.xlsx) ke sini</p>
                <p className="mt-1 text-sm text-slate-500">Maksimal 500 pesanan per file. Data belum disimpan sampai Anda menekan Simpan di halaman preview.</p>
              </>
            )}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-bold text-slate-800">Cara pakai</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-600">
              <li>Download template. Dropdown di dalamnya sudah berisi produk, gudang, ekspedisi, dll.</li>
              <li><b>1 baris = 1 pesanan</b>. Item ditulis ke kanan, Item 1 s/d Item {MAX_ITEMS_PER_ROW} (maksimal {MAX_ITEMS_PER_ROW} item termasuk hadiah).</li>
              <li>Pilih <b>Jenis Pesanan</b> (Akuisisi / CSO / CRM / Resend) per pesanan.</li>
              <li>Upload file, lalu periksa hasilnya di halaman preview.</li>
              <li>Untuk Transfer &amp; Free, upload bukti sekaligus. Beri nama file sesuai No WhatsApp (mis. <code className="rounded bg-slate-100 px-1">081234567890.jpg</code>) atau nomor baris Excel (mis. <code className="rounded bg-slate-100 px-1">5.jpg</code>) agar otomatis terpasang.</li>
              <li>Tekan <b>Simpan</b>. Pesanan yang gagal bisa diunduh, diperbaiki, lalu diupload ulang.</li>
            </ol>
          </div>
        </div>
      ) : (
        <>
          {/* Ringkasan */}
          <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="flex items-center gap-2 truncate text-sm font-semibold text-slate-700">
                <FileSpreadsheet className="h-4 w-4 shrink-0 text-purple-500" /> {fileName}
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">{orders.length} pesanan</span>
                <span className="rounded-full bg-purple-50 px-2.5 py-1 text-purple-700">{counts.ready} siap disimpan</span>
                <span className="rounded-full bg-red-50 px-2.5 py-1 text-red-600">{counts.error} error</span>
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                  Bukti {counts.proofNeeded - counts.proofMissing}/{counts.proofNeeded} terpasang
                </span>
                {counts.saved > 0 && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">{counts.saved} tersimpan</span>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {orders.some((order) => !isSaved(order.row)) && (
                <button
                  type="button"
                  onClick={downloadFailed}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  <Download className="h-4 w-4" /> Unduh yang Belum Tersimpan
                </button>
              )}
              <button
                type="button"
                onClick={saveOrders}
                disabled={saving || counts.ready === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-purple-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? `Menyimpan ${progress.done}/${progress.total}` : `Simpan ${counts.ready} Pesanan`}
              </button>
            </div>
          </div>

          {saving && (
            <div className="h-2 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full bg-purple-500 transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
            </div>
          )}

          {/* Bukti pembayaran */}
          {(proofTargets.length > 0 || Object.keys(proofs).length > 0) && (
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-1 border-b border-slate-100 bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="font-bold text-slate-800">Bukti Pembayaran (Transfer &amp; Free)</h2>
                  <p className="text-xs text-slate-500">
                    Upload banyak sekaligus. Nama file = <b>No WhatsApp</b> (mis. 081234567890.jpg) atau <b>nomor baris Excel</b> (mis. 5.jpg) otomatis terpasang. Satu bukti bisa dipakai untuk beberapa pesanan.
                  </p>
                </div>
                <span className="text-xs font-semibold text-amber-700">{counts.proofMissing} pesanan belum ada bukti</span>
              </div>
              <div className="space-y-4 p-4">
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver('proof'); }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={(e) => { e.preventDefault(); setDragOver(null); if (!saving) handleProofFiles(e.dataTransfer.files); }}
                  onClick={() => !saving && !processingProofs && proofInputRef.current?.click()}
                  className={`flex cursor-pointer items-center justify-center gap-3 rounded-xl border-2 border-dashed p-5 text-sm transition-colors ${dragOver === 'proof' ? 'border-purple-400 bg-purple-50' : 'border-slate-300 hover:border-purple-300'}`}
                >
                  {processingProofs ? <Loader2 className="h-5 w-5 animate-spin text-purple-400" /> : <Upload className="h-5 w-5 text-purple-400" />}
                  <span className="font-semibold text-slate-600">{processingProofs ? 'Memproses gambar...' : 'Klik atau seret banyak gambar bukti ke sini'}</span>
                </div>

                {unassignedProofs.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Belum Dipasangkan ({unassignedProofs.length})</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {unassignedProofs.map((proof) => (
                        <div key={proof.id} className="flex gap-3 rounded-xl border border-slate-200 p-2">
                          <button type="button" onClick={() => setViewProofUrl(proof.url)} className="shrink-0">
                            <img src={proof.url} alt={proof.originalName} className="h-16 w-16 rounded-lg object-cover" />
                          </button>
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <p className="truncate text-xs font-semibold text-slate-700" title={proof.originalName}>{proof.originalName}</p>
                            <select
                              value=""
                              disabled={saving}
                              onChange={(e) => assignProof(proof.id, [Number(e.target.value)])}
                              className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs outline-none focus:border-purple-300"
                            >
                              <option value="">Pasangkan ke pesanan...</option>
                              {proofTargets.map((order) => (
                                <option key={order.row} value={order.row}>
                                  Baris {order.row} · {order.customerName} · {formatWhatsapp(order.whatsappKey, order.whatsappCountry)}{hasProof(order.row) ? ' (ganti)' : ''}
                                </option>
                              ))}
                            </select>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => assignProofToSelected(proof.id)}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-600 hover:text-purple-800 disabled:opacity-50"
                              >
                                <Link2 className="h-3 w-3" /> Ke pesanan tercentang ({selectedRows.filter((row) => proofTargets.some((order) => order.row === row)).length})
                              </button>
                              <button type="button" disabled={saving} onClick={() => deleteProof(proof.id)} className="ml-auto text-slate-400 hover:text-red-500" title="Hapus">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tabel preview */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap gap-2 border-b border-slate-100 bg-slate-50 p-3">
              {filterTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setFilter(tab.key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${filter === tab.key ? 'bg-purple-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}
                >
                  {tab.label} <span className="opacity-75">({tab.count})</span>
                </button>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-white text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="w-10 px-3 py-3">
                      <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} disabled={saving} className="h-4 w-4 rounded border-slate-300 text-purple-500" />
                    </th>
                    <th className="px-3 py-3">Baris</th>
                    <th className="px-3 py-3">Customer</th>
                    <th className="px-3 py-3">Pengiriman</th>
                    <th className="px-3 py-3">Item</th>
                    <th className="px-3 py-3">Pembayaran</th>
                    <th className="px-3 py-3 text-right">Rincian (Rp)</th>
                    <th className="px-3 py-3">Bukti</th>
                    <th className="px-3 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order) => {
                    const result = results[order.row];
                    const messages = [
                      ...(result?.status === 'error' ? [result.message] : []),
                      ...(result?.status === 'success' ? [] : order.errors),
                    ];
                    return (
                      <React.Fragment key={order.row}>
                        <tr className={`border-t border-slate-100 align-top ${isSaved(order.row) ? 'bg-emerald-50/40' : ''}`}>
                          <td className="px-3 py-3">
                            <input
                              type="checkbox"
                              checked={selectedRows.includes(order.row)}
                              onChange={() => toggleSelected(order.row)}
                              disabled={saving || isSaved(order.row)}
                              className="h-4 w-4 rounded border-slate-300 text-purple-500"
                            />
                          </td>
                          <td className="px-3 py-3">
                            <p className="font-bold text-slate-800">{order.row}</p>
                            {order.jenis ? (
                              <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${JENIS_BADGE[order.jenis]}`}>{order.jenis}</span>
                            ) : (
                              <span className="mt-1 inline-block rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-600">{order.input.fields.jenis || 'Jenis?'}</span>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <p className="font-semibold text-slate-800">{order.customerName || '-'}</p>
                            <p className="text-xs text-slate-500">{order.whatsappKey ? formatWhatsapp(order.whatsappKey, order.whatsappCountry) : order.input.fields.whatsapp || '-'}</p>
                            {order.whatsapp && (
                              <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${order.isExistingCustomer ? 'bg-slate-100 text-slate-600' : 'bg-sky-50 text-sky-700'}`}>
                                {order.isExistingCustomer ? 'Customer lama' : 'Customer baru'}
                              </span>
                            )}
                          </td>
                          <td className="max-w-[220px] px-3 py-3 text-xs text-slate-600">
                            <p className="font-semibold text-slate-700">{order.warehouseName || '-'} · {order.courierName || '-'}</p>
                            <p className="mt-0.5 break-words">{order.destination || '-'}</p>
                            <p className="mt-0.5 text-slate-400">{formatCurrency(order.totals.totalWeight)} gr</p>
                          </td>
                          <td className="max-w-[240px] px-3 py-3 text-xs text-slate-600">
                            {order.items.length === 0 ? '-' : order.items.map((item, index) => (
                              <div key={`${item.name}-${index}`} className="mb-1">
                                <span className="font-semibold text-slate-700">{item.name}</span> × {item.qty}
                                {item.kind === 'gift' && <span className="ml-1 rounded bg-pink-50 px-1 text-[10px] font-semibold text-pink-600">Hadiah</span>}
                                {item.kind === 'bundle' && <span className="ml-1 rounded bg-indigo-50 px-1 text-[10px] font-semibold text-indigo-600">Bundling</span>}
                                {item.components && <p className="text-[10px] text-slate-400">{item.components.join(', ')}</p>}
                              </div>
                            ))}
                          </td>
                          <td className="px-3 py-3 text-xs">
                            <p className="font-semibold text-slate-700">{order.paymentDetail || '-'}</p>
                          </td>
                          <td className="px-3 py-3 text-right text-xs text-slate-600">
                            <p>Produk {formatCurrency(order.totals.subtotal)}</p>
                            {order.totals.productDiscount > 0 && <p>Diskon -{formatCurrency(order.totals.productDiscount)}</p>}
                            <p>Ongkir {formatCurrency(order.totals.shippingCost)}</p>
                            {order.totals.feeCod > 0 && <p>Fee COD {formatCurrency(order.totals.feeCod)}</p>}
                            {order.totals.otherFee > 0 && <p>Lain {formatCurrency(order.totals.otherFee)}</p>}
                            <p className="mt-1 text-sm font-bold text-purple-600">{formatCurrency(order.totals.totalPayment)}</p>
                          </td>
                          <td className="px-3 py-3">{renderProofCell(order)}</td>
                          <td className="px-3 py-3">{renderStatus(order)}</td>
                        </tr>
                        {(messages.length > 0 || order.warnings.length > 0) && (
                          <tr className="border-t border-dashed border-slate-100">
                            <td />
                            <td colSpan={8} className="px-3 pb-3 pt-1 text-xs">
                              {messages.map((message) => (
                                <p key={message} className="flex items-start gap-1 text-red-600"><XCircle className="mt-0.5 h-3 w-3 shrink-0" /> {message}</p>
                              ))}
                              {order.warnings.map((message) => (
                                <p key={message} className="flex items-start gap-1 text-amber-700"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {message}</p>
                              ))}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                  {filteredOrders.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-sm text-slate-500">Tidak ada pesanan pada filter ini.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {viewProofUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setViewProofUrl(null)}>
          <img src={viewProofUrl} alt="Bukti pembayaran" className="max-h-[90vh] max-w-full rounded-xl shadow-2xl" />
          <button type="button" className="absolute right-4 top-4 rounded-full bg-white/90 p-2 text-slate-700" onClick={() => setViewProofUrl(null)}>
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}
