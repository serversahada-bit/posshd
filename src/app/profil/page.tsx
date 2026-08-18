'use client';

import Image from 'next/image';
import React, { useState } from 'react';
import Swal from 'sweetalert2';
import { ImageIcon, KeyRound } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';

const roleLabels: Record<string, string> = {
  admin: 'Admin',
  finance: 'Finance',
  warehouse: 'Warehouse',
  cs: 'Customer Service (CS)',
  cs_crm: 'CS/CRM',
  owner: 'Owner',
};

type PasswordFormState = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

const emptyForm: PasswordFormState = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
};

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Terjadi kesalahan');

export default function ProfilPage() {
  const { user } = useAuth();
  const [form, setForm] = useState<PasswordFormState>(emptyForm);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (form.newPassword.length < 6) {
      Swal.fire('Error', 'Password baru minimal 6 karakter', 'error');
      return;
    }

    if (form.newPassword !== form.confirmPassword) {
      Swal.fire('Error', 'Konfirmasi password baru tidak cocok', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
        }),
      });

      const json: { success: boolean; message?: string } = await res.json();
      if (!json.success) {
        throw new Error(json.message || 'Gagal mengubah password');
      }

      Swal.fire('Berhasil', json.message || 'Password berhasil diubah.', 'success');
      setForm(emptyForm);
    } catch (error: unknown) {
      Swal.fire('Error', getErrorMessage(error), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Profil Saya</h1>
        <p className="text-sm text-slate-400 mt-1">Kelola informasi akun dan ubah password login Anda.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm lg:col-span-1">
          <div className="flex flex-col items-center text-center">
            <div className="relative h-24 w-24 overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200">
              {user?.photo_url ? (
                <Image src={user.photo_url} alt={user.name || 'User'} fill unoptimized className="object-cover" sizes="96px" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-slate-300">
                  <ImageIcon className="h-8 w-8" />
                </div>
              )}
            </div>
            <p className="mt-4 text-lg font-bold text-slate-800">{user?.name || '-'}</p>
            <p className="text-sm text-slate-400">{user?.email || '-'}</p>
            {user?.role ? (
              <span className="mt-3 rounded-lg border border-purple-200 bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-600">
                {roleLabels[user.role] || user.role.toUpperCase()}
              </span>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm lg:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-purple-600" />
            <h2 className="text-lg font-bold text-slate-800">Ubah Password</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">
                Password Saat Ini <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={form.currentPassword}
                onChange={(event) => setForm((prev) => ({ ...prev, currentPassword: event.target.value }))}
                className="h-11 w-full rounded-xl border border-slate-300 px-4 text-sm text-slate-700 outline-none transition-colors focus:border-purple-400 focus:ring-1 focus:ring-purple-400"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">
                Password Baru <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={form.newPassword}
                onChange={(event) => setForm((prev) => ({ ...prev, newPassword: event.target.value }))}
                className="h-11 w-full rounded-xl border border-slate-300 px-4 text-sm text-slate-700 outline-none transition-colors focus:border-purple-400 focus:ring-1 focus:ring-purple-400"
              />
              <p className="mt-1 text-xs text-slate-400">Minimal 6 karakter.</p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">
                Konfirmasi Password Baru <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={form.confirmPassword}
                onChange={(event) => setForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
                className="h-11 w-full rounded-xl border border-slate-300 px-4 text-sm text-slate-700 outline-none transition-colors focus:border-purple-400 focus:ring-1 focus:ring-purple-400"
              />
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-xl bg-purple-600 px-6 py-2.5 font-medium text-white shadow-lg shadow-purple-500/30 transition-all hover:-translate-y-0.5 hover:bg-purple-700 disabled:transform-none disabled:opacity-70"
              >
                {isSubmitting ? 'Menyimpan...' : 'Simpan Password'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
