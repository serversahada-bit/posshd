'use client';

import { useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  BarController,
  LineController,
  Tooltip,
  Legend,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import { Loader2, Save } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, formatShortDate } from '@/lib/utils';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  BarController,
  LineController,
  Tooltip,
  Legend
);

interface StatusBreakdownEntry {
  status: string;
  revenue: number;
  count: number;
}

interface DashboardData {
  startDate: string;
  endDate: string;
  grossRevenue: number;
  totalCount: number;
  allOrders: { revenue: number; count: number };
  statusBreakdown: StatusBreakdownEntry[];
  dailyTrend: { date: string; revenue: number; count: number }[];
}

type TeamTotals = {
  orderCount: number;
  addressClosing: number;
  box: number;
  crossSell: number;
  upsell: number;
};

type ProductMetric = TeamTotals & { productKey: string; productName: string };
type ChannelMetric = { channel: string; orderCount: number };
type CrmTotals = TeamTotals & { dataMasuk: number; closingRatePercent: number | null };

type PeriodBucket = {
  periodKey: string;
  periodLabel: string;
  cso: TeamTotals;
  crm: CrmTotals;
  total: TeamTotals;
};

type TeamRecapData = {
  startDate: string;
  endDate: string;
  groupBy: 'day' | 'week' | 'month';
  cso: {
    byProduct: ProductMetric[];
    totalAllProduct: TeamTotals;
    leadByChannel: ChannelMetric[];
  };
  crm: {
    byProduct: ProductMetric[];
    totalAllProduct: CrmTotals;
    dataMasukEntries: { date: string; totalData: number }[];
  };
  combinedTotal: TeamTotals;
  periodRecap: PeriodBucket[];
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: '#f59e0b' },
  paid: { label: 'Dibayar', color: '#3b82f6' },
  processing: { label: 'Diproses', color: '#8b5cf6' },
  ready_to_ship: { label: 'Siap Kirim', color: '#06b6d4' },
  shipped: { label: 'Dikirim', color: '#0ea5e9' },
  completed: { label: 'Selesai', color: '#22c55e' },
  cancelled: { label: 'Dibatalkan', color: '#94a3b8' },
  rts: { label: 'Retur (RTS)', color: '#ef4444' },
  problem: { label: 'Bermasalah', color: '#dc2626' },
};

const GROUP_BY_OPTIONS: { value: 'day' | 'week' | 'month'; label: string }[] = [
  { value: 'day', label: 'Harian' },
  { value: 'week', label: 'Mingguan' },
  { value: 'month', label: 'Bulanan' },
];

