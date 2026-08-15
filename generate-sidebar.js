const fs = require('fs');

let html = `
        <!-- Logo -->
        <div class="px-5 py-5 border-b border-slate-100">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl overflow-hidden shadow-md shadow-brand-500/25 flex-shrink-0">
                    <div class="w-full h-full bg-brand-500 flex items-center justify-center text-white font-bold">GS</div>
                </div>
                <div>
                    <h2 class="text-lg font-extrabold text-slate-800 tracking-tight">Great<span class="text-brand-500">Sales</span></h2>
                    <p class="text-[10px] text-slate-400 font-medium">Great Sales Operation System</p>
                </div>
            </div>
        </div>

        <!-- Navigation -->
        <nav class="flex-1 px-3 py-4 overflow-y-auto flex flex-col">
            <!-- Main Menu -->
            <div class="space-y-0.5 mb-6">
                <p class="nav-section-label mb-2">Menu Utama</p>

                <!-- Dashboard -->
                {hasAccess('dashboard') && (
                <Link href="/" className={\`nav-link \${pathname === '/' ? 'active' : ''}\`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                    </svg>
                    <span>Dashboard</span>
                </Link>
                )}

                <!-- Buat Pesanan Dropdown -->
                {hasAccess('buat_pesanan') && (
                <div className="group">
                    <button className={\`nav-link w-full justify-between \${isPesananActive ? 'text-brand-600 bg-brand-50' : ''}\`} onClick={() => toggleSubmenu('pesanan')}>
                        <div className="flex items-center gap-3">
                            <svg xmlns="http://www.w3.org/2000/svg" className={\`h-[18px] w-[18px] \${isPesananActive ? 'text-brand-600' : ''}\`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>Buat Pesanan</span>
                        </div>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                    <div className={\`pl-9 pr-2 py-1 space-y-1 \${(isPesananActive || openSubmenu === 'pesanan') ? '' : 'hidden'}\`}>
                        <Link href="/kasir" className={\`nav-link \${pathname === '/kasir' ? 'active' : ''}\`}>Akuisisi (Kasir)</Link>
                        <Link href="/pesanan" className={\`nav-link \${pathname === '/pesanan' ? 'active' : ''}\`}>Daftar Pesanan</Link>
                    </div>
                </div>
                )}

                <!-- Validasi FAT -->
                {hasAccess('validasi_fat') && (
                <Link href="/validasi_pembayaran" className={\`nav-link \${pathname === '/validasi_pembayaran' ? 'active' : ''}\`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Validasi FAT</span>
                </Link>
                )}

                <!-- Olahan -->
                {hasAccess('olahan') && (
                <Link href="/olahan" className={\`nav-link \${pathname === '/olahan' ? 'active' : ''}\`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                    <span>Olahan</span>
                </Link>
                )}

                <!-- Pembelian Terbaru -->
                {hasAccess('pembelian_terbaru') && (
                <Link href="/pembelian_terbaru" className={\`nav-link \${pathname === '/pembelian_terbaru' ? 'active' : ''}\`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                    </svg>
                    <span>Pembelian Terbaru</span>
                </Link>
                )}

                <!-- Data Kostumer -->
                {hasAccess('data_kostumer') && (
                <Link href="/pelanggan" className={\`nav-link \${pathname === '/pelanggan' ? 'active' : ''}\`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span>Data Kostumer</span>
                </Link>
                )}
            </div>

            <!-- Pengaturan Section -->
            {hasPengaturanAccess && (
            <div className="space-y-0.5 mb-6">
                <p className="nav-section-label mb-2">Pengaturan</p>

                <!-- Produk -->
                {hasAccess('produk') && (
                <Link href="/produk" className={\`nav-link \${pathname === '/produk' ? 'active' : ''}\`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                    <span>Produk</span>
                </Link>
                )}

                <!-- Promo -->
                {hasAccess('promo') && (
                <Link href="/promo" className={\`nav-link \${pathname === '/promo' ? 'active' : ''}\`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                    <span>Promo</span>
                </Link>
                )}

                <!-- Nama Advertiser -->
                {hasAccess('advertiser') && (
                <Link href="/advertiser" className={\`nav-link \${pathname === '/advertiser' ? 'active' : ''}\`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <span>Advertiser</span>
                </Link>
                )}

                <!-- Sumber Iklan -->
                {hasAccess('sumber_iklan') && (
                <Link href="/ad_source" className={\`nav-link \${pathname === '/ad_source' ? 'active' : ''}\`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                    </svg>
                    <span>Sumber Iklan</span>
                </Link>
                )}

                <!-- Gudang Dropdown -->
                {hasAccess('gudang') && (
                <div className="group">
                    <button className={\`nav-link w-full justify-between \${isGudangActive ? 'text-brand-600 bg-brand-50' : ''}\`} onClick={() => toggleSubmenu('gudang')}>
                        <div className="flex items-center gap-3">
                            <svg xmlns="http://www.w3.org/2000/svg" className={\`h-[18px] w-[18px] \${isGudangActive ? 'text-brand-600' : ''}\`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                            <span>Gudang</span>
                        </div>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                    <div className={\`pl-9 pr-2 py-1 space-y-1 \${(isGudangActive || openSubmenu === 'gudang') ? '' : 'hidden'}\`}>
                        <Link href="/setting_gudang" className={\`nav-link \${pathname === '/setting_gudang' ? 'active' : ''}\`}>Setting Gudang</Link>
                        <Link href="/stok_produk" className={\`nav-link \${pathname === '/stok_produk' ? 'active' : ''}\`}>Stok Produk</Link>
                    </div>
                </div>
                )}
            </div>
            )}

            <!-- Admin Only Section -->
            {(userRole === 'admin' || userRole === 'owner') && (
            <div className="space-y-0.5 mb-6">
                <p className="nav-section-label mb-2">Administrator</p>
                
                <Link href="/users" className={\`nav-link \${pathname === '/users' ? 'active' : ''}\`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                    <span>Manajemen User</span>
                </Link>

                <Link href="/laporan" className={\`nav-link \${pathname === '/laporan' ? 'active' : ''}\`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Laporan & Log</span>
                </Link>
            </div>
            )}

            <!-- Spacer to push profile down -->
            <div className="flex-1"></div>
        </nav>

        <!-- User Profile -->
        <div className="px-4 py-4 border-t border-slate-100">
            <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-400 flex items-center justify-center text-white font-bold text-sm shadow-sm">
                    {roleInitial}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-700 truncate">{user?.name || 'User'}</p>
                    <p className="text-[11px] text-slate-400 capitalize">{userRole || 'Role'}</p>
                </div>
                <button onClick={logout} className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-all" title="Logout">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                </button>
            </div>
        </div>
`;

