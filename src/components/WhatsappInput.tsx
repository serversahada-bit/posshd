'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { WA_COUNTRIES, getWaCountry, waFlag } from '@/lib/whatsappNumber';

// Input Nomor WhatsApp: dropdown kode negara dengan kotak pencarian + nomor lokal.
// onChange menerima teks mentah dari input dan ISO negara; normalisasi dilakukan pemanggil
// lewat parseWaInput.
export default function WhatsappInput({ country, local, onChange }: {
  country: string;
  local: string;
  onChange: (wa: string, country: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const selected = getWaCountry(country);

  // Cari berdasarkan nama, kode telepon ("852" / "+852") atau kode ISO ("HK");
  // nama yang diawali kata kunci ditaruh paling atas.
  const results = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^\+/, '');
    if (!q) return WA_COUNTRIES;
    const hits = WA_COUNTRIES.filter((c) =>
      c.name.toLowerCase().includes(q) || c.dial.startsWith(q) || c.iso.toLowerCase() === q);
    const rank = (name: string) => (name.toLowerCase().startsWith(q) ? 0 : 1);
    return hits.sort((a, b) => rank(a.name) - rank(b.name));
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  useEffect(() => {
    if (open) listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const toggle = () => {
    setQuery('');
    setActive(0);
    setOpen((o) => !o);
  };

  const pick = (iso: string) => {
    setOpen(false);
    onChange(local, iso);
  };

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      // Jangan sampai Enter men-submit form pesanan
      e.preventDefault();
      if (results[active]) pick(results[active].iso);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={boxRef} className="relative flex">
      <button
        type="button"
        onClick={toggle}
        title={selected.name}
        className="flex items-center gap-1 shrink-0 border border-r-0 border-slate-300 rounded-l-lg px-2.5 bg-slate-50 hover:bg-slate-100 text-sm text-slate-700 outline-none focus:ring-1 focus:ring-purple-300"
      >
        <span>{waFlag(selected.iso)}</span>
        <span>+{selected.dial}</span>
        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
      </button>
      <input
        required
        value={local}
        onChange={(e) => onChange(e.target.value, country)}
        type="text"
        inputMode="tel"
        className="w-full min-w-0 border border-slate-300 rounded-r-lg px-4 py-2.5 focus:ring-1 focus:ring-purple-300 focus:border-purple-300 outline-none text-sm placeholder:text-slate-400"
        placeholder={country === 'ID' ? 'Contoh: 81234567890' : `Nomor tanpa +${selected.dial}`}
      />

      {open && (
        <div className="absolute top-full left-0 mt-1 w-72 max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-lg shadow-lg z-50">
          <div className="p-2 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                autoFocus
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActive(0); }}
                onKeyDown={onSearchKeyDown}
                placeholder="Cari negara atau kode (mis. hong / 852)"
                className="w-full border border-slate-300 rounded-md pl-8 pr-3 py-2 text-sm outline-none focus:ring-1 focus:ring-purple-300 focus:border-purple-300 placeholder:text-slate-400"
              />
            </div>
          </div>
          <ul ref={listRef} className="max-h-60 overflow-y-auto py-1">
            {results.map((c, i) => (
              <li
                key={c.iso}
                onMouseDown={(e) => { e.preventDefault(); pick(c.iso); }}
                onMouseEnter={() => setActive(i)}
                className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer ${i === active ? 'bg-purple-50' : ''} ${c.iso === country ? 'font-semibold text-purple-700' : 'text-slate-700'}`}
              >
                <span>{waFlag(c.iso)}</span>
                <span className="flex-1 truncate">{c.name}</span>
                <span className="text-slate-400">+{c.dial}</span>
              </li>
            ))}
            {results.length === 0 && (
              <li className="px-3 py-2 text-sm text-slate-500 text-center">Negara tidak ditemukan</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