function ProductMetricsTable({
  title,
  orderLabel,
  rows,
  total,
  loading,
}: {
  title: string;
  orderLabel: string;
  rows: ProductMetric[];
  total: TeamTotals;
  loading: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
      <div className="p-5 border-b border-slate-100 bg-slate-50">
        <h3 className="font-bold text-slate-800">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/50">
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Produk</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 text-right">{orderLabel}</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 text-right">Alamat Closing</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 text-right">Box Tercapai</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 text-right">Cross Selling</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 text-right">Upselling</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-sm text-slate-400">Memuat data...</td>
              </tr>
            ) : !rows.length ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-slate-400">Belum ada data pada rentang ini.</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.productKey} className="transition-colors hover:bg-slate-50/50">
                  <td className="px-4 py-2.5 text-sm font-medium text-slate-700">{row.productName}</td>
                  <td className="px-4 py-2.5 text-sm text-right text-slate-600">{row.orderCount.toLocaleString('id-ID')}</td>
                  <td className="px-4 py-2.5 text-sm text-right text-emerald-600">{row.addressClosing.toLocaleString('id-ID')}</td>
                  <td className="px-4 py-2.5 text-sm text-right text-sky-600 font-semibold">{row.box.toLocaleString('id-ID')}</td>
                  <td className="px-4 py-2.5 text-sm text-right text-purple-600">{row.crossSell.toLocaleString('id-ID')}</td>
                  <td className="px-4 py-2.5 text-sm text-right text-orange-600">{row.upsell.toLocaleString('id-ID')}</td>
                </tr>
              ))
            )}
          </tbody>
          {Boolean(rows.length) && (
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50/70 font-bold">
                <td className="px-4 py-3 text-sm text-slate-800">All Produk</td>
                <td className="px-4 py-3 text-sm text-right text-slate-800">{total.orderCount.toLocaleString('id-ID')}</td>
                <td className="px-4 py-3 text-sm text-right text-emerald-700">{total.addressClosing.toLocaleString('id-ID')}</td>
                <td className="px-4 py-3 text-sm text-right text-sky-700">{total.box.toLocaleString('id-ID')}</td>
                <td className="px-4 py-3 text-sm text-right text-purple-700">{total.crossSell.toLocaleString('id-ID')}</td>
                <td className="px-4 py-3 text-sm text-right text-orange-700">{total.upsell.toLocaleString('id-ID')}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultRange(): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 29);
  return { start: toDateInputValue(start), end: toDateInputValue(end) };
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(defaultRange);

  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day');
  const [teamRecap, setTeamRecap] = useState<TeamRecapData | null>(null);
  const [teamRecapLoading, setTeamRecapLoading] = useState(true);
  const [crDrafts, setCrDrafts] = useState<Record<string, string>>({});
  const [savingCrDate, setSavingCrDate] = useState<string | null>(null);

  const fetchDashboard = async (start: string, end: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard?start_date=${start}&end_date=${end}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchTeamRecap = async (start: string, end: string, group: 'day' | 'week' | 'month') => {
    setTeamRecapLoading(true);
    try {
      const res = await fetch(`/api/dashboard/team_recap?start_date=${start}&end_date=${end}&group_by=${group}`);
      const json = await res.json();
      if (json.success) {
        setTeamRecap(json.data);
        setCrDrafts(Object.fromEntries(json.data.crm.dataMasukEntries.map((e: { date: string; totalData: number }) => [e.date, String(e.totalData)])));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTeamRecapLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard(range.start, range.end);
    fetchTeamRecap(range.start, range.end, groupBy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGroupByChange = (group: 'day' | 'week' | 'month') => {
    setGroupBy(group);
    fetchTeamRecap(range.start, range.end, group);
  };

  const saveCrInput = async (date: string) => {
    const value = Number(crDrafts[date]);
    if (!Number.isFinite(value) || value < 0) return;
    setSavingCrDate(date);
    try {
      const res = await fetch('/api/dashboard/crm_cr_input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, totalData: value }),
      });
      const json = await res.json();
      if (json.success) {
        await fetchTeamRecap(range.start, range.end, groupBy);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSavingCrDate(null);
    }
  };

  const trendChartData = {
    labels: (data?.dailyTrend || []).map((d) => formatShortDate(d.date)),
    datasets: [
      {
        type: 'bar' as const,
        label: 'Pendapatan',
        data: (data?.dailyTrend || []).map((d) => d.revenue),
        backgroundColor: '#0ea5e9',
        borderRadius: 4,
        yAxisID: 'yRevenue',
      },
      {
        type: 'line' as const,
        label: 'Jumlah Pesanan',
        data: (data?.dailyTrend || []).map((d) => d.count),
        borderColor: '#f97316',
        backgroundColor: '#f97316',
        tension: 0.35,
        pointRadius: 2,
        yAxisID: 'yCount',
      },
    ],
  };

  const gridCards = [
    { status: 'all', label: 'All Orders', revenue: data?.allOrders.revenue ?? 0, count: data?.allOrders.count ?? 0, color: '#334155' },
    ...(data?.statusBreakdown || []).map((s) => ({
      status: s.status,
      label: STATUS_META[s.status]?.label || s.status,
      revenue: s.revenue,
      count: s.count,
      color: STATUS_META[s.status]?.color || '#94a3b8',
    })),
  ];

  return (
    <section className="dashboard-layout">
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-bold text-slate-800">Halo, {user?.name || 'User'} 👋</h1>
      </div>

      <form
        className="flex flex-wrap items-end gap-4 mt-4"
        onSubmit={(event) => {
          event.preventDefault();
          fetchDashboard(range.start, range.end);
          fetchTeamRecap(range.start, range.end, groupBy);
        }}
      >
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">Tanggal Mulai</label>
          <input
            type="date"
            value={range.start}
            max={range.end}
            onChange={(event) => setRange((r) => ({ ...r, start: event.target.value }))}
            className="border border-slate-300 rounded-lg px-4 py-2 focus:ring-1 focus:ring-blue-500 outline-none text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">Tanggal Akhir</label>
          <input
            type="date"
            value={range.end}
            min={range.start}
            onChange={(event) => setRange((r) => ({ ...r, end: event.target.value }))}
            className="border border-slate-300 rounded-lg px-4 py-2 focus:ring-1 focus:ring-blue-500 outline-none text-sm"
          />
        </div>
        <button
          type="submit"
          className="bg-slate-800 hover:bg-slate-900 text-white px-5 py-2 rounded-lg text-sm font-bold transition-all duration-200 shadow-sm hover:shadow-md active:scale-95"
        >
          Terapkan
        </button>
        {loading && <Loader2 size={18} className="animate-spin text-slate-400" />}
      </form>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mt-6">
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
          <div className="flex flex-col gap-4">
            <div className="rounded-xl bg-sky-500 text-white p-5">
              <p className="text-sm font-medium opacity-90">Estimasi Pendapatan</p>
              <p className="text-2xl font-extrabold mt-1">{formatCurrency(data?.grossRevenue ?? 0)}</p>
            </div>
            <div className="rounded-xl bg-orange-500 text-white p-5">
              <p className="text-sm font-medium opacity-90">Total Pesanan</p>
              <p className="text-2xl font-extrabold mt-1">{(data?.totalCount ?? 0).toLocaleString('id-ID')}</p>
            </div>
          </div>

          <div style={{ height: '280px' }}>
            <Chart
              type="bar"
              data={trendChartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } },
                scales: {
                  yRevenue: {
                    type: 'linear',
                    position: 'left',
                    ticks: { callback: (value) => formatCurrency(Number(value)) },
                  },
                  yCount: {
                    type: 'linear',
                    position: 'right',
                    grid: { drawOnChartArea: false },
                    ticks: { precision: 0 },
                  },
                },
              }}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
        {gridCards.map((card) => (
          <div
            key={card.status}
            className="bg-white rounded-xl border border-slate-200 shadow-sm p-4"
            style={{ borderLeft: `4px solid ${card.color}` }}
          >
            <p className="text-xs font-semibold text-slate-500">{card.label}</p>
            <p className="text-base font-bold text-slate-800 mt-1">{formatCurrency(card.revenue)}</p>
            <p className="text-sm font-semibold text-slate-500 mt-1">{card.count.toLocaleString('id-ID')}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between border-b border-slate-200 pb-4 mt-10">
        <h2 className="text-xl font-bold text-slate-800">Capaian Tim CSO &amp; CRM</h2>
        <div className="flex items-center gap-2">
          {teamRecapLoading && <Loader2 size={16} className="animate-spin text-slate-400" />}
          <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden">
            {GROUP_BY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleGroupByChange(opt.value)}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                  groupBy === opt.value ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-6 mt-6">
        <ProductMetricsTable
          title="Capaian Tim CSO — Per Produk"
          orderLabel="Lead"
          rows={teamRecap?.cso.byProduct ?? []}
          total={teamRecap?.cso.totalAllProduct ?? { orderCount: 0, addressClosing: 0, box: 0, crossSell: 0, upsell: 0 }}
          loading={teamRecapLoading}
        />

        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden h-fit">
          <div className="p-5 border-b border-slate-100 bg-slate-50">
            <h3 className="font-bold text-slate-800">Lead per Channel</h3>
          </div>
          <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
            {teamRecapLoading ? (
              <p className="px-5 py-8 text-center text-sm text-slate-400">Memuat data...</p>
            ) : !teamRecap?.cso.leadByChannel.length ? (
              <p className="px-5 py-8 text-center text-sm text-slate-400">Belum ada lead pada rentang ini.</p>
            ) : (
              teamRecap.cso.leadByChannel.map((c) => (
                <div key={c.channel} className="flex items-center justify-between px-5 py-2.5">
                  <span className="text-sm font-medium text-slate-700">{c.channel}</span>
                  <span className="rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-600">
                    {c.orderCount.toLocaleString('id-ID')}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-6 mt-6">
        <ProductMetricsTable
          title="Capaian Tim CRM — Per Produk"
          orderLabel="Order Masuk"
          rows={teamRecap?.crm.byProduct ?? []}
          total={teamRecap?.crm.totalAllProduct ?? { orderCount: 0, addressClosing: 0, box: 0, crossSell: 0, upsell: 0 }}
          loading={teamRecapLoading}
        />

        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden h-fit">
          <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <h3 className="font-bold text-slate-800">Data Masuk CRM (Pembagi CR)</h3>
          </div>
          <div className="px-5 py-4 border-b border-slate-100 bg-emerald-50/60">
            <p className="text-xs font-semibold text-emerald-700">Closing Rate (CR)</p>
            <p className="text-xl font-extrabold text-emerald-700 mt-0.5">
              {teamRecap?.crm.totalAllProduct.closingRatePercent != null
                ? `${teamRecap.crm.totalAllProduct.closingRatePercent.toFixed(1)}%`
                : '-'}
            </p>
            <p className="text-[11px] text-emerald-700/70 mt-0.5">
              Alamat Closing ({teamRecap?.crm.totalAllProduct.addressClosing ?? 0}) / Data Masuk ({teamRecap?.crm.totalAllProduct.dataMasuk ?? 0})
            </p>
          </div>
          <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
            {(teamRecap?.crm.dataMasukEntries ?? []).map((entry) => (
              <div key={entry.date} className="flex items-center justify-between gap-2 px-5 py-2">
                <span className="text-xs font-medium text-slate-600">{formatShortDate(entry.date)}</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    value={crDrafts[entry.date] ?? ''}
                    onChange={(event) =>
                      setCrDrafts((prev) => ({ ...prev, [entry.date]: event.target.value }))
                    }
                    className="w-20 border border-slate-300 rounded-md px-2 py-1 text-xs text-right outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    disabled={savingCrDate === entry.date}
                    onClick={() => saveCrInput(entry.date)}
                    className="p-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                    title="Simpan"
                  >
                    {savingCrDate === entry.date ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Save size={12} />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden mt-6">
        <div className="p-5 border-b border-slate-100 bg-slate-50">
          <h3 className="font-bold text-slate-800">Rekap Total CSO &amp; CRM</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/50">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Tim</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 text-right">Order</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 text-right">Alamat Closing</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 text-right">Box Tercapai</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 text-right">Cross Selling</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 text-right">Upselling</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="px-4 py-2.5 text-sm font-medium text-slate-700">CSO</td>
                <td className="px-4 py-2.5 text-sm text-right text-slate-600">{(teamRecap?.cso.totalAllProduct.orderCount ?? 0).toLocaleString('id-ID')}</td>
                <td className="px-4 py-2.5 text-sm text-right text-emerald-600">{(teamRecap?.cso.totalAllProduct.addressClosing ?? 0).toLocaleString('id-ID')}</td>
                <td className="px-4 py-2.5 text-sm text-right text-sky-600 font-semibold">{(teamRecap?.cso.totalAllProduct.box ?? 0).toLocaleString('id-ID')}</td>
                <td className="px-4 py-2.5 text-sm text-right text-purple-600">{(teamRecap?.cso.totalAllProduct.crossSell ?? 0).toLocaleString('id-ID')}</td>
                <td className="px-4 py-2.5 text-sm text-right text-orange-600">{(teamRecap?.cso.totalAllProduct.upsell ?? 0).toLocaleString('id-ID')}</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 text-sm font-medium text-slate-700">CRM</td>
                <td className="px-4 py-2.5 text-sm text-right text-slate-600">{(teamRecap?.crm.totalAllProduct.orderCount ?? 0).toLocaleString('id-ID')}</td>
                <td className="px-4 py-2.5 text-sm text-right text-emerald-600">{(teamRecap?.crm.totalAllProduct.addressClosing ?? 0).toLocaleString('id-ID')}</td>
                <td className="px-4 py-2.5 text-sm text-right text-sky-600 font-semibold">{(teamRecap?.crm.totalAllProduct.box ?? 0).toLocaleString('id-ID')}</td>
                <td className="px-4 py-2.5 text-sm text-right text-purple-600">{(teamRecap?.crm.totalAllProduct.crossSell ?? 0).toLocaleString('id-ID')}</td>
                <td className="px-4 py-2.5 text-sm text-right text-orange-600">{(teamRecap?.crm.totalAllProduct.upsell ?? 0).toLocaleString('id-ID')}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50/70 font-bold">
                <td className="px-4 py-3 text-sm text-slate-800">Total</td>
                <td className="px-4 py-3 text-sm text-right text-slate-800">{(teamRecap?.combinedTotal.orderCount ?? 0).toLocaleString('id-ID')}</td>
                <td className="px-4 py-3 text-sm text-right text-emerald-700">{(teamRecap?.combinedTotal.addressClosing ?? 0).toLocaleString('id-ID')}</td>
                <td className="px-4 py-3 text-sm text-right text-sky-700">{(teamRecap?.combinedTotal.box ?? 0).toLocaleString('id-ID')}</td>
                <td className="px-4 py-3 text-sm text-right text-purple-700">{(teamRecap?.combinedTotal.crossSell ?? 0).toLocaleString('id-ID')}</td>
                <td className="px-4 py-3 text-sm text-right text-orange-700">{(teamRecap?.combinedTotal.upsell ?? 0).toLocaleString('id-ID')}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden mt-6 mb-6">
        <div className="p-5 border-b border-slate-100 bg-slate-50">
          <h3 className="font-bold text-slate-800">Rekap per Periode ({GROUP_BY_OPTIONS.find((o) => o.value === groupBy)?.label})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/50">
                <th rowSpan={2} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 align-bottom">Periode</th>
                <th colSpan={4} className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 text-center border-l border-slate-200">CSO</th>
                <th colSpan={5} className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 text-center border-l border-slate-200">CRM</th>
                <th colSpan={2} className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 text-center border-l border-slate-200">Total</th>
              </tr>
              <tr className="border-b border-slate-200 bg-slate-50/50">
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 text-right border-l border-slate-200">Lead</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 text-right">Closing</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 text-right">Box</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 text-right">Cross/Up</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 text-right border-l border-slate-200">Closing</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 text-right">Box</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 text-right">Cross/Up</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 text-right">Data Masuk</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 text-right">CR%</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 text-right border-l border-slate-200">Closing</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 text-right">Box</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {teamRecapLoading ? (
                <tr>
                  <td colSpan={12} className="py-10 text-center text-sm text-slate-400">Memuat data...</td>
                </tr>
              ) : !teamRecap?.periodRecap.length ? (
                <tr>
                  <td colSpan={12} className="py-10 text-center text-slate-400">Belum ada data pada rentang ini.</td>
                </tr>
              ) : (
                teamRecap.periodRecap.map((bucket) => (
                  <tr key={bucket.periodKey} className="transition-colors hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 text-sm font-medium text-slate-700">{bucket.periodLabel}</td>
                    <td className="px-3 py-2.5 text-xs text-right text-slate-600 border-l border-slate-100">{bucket.cso.orderCount}</td>
                    <td className="px-3 py-2.5 text-xs text-right text-emerald-600">{bucket.cso.addressClosing}</td>
                    <td className="px-3 py-2.5 text-xs text-right text-sky-600">{bucket.cso.box}</td>
                    <td className="px-3 py-2.5 text-xs text-right text-purple-600">{bucket.cso.crossSell}/{bucket.cso.upsell}</td>
                    <td className="px-3 py-2.5 text-xs text-right text-emerald-600 border-l border-slate-100">{bucket.crm.addressClosing}</td>
                    <td className="px-3 py-2.5 text-xs text-right text-sky-600">{bucket.crm.box}</td>
                    <td className="px-3 py-2.5 text-xs text-right text-purple-600">{bucket.crm.crossSell}/{bucket.crm.upsell}</td>
                    <td className="px-3 py-2.5 text-xs text-right text-slate-600">{bucket.crm.dataMasuk}</td>
                    <td className="px-3 py-2.5 text-xs text-right text-emerald-700 font-semibold">
                      {bucket.crm.closingRatePercent != null ? `${bucket.crm.closingRatePercent.toFixed(1)}%` : '-'}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-right text-emerald-700 font-semibold border-l border-slate-100">{bucket.total.addressClosing}</td>
                    <td className="px-3 py-2.5 text-xs text-right text-sky-700 font-semibold">{bucket.total.box}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