// fix HTML comments to JSX comments
html = html.replace(/<!--(.*?)-->/g, '{/* $1 */}');

// wrap in component
const finalCode = \`'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);

  const roleInitial = user?.name?.charAt(0)?.toUpperCase() || 'A';
  const userRole = user?.role ?? '';
  const permissions = (user as any)?.permissions || [];

  const hasAccess = (menuKey: string) => {
    if (userRole === 'admin' || userRole === 'owner') return true;
    const roleMapping: Record<string, string[]> = {
      'dashboard': ['finance', 'cs', 'cs_crm', 'warehouse'],
      'buat_pesanan': ['cs', 'cs_crm'],
      'data_kostumer': ['cs', 'cs_crm'],
      'produk': ['warehouse'],
      'pembelian_terbaru': ['finance'],
      'olahan': ['finance'],
    };
    if (roleMapping[menuKey]?.includes(userRole)) return true;
    return permissions.includes(menuKey);
  };

  const toggleSubmenu = (menu: string) => {
    setOpenSubmenu(openSubmenu === menu ? null : menu);
  };

  const isPesananActive = ['/buat_pesanan', '/buat_pesanan_cso', '/buat_pesanan_crm', '/buat_pesanan_resend', '/kasir', '/pesanan'].includes(pathname);
  const isGudangActive = ['/setting_gudang', '/stok_produk', '/stok_hadiah'].includes(pathname);

  const hasPengaturanAccess = hasAccess('produk') || hasAccess('promo') || hasAccess('advertiser') || hasAccess('sumber_iklan') || hasAccess('hadiah') || hasAccess('bundling') || hasAccess('biaya_ongkir') || hasAccess('penambahan_ekspedisi') || hasAccess('penambahan_ongkir') || hasAccess('gudang') || hasAccess('pembayaran');

  return (
    <aside className="sidebar w-[260px] bg-white flex flex-col border-r border-slate-200/80 shadow-sm" id="sidebar">
\${html}
    </aside>
  );
}
\`;

fs.writeFileSync('d:/Coding/Juli/Pos/pos-app/src/components/Sidebar.tsx', finalCode);
