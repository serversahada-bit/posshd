'use client';

import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import { Copy, Eye, EyeOff, KeyRound, RefreshCw } from 'lucide-react';

export default function ApiKeyPage() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [visible, setVisible] = useState(false);
  const [origin, setOrigin] = useState('');

  const fetchApiKey = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings/api-key');
      const json = await res.json();
      if (json.success) {
        setApiKey(json.data.api_key);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApiKey();
    setOrigin(window.location.origin);
  }, []);

  const handleGenerate = async () => {
    const confirm = await Swal.fire({
      title: apiKey ? 'Buat Ulang API Key?' : 'Buat API Key?',
      text: apiKey
        ? 'Key lama tidak akan berfungsi lagi. Website lain yang masih memakai key lama harus diperbarui.'
        : 'Key baru akan dibuat untuk mengakses API dari website lain.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Ya, lanjutkan',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#9333ea',
    });
    if (!confirm.isConfirmed) return;

    setGenerating(true);
    try {
      const res = await fetch('/api/settings/api-key', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setApiKey(json.data.api_key);
        setVisible(true);
        Swal.fire('Berhasil', 'API key berhasil dibuat.', 'success');
      } else {
        Swal.fire('Error', json.message || 'Gagal membuat API key', 'error');
      }
    } catch (e: any) {
      Swal.fire('Error', e.message || 'Gagal membuat API key', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      Swal.fire({ icon: 'success', title: `${label} disalin`, timer: 1200, showConfirmButton: false });
    } catch (e) {
      Swal.fire('Error', 'Gagal menyalin ke clipboard', 'error');
    }
  };

  const maskedKey = apiKey ? `${apiKey.slice(0, 10)}${'•'.repeat(Math.max(apiKey.length - 14, 8))}${apiKey.slice(-4)}` : '';

  return (
    <div className="h-full flex flex-col p-4 md:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">API Key</h1>
        <p className="text-sm text-slate-400 mt-1">Kelola API key untuk mengizinkan website lain mengakses data POS ini.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 max-w-2xl">
        <div className="flex items-center gap-2 mb-4">
          <KeyRound className="w-5 h-5 text-purple-600" />
          <h2 className="text-lg font-bold text-slate-800">API Key Aktif</h2>
        </div>

        {loading ? (
          <p className="text-sm text-slate-400">Memuat...</p>
        ) : apiKey ? (
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Key</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={visible ? apiKey : maskedKey}
                className="flex-1 text-sm font-mono border border-slate-300 rounded-lg px-4 py-2.5 bg-slate-50 text-slate-700"
              />
              <button
                type="button"
                onClick={() => setVisible((v) => !v)}
                className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors border border-slate-200"
                title={visible ? 'Sembunyikan' : 'Tampilkan'}
              >
                {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => handleCopy(apiKey, 'API key')}
                className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors border border-slate-200"
                title="Salin"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-6 border-t border-slate-100 pt-5">
              <p className="text-sm font-semibold text-slate-700 mb-2">Cara Pakai</p>
              <p className="text-sm text-slate-500 mb-2">
                Website lain bisa memanggil endpoint di bawah ini dengan menyertakan header <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">x-api-key</code>.
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={`${origin}/api/v1/products`}
                  className="flex-1 text-xs font-mono border border-slate-300 rounded-lg px-3 py-2 bg-slate-50 text-slate-600"
                />
                <button
                  type="button"
                  onClick={() => handleCopy(`${origin}/api/v1/products`, 'URL')}
                  className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors border border-slate-200"
                  title="Salin"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Resource lain yang tersedia: <code className="bg-slate-100 px-1 rounded">orders</code>, <code className="bg-slate-100 px-1 rounded">customers</code>, <code className="bg-slate-100 px-1 rounded">bundling</code>, <code className="bg-slate-100 px-1 rounded">gifts</code>, <code className="bg-slate-100 px-1 rounded">warehouses</code>, <code className="bg-slate-100 px-1 rounded">promo</code>.
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400 mb-4">Belum ada API key. Buat key untuk mulai mengizinkan akses dari website lain.</p>
        )}

        <button
          onClick={handleGenerate}
          disabled={generating}
          className="mt-6 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2.5 rounded-lg font-semibold flex items-center gap-2 transition-colors shadow-sm text-sm disabled:opacity-70 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} />
          {generating ? 'Memproses...' : apiKey ? 'Buat Ulang API Key' : 'Buat API Key'}
        </button>
      </div>
    </div>
  );
}
