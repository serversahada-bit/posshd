'use client';

import Link from 'next/link';

export default function InventoriTabs({ active }: { active: 'balance' | 'flow' }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold text-slate-800 mb-3">Inventory</h1>
      <div className="flex items-center gap-6 border-b border-slate-200">
        <Link
          href="/inventori"
          className={`pb-3 text-sm font-semibold border-b-2 -mb-px transition-colors ${active === 'balance' ? 'border-purple-600 text-purple-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          Inventory Balance
        </Link>
        <Link
          href="/inventori/flow"
          className={`pb-3 text-sm font-semibold border-b-2 -mb-px transition-colors ${active === 'flow' ? 'border-purple-600 text-purple-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          Inventory Flow
        </Link>
      </div>
    </div>
  );
}
