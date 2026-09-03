'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useSocketEvent } from '@/hooks/useSocketEvent';
import { useAuth } from '@/contexts/AuthContext';
import Swal from 'sweetalert2';
import { ExternalLink, Check, X } from 'lucide-react';

const getProofUrl = (value?: string | null) => {
  if (!value) {
    return '';
  }

  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value;
  }

  return `/${value.replace(/^\/+/, '')}`;
};

export default function ValidasiPembayaranPage() {
  const { user } = useAuth();
  const canValidate = user?.role !== 'cs' && user?.role !== 'cs_crm';

  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [idReff, setIdReff] = useState('');
  const [idReffWarning, setIdReffWarning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const requiresIdReff = selectedPayment?.payment_method === 'bank_transfer';

  // Items modal state
  const [isItemsModalOpen, setIsItemsModalOpen] = useState(false);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [selectedItems, setSelectedItems] = useState<any[]>([]);
  const [selectedTotals, setSelectedTotals] = useState<any>(null);
  const [selectedOrderCode, setSelectedOrderCode] = useState('');
  const [selectedProofUrl, setSelectedProofUrl] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);

  const formatCurrency = (value: number) => `Rp ${Number(value || 0).toLocaleString('id-ID')}`;

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/validasi_pembayaran');
      const json = await res.json();
      if (json.status === 'success') {
        setOrders(json.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch orders:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  useSocketEvent('NEW_ORDER', () => {
    fetchOrders();
  });

  // Handle ID Reff check
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    if (!requiresIdReff) {
      setIdReffWarning(false);
      return;
    }

    if (idReff.trim().length > 0) {
      debounceTimer.current = setTimeout(async () => {
        try {
          const res = await fetch('/api/validasi_pembayaran/check?check_id_reff=' + encodeURIComponent(idReff.trim()));
          const json = await res.json();
          setIdReffWarning(json.exists === true);
        } catch (e) {
          console.error(e);
        }
      }, 500);
    } else {
      setIdReffWarning(false);
    }

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [idReff, requiresIdReff]);

  const handleViewItems = async (order: any) => {
    setSelectedOrderCode(order.order_code);
    setSelectedItems([]);
    setSelectedTotals(null);
    setSelectedProofUrl(order.payment_proof_url || '');
    setSelectedCustomer(null);
    setIsItemsModalOpen(true);
    setItemsLoading(true);
    try {
      const res = await fetch(`/api/validasi_pembayaran/items?order_id=${order.order_id}&source_table=${order.source_table}`);
      const json = await res.json();
      if (json.status === 'success') {
        setSelectedItems(json.data?.items || []);
        setSelectedTotals(json.data?.totals || null);
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

  const handleApproveClick = (order: any) => {
    setSelectedPayment(order);
    setIdReff('');
    setIdReffWarning(false);
    setIsModalOpen(true);
  };

  const handleRejectClick = async (order: any) => {
    const { value: reason, isConfirmed } = await Swal.fire({
      title: 'Tolak Pembayaran',
      input: 'textarea',
      inputLabel: 'Alasan Penolakan',
      inputPlaceholder: 'Masukkan alasan kenapa pembayaran ditolak...',
      showCancelButton: true,
      confirmButtonText: 'Tolak Pembayaran',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#ef4444',
      inputValidator: (value) => {
        if (!value || value.trim() === '') {
          return 'Alasan penolakan wajib diisi!';
        }
      }
    });

    if (!isConfirmed) return;

    try {
      const res = await fetch('/api/validasi_pembayaran', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reject',
          payment_id: order.payment_id,
          source_table: order.source_table,
          reject_reason: reason.trim()
        })
      });
      const json = await res.json();
      if (json.status === 'success') {
        Swal.fire('Berhasil', json.message, 'success');
        fetchOrders();
      } else {
        Swal.fire('Error', json.message, 'error');
      }
    } catch (e: any) {
      Swal.fire('Error', e.message || 'Gagal menolak pembayaran', 'error');
    }
  };

  const submitApprove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (requiresIdReff && !idReff.trim()) {
      Swal.fire('Error', 'ID Reff wajib diisi', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/validasi_pembayaran', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          payment_id: selectedPayment.payment_id,
          source_table: selectedPayment.source_table,
          id_reff: idReff.trim()
        })
      });
      const json = await res.json();
      if (json.status === 'success') {
        Swal.fire('Berhasil', json.message, 'success');
        setIsModalOpen(false);
        fetchOrders();
      } else {
        Swal.fire('Error', json.message, 'error');
      }
    } catch (e: any) {
      Swal.fire('Error', e.message || 'Gagal memvalidasi pembayaran', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-full flex flex-col p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Validasi FAT</h1>
          <p className="text-sm text-slate-400 mt-1">Halaman untuk memvalidasi pembayaran transfer bank dan approval metode free.</p>
        </div>
      </div>

      {/* Table Section */}
      <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/50">
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Tanggal & Waktu</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">ID Pesanan</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Pelanggan</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Bayar</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Rekening Tujuan</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Bukti Pembayaran / Approval</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                {canValidate && (
                  <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Aksi</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={canValidate ? 8 : 7} className="text-center py-12 text-slate-400 text-sm">Memuat data...</td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={canValidate ? 8 : 7} className="text-center py-12 text-slate-400">
                    <div className="flex flex-col items-center justify-center">
                      <Check className="w-10 h-10 text-slate-300 mb-2" />
                      <p className="text-sm">Tidak ada pembayaran yang perlu divalidasi.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                orders.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 text-slate-400 text-xs">
                      {new Date(row.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                    </td>
                    <td className="p-4 text-sm">
                      <button
                        type="button"
                        onClick={() => handleViewItems(row)}
                        className="font-semibold text-blue-600 hover:text-blue-700 hover:underline"
                      >
                        {row.order_code}
                      </button>
                    </td>
                    <td className="p-4 font-semibold text-slate-700 text-sm">
                      {row.customer_name}
                    </td>
                    <td className="p-4 font-bold text-emerald-600 text-sm">
                      Rp {Number(row.total_payment).toLocaleString('id-ID')}
                    </td>
                    <td className="p-4">
                      <p className="text-sm font-semibold text-slate-700">{row.bank_name || '-'}</p>
                      <p className="text-[11px] text-slate-500 font-medium">{row.payment_method === 'free' ? 'Free / Tanpa Pembayaran' : 'Bank Transfer'}</p>
                      <p className="text-xs text-slate-500">{row.account_number || ''} - {row.account_name || ''}</p>
                    </td>
                    <td className="p-4">
                      {row.payment_proof_url ? (
                        <a href={getProofUrl(row.payment_proof_url)} target="_blank" rel="noreferrer" className="text-purple-600 hover:text-purple-700 hover:underline text-sm font-medium flex items-center gap-1 w-max">
                          <ExternalLink className="w-4 h-4" />
                          Lihat Bukti
                        </a>
                      ) : (
                        <span className="text-slate-400 text-sm">Tidak ada</span>
                      )}
                    </td>
                    <td className="p-4">
                      {row.payment_status === 'rejected' ? (
                        <div className="flex flex-col gap-1 items-start">
                          <span className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border bg-red-50 text-red-600 border-red-200">Ditolak</span>
                          {row.validated_by_name && (
                            <span className="text-[10px] text-slate-500 font-medium">
                              Oleh: {row.validated_by_name}
                            </span>
                          )}
                          {row.reject_reason && (
                            <span className="text-[10px] text-red-500 font-medium break-words max-w-[150px] leading-tight">
                              Alasan: {row.reject_reason}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border bg-amber-50 text-amber-600 border-amber-200">Menunggu</span>
                      )}
                    </td>
                    {canValidate && (
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => handleApproveClick(row)} className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-[11px] font-bold transition-colors shadow-sm">
                            Approve
                          </button>
                          <button onClick={() => handleRejectClick(row)} className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-[11px] font-bold transition-colors shadow-sm">
                            Reject
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Approve */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-800">Approve Pembayaran</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={submitApprove} className="p-6 space-y-4 bg-slate-50/50">
              {requiresIdReff ? (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">ID Reff <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={idReff}
                    onChange={(e) => setIdReff(e.target.value)}
                    required
                    placeholder="Masukkan ID Referensi"
                    className="w-full text-sm border border-slate-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-purple-400 focus:border-purple-400"
                  />
                  {idReffWarning && (
                    <p className="text-red-500 text-[11px] mt-1.5 font-medium flex items-center gap-1">
                      <X className="w-3 h-3" /> Peringatan: ID Reff ini sudah pernah digunakan!
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  Metode pembayaran free tidak memerlukan ID Reff. Approval akan langsung menandai bukti approval ini sebagai valid.
                </div>
              )}
              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold rounded-lg text-sm transition-colors shadow-sm">
                  Batal
                </button>
                <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg text-sm transition-colors shadow-sm flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed">
                  <Check className="w-4 h-4" />
                  {isSubmitting ? 'Memproses...' : 'Konfirmasi Approve'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
