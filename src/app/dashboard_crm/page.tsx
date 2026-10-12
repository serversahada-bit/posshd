'use client';

import { useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  BarController,
  Tooltip,
  Legend,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import { Loader2, MessageCircle } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

ChartJS.register(CategoryScale, LinearScale, BarElement, BarController, Tooltip, Legend);

type FollowUpRow = {
  phone: string;
  name: string | null;
  city: string | null;
  agent: string | null;
  last_order_at: string;
  days_since_last_order: number;
  total_transaksi: number;
  total_belanja: number;
};

type DashboardCrmData = {
  years: number[];
  agents: string[];
  loaded_at: string;
  summary: {
    crm_omzet: number;
    crm_transaksi: number;
    total_omzet: number;
    crm_share: number;
    period_customers: number;
    repeat_customers: number;
    new_customers: number;
    repeat_rate: number;
    active_customers: number;
    dormant_customers: number;
  };
  trend: { period: number; label: string; crm_omzet: number; non_crm_omzet: number }[];
  leaderboard: { name: string; transaksi: number; omzet: number; customers: number; rata_rata_order: number }[];
  ro_distribution: { label: string; customers: number }[];
  follow_up: {
    due_min_days: number;
    due_max_days: number;
    dormant_days: number;
    due: { total: number; rows: FollowUpRow[] };
    dormant: { total: number; rows: FollowUpRow[] };
  };
};

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

// Warna seri: biru = CRM, oranye = Non-CRM.
const CRM_COLOR = '#2a78d6';
const NON_CRM_COLOR = '#eb6834';

const compactNumber = new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 });
const formatCompactRupiah = (value: number) => `Rp ${compactNumber.format(value)}`;
const formatNumber = (value: number) => value.toLocaleString('id-ID');
const formatPercent = (value: number) => `${(value * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`;
const formatDate = (value: string) =>
  new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));

const selectClassName =
  'h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none transition-colors focus:border-slate-400 focus:ring-1 focus:ring-slate-400';

function StatTile({ label, value, title, note }: { label: string; value: string; title?: string; note: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-800" title={title}>
        {value}
      </p>
      <p className="mt-1 text-sm text-slate-500">{note}</p>
    </div>
  );
}

