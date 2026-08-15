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
import { Loader2 } from 'lucide-react';
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

  useEffect(() => {
    fetchDashboard(range.start, range.end);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    </section>
  );
}