export default function DashboardCrmPage() {
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState('');
  const [agent, setAgent] = useState('');
  const [followUpTab, setFollowUpTab] = useState<'due' | 'dormant'>('due');
  const [data, setData] = useState<DashboardCrmData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function fetchDashboard() {
      setLoading(true);
      setError('');

      try {
        const params = new URLSearchParams();
        if (year) params.set('year', year);
        if (month) params.set('month', month);
        if (agent) params.set('agent', agent);

        const res = await fetch(`/api/dashboard_crm?${params.toString()}`, { cache: 'no-store' });
        const json = await res.json();
        if (!json.success || !json.data) {
          throw new Error(json.message || 'Gagal mengambil data dashboard CRM');
        }
        if (!cancelled) setData(json.data);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Terjadi kesalahan');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchDashboard();
    return () => {
      cancelled = true;
    };
  }, [year, month, agent]);

  const periodLabel = `${month ? `${MONTHS[Number(month) - 1]} ` : ''}${year || 'Semua Tahun'}`;
  const summary = data?.summary;
  const roTotal = data?.ro_distribution.reduce((sum, item) => sum + item.customers, 0) ?? 0;
  const roMax = Math.max(1, ...(data?.ro_distribution.map((item) => item.customers) ?? [1]));
  const followUp = data ? data.follow_up[followUpTab] : null;

  return (
    <div className="h-full flex flex-col">
      <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard CRM</h1>
          <p className="mt-1 text-sm text-slate-400">
            Data transaksi dataslu · transaksi CRM = kolom adv berawalan &quot;CRM&quot;
            {data ? ` · diperbarui ${new Date(data.loaded_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {loading ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
          <select value={year} onChange={(event) => setYear(event.target.value)} className={selectClassName} aria-label="Tahun">
            <option value="">Semua Tahun</option>
            {(data?.years ?? []).map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select value={month} onChange={(event) => setMonth(event.target.value)} className={selectClassName} aria-label="Bulan">
            <option value="">Semua Bulan</option>
            {MONTHS.map((item, index) => (
              <option key={item} value={index + 1}>
                {item}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</div>
      ) : null}

      {!data && loading ? (
        <div className="flex flex-1 items-center justify-center py-24 text-sm text-slate-400">Memuat dashboard...</div>
      ) : null}

      {data && summary ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatTile
              label={`Omzet CRM · ${periodLabel}`}
              value={formatCompactRupiah(summary.crm_omzet)}
              title={formatCurrency(summary.crm_omzet)}
              note={`${formatPercent(summary.crm_share)} dari total omzet ${formatCompactRupiah(summary.total_omzet)}`}
            />
            <StatTile
              label={`Transaksi CRM · ${periodLabel}`}
              value={formatNumber(summary.crm_transaksi)}
              note={`Rata-rata ${formatCompactRupiah(summary.crm_transaksi > 0 ? summary.crm_omzet / summary.crm_transaksi : 0)} per transaksi`}
            />
            <StatTile
              label={`Repeat Order Rate · ${periodLabel}`}
              value={formatPercent(summary.repeat_rate)}
              note={`${formatNumber(summary.repeat_customers)} RO · ${formatNumber(summary.new_customers)} baru dari ${formatNumber(summary.period_customers)} customer`}
            />
            <StatTile
              label={`Customer Dorman (>${data.follow_up.dormant_days} hari)`}
              value={formatNumber(summary.dormant_customers)}
              note={`${formatNumber(summary.active_customers)} customer aktif dalam ${data.follow_up.dormant_days} hari terakhir`}
            />
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 p-5">
              <h3 className="font-bold text-slate-800">Omzet Bulanan CRM vs Non-CRM · {year || 'Semua Tahun'}</h3>
            </div>
            <div className="h-80 p-5">
              <Chart
                type="bar"
                data={{
                  labels: data.trend.map((item) => item.label),
                  datasets: [
                    {
                      label: 'CRM',
                      data: data.trend.map((item) => item.crm_omzet),
                      backgroundColor: CRM_COLOR,
                      stack: 'omzet',
                      maxBarThickness: 28,
                    },
                    {
                      label: 'Non-CRM',
                      data: data.trend.map((item) => item.non_crm_omzet),
                      backgroundColor: NON_CRM_COLOR,
                      borderColor: '#ffffff',
                      borderWidth: { top: 0, bottom: 2, left: 0, right: 0 },
                      borderSkipped: false,
                      borderRadius: { topLeft: 4, topRight: 4 },
                      stack: 'omzet',
                      maxBarThickness: 28,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  interaction: { mode: 'index', intersect: false },
                  plugins: {
                    legend: { position: 'top', align: 'end', labels: { boxWidth: 12, boxHeight: 12, color: '#475569' } },
                    tooltip: {
                      callbacks: {
                        label: (ctx) => ` ${ctx.dataset.label}: ${formatCurrency(Number(ctx.raw))}`,
                        footer: (items) => {
                          const point = data.trend[items[0]?.dataIndex ?? 0];
                          const total = point.crm_omzet + point.non_crm_omzet;
                          return total > 0 ? `Porsi CRM: ${formatPercent(point.crm_omzet / total)}` : '';
                        },
                      },
                    },
                  },
                  scales: {
                    x: { stacked: true, grid: { display: false }, ticks: { color: '#64748b', autoSkip: true, maxRotation: 0 } },
                    y: {
                      stacked: true,
                      grid: { color: '#f1f5f9' },
                      border: { display: false },
                      ticks: { color: '#64748b', callback: (value) => formatCompactRupiah(Number(value)) },
                    },
                  },
                }}
              />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
              <div className="border-b border-slate-100 bg-slate-50 p-5">
                <h3 className="font-bold text-slate-800">Leaderboard Agen CRM · {periodLabel}</h3>
              </div>
              <div className="max-h-[420px] overflow-auto">
                <table className="w-full min-w-[640px] border-collapse text-left">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-slate-200">
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">#</th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Agen</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Omzet</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Transaksi</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Customer</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Rata-rata Order</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.leaderboard.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-10 text-center text-sm text-slate-400">
                          Belum ada transaksi CRM di periode ini.
                        </td>
                      </tr>
                    ) : (
                      data.leaderboard.map((row, index) => (
                        <tr key={row.name} className="hover:bg-slate-50">
                          <td className="px-4 py-3 text-sm font-medium text-slate-400">{index + 1}</td>
                          <td className="px-4 py-3 text-sm font-semibold text-slate-700">{row.name}</td>
                          <td className="px-4 py-3 text-right text-sm font-medium text-slate-700" title={formatCurrency(row.omzet)}>
                            {formatCompactRupiah(row.omzet)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-slate-600">{formatNumber(row.transaksi)}</td>
                          <td className="px-4 py-3 text-right text-sm text-slate-600">{formatNumber(row.customers)}</td>
                          <td className="px-4 py-3 text-right text-sm text-slate-600">{formatCurrency(row.rata_rata_order)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
              <div className="border-b border-slate-100 bg-slate-50 p-5">
                <h3 className="font-bold text-slate-800">Distribusi Repeat Order</h3>
                <p className="mt-1 text-xs text-slate-500">Jumlah transaksi per customer sejak 2023 · {formatNumber(roTotal)} customer</p>
              </div>
              <div className="space-y-3 p-5">
                {data.ro_distribution.map((item) => (
                  <div key={item.label} title={`${formatNumber(item.customers)} customer`}>
                    <div className="mb-1 flex items-baseline justify-between text-sm">
                      <span className="font-medium text-slate-700">Beli {item.label}</span>
                      <span className="text-slate-500">
                        {formatNumber(item.customers)}{' '}
                        <span className="text-xs text-slate-400">({formatPercent(roTotal > 0 ? item.customers / roTotal : 0)})</span>
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100">
                      <div
                        className="h-2 rounded-full"
                        style={{ width: `${Math.max(1, (item.customers / roMax) * 100)}%`, backgroundColor: CRM_COLOR }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-4 flex-wrap border-b border-slate-100 bg-slate-50 p-5">
              <div>
                <h3 className="font-bold text-slate-800">Harus Di-follow Up</h3>
                <p className="mt-1 text-xs text-slate-500">Dihitung dari hari ini · diurutkan dari total belanja terbesar · maksimal 50 customer</p>
              </div>
              <select value={agent} onChange={(event) => setAgent(event.target.value)} className={selectClassName} aria-label="Agen CRM">
                <option value="">Semua Agen</option>
                {data.agents.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-1 overflow-x-auto border-b border-slate-100 px-5 pt-3">
              {(
                [
                  { key: 'due', label: `Waktunya Beli Lagi (${data.follow_up.due_min_days}–${data.follow_up.due_max_days} hari)`, total: data.follow_up.due.total },
                  { key: 'dormant', label: `Dorman Pernah RO (>${data.follow_up.dormant_days} hari)`, total: data.follow_up.dormant.total },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setFollowUpTab(tab.key)}
                  className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${
                    followUpTab === tab.key ? 'border-slate-800 text-slate-800' : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  {tab.label}
                  <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{formatNumber(tab.total)}</span>
                </button>
              ))}
            </div>

            <div className="max-h-[560px] overflow-auto">
              <table className="w-full min-w-[760px] text-left">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-slate-200">
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Customer</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Agen</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Beli Terakhir</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Transaksi</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Total Belanja</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Hubungi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {!followUp || followUp.rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-sm text-slate-400">
                        Tidak ada customer untuk di-follow up.
                      </td>
                    </tr>
                  ) : (
                    followUp.rows.map((row) => (
                      <tr key={row.phone} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <p className="text-sm font-semibold text-slate-700">{row.name ?? '-'}</p>
                          <p className="text-xs text-slate-400">
                            <span className="font-mono">{row.phone}</span>
                            {row.city ? ` · ${row.city}` : ''}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">{row.agent ?? '-'}</td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-slate-600">{formatDate(row.last_order_at)}</p>
                          <p className="text-xs text-slate-400">{formatNumber(row.days_since_last_order)} hari lalu</p>
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-slate-600">{formatNumber(row.total_transaksi)}x</td>
                        <td className="px-4 py-3 text-right text-sm font-medium text-slate-700">{formatCurrency(row.total_belanja)}</td>
                        <td className="px-4 py-3">
                          <a
                            href={`https://wa.me/${row.phone}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
                          >
                            <MessageCircle size={14} />
                            WhatsApp
                          </a>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
