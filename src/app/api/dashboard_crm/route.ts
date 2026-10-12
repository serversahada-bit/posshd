import { NextRequest } from 'next/server';
import { getDatasluSnapshot, resolvePeriods, sumPeriodStats, type DatasluCustomer } from '@/lib/dataslu';
import { requireCrmAccess } from '@/lib/crmAccess';

export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 60 * 60 * 1000;
// Patokan "waktunya beli lagi": pembelian terakhir 25–40 hari lalu.
const DUE_MIN_DAYS = 25;
const DUE_MAX_DAYS = 40;
const DORMANT_DAYS = 90;
const FOLLOW_UP_LIMIT = 50;

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const RO_BUCKETS = [
  { label: '1x', min: 1, max: 1 },
  { label: '2x', min: 2, max: 2 },
  { label: '3x', min: 3, max: 3 },
  { label: '4x', min: 4, max: 4 },
  { label: '5–9x', min: 5, max: 9 },
  { label: '10x+', min: 10, max: Infinity },
];

const toFollowUpRow = (customer: DatasluCustomer, now: number) => ({
  phone: customer.phone,
  name: customer.name,
  city: customer.city,
  agent: customer.agent,
  last_order_at: new Date(customer.lastSeenAt).toISOString(),
  days_since_last_order: Math.floor((now - customer.lastSeenAt) / DAY_MS),
  total_transaksi: customer.lifetimeTransaksi,
  total_belanja: customer.lifetimeBelanja,
});

// GET /api/dashboard_crm — ringkasan CRM dari dataslu.data_transaksi
// Transaksi CRM = kolom adv berawalan "CRM".
export async function GET(request: NextRequest) {
  try {
    const denied = await requireCrmAccess();
    if (denied) return denied;

    const { searchParams } = request.nextUrl;
    const year = Number(searchParams.get('year')) || 0;
    const month = Number(searchParams.get('month')) || 0;
    const agentFilter = (searchParams.get('agent') ?? '').trim();

    const snapshot = await getDatasluSnapshot();
    const { years, periods } = resolvePeriods(year, month);
    const now = Date.now();

    // Ringkasan omzet periode terpilih
    let crmOmzet = 0;
    let crmTransaksi = 0;
    let totalOmzet = 0;
    for (const period of periods) {
      const totals = snapshot.monthTotals.get(period);
      if (!totals) continue;
      crmOmzet += totals.crmOmzet;
      crmTransaksi += totals.crmTransaksi;
      totalOmzet += totals.crmOmzet + totals.nonCrmOmzet;
    }

    // Customer baru vs repeat order pada periode terpilih, status aktif/dorman, dan distribusi RO
    let periodCustomers = 0;
    let repeatCustomers = 0;
    let activeCustomers = 0;
    let dormantCustomers = 0;
    const roCounts = RO_BUCKETS.map(() => 0);
    const agentNames = new Set<string>();
    const due: DatasluCustomer[] = [];
    const dormant: DatasluCustomer[] = [];

    for (const customer of snapshot.customers) {
      const stats = sumPeriodStats(customer, periods);
      if (stats) {
        periodCustomers += 1;
        // Repeat = sudah pernah beli sebelum periode ini, atau beli lebih dari sekali di periode ini.
        if (customer.firstSeenAt < stats.first_order_at || stats.total_transaksi > 1) repeatCustomers += 1;
      }

      const daysSince = (now - customer.lastSeenAt) / DAY_MS;
      if (daysSince > DORMANT_DAYS) dormantCustomers += 1;
      else activeCustomers += 1;

      const bucket = RO_BUCKETS.findIndex((b) => customer.lifetimeTransaksi >= b.min && customer.lifetimeTransaksi <= b.max);
      if (bucket >= 0) roCounts[bucket] += 1;

      if (customer.agent) agentNames.add(customer.agent);
      if (agentFilter && customer.agent !== agentFilter) continue;

      if (daysSince >= DUE_MIN_DAYS && daysSince <= DUE_MAX_DAYS) due.push(customer);
      // Dorman bernilai tinggi: sudah pernah repeat order tapi berhenti beli.
      else if (daysSince > DORMANT_DAYS && customer.lifetimeTransaksi >= 2) dormant.push(customer);
    }

    due.sort((a, b) => b.lifetimeBelanja - a.lifetimeBelanja);
    dormant.sort((a, b) => b.lifetimeBelanja - a.lifetimeBelanja);

    // Leaderboard agen CRM pada periode terpilih
    const agentTotals = new Map<string, { transaksi: number; omzet: number; phones: Set<string> }>();
    for (const period of periods) {
      const agents = snapshot.agentMonths.get(period);
      if (!agents) continue;
      for (const [name, stats] of agents) {
        let total = agentTotals.get(name);
        if (!total) {
          total = { transaksi: 0, omzet: 0, phones: new Set() };
          agentTotals.set(name, total);
        }
        total.transaksi += stats.transaksi;
        total.omzet += stats.omzet;
        for (const phone of stats.phones) total.phones.add(phone);
      }
    }
    const leaderboard = Array.from(agentTotals, ([name, stats]) => ({
      name,
      transaksi: stats.transaksi,
      omzet: stats.omzet,
      customers: stats.phones.size,
      rata_rata_order: stats.transaksi > 0 ? Math.round(stats.omzet / stats.transaksi) : 0,
    })).sort((a, b) => b.omzet - a.omzet);

    // Tren bulanan: tahun terpilih, atau semua tahun; bulan yang belum terjadi tidak ditampilkan.
    const currentPeriod = new Date().getFullYear() * 100 + new Date().getMonth() + 1;
    const trendYears = years.includes(year) ? [year] : [...years].reverse();
    const trend = trendYears
      .flatMap((y) => Array.from({ length: 12 }, (_, i) => y * 100 + i + 1))
      .filter((period) => period <= currentPeriod)
      .map((period) => {
        const totals = snapshot.monthTotals.get(period);
        return {
          period,
          label: `${MONTH_LABELS[(period % 100) - 1]} ${Math.floor(period / 100)}`,
          crm_omzet: totals?.crmOmzet ?? 0,
          non_crm_omzet: totals?.nonCrmOmzet ?? 0,
        };
      });

    return Response.json({
      success: true,
      data: {
        years,
        agents: Array.from(agentNames).sort((a, b) => a.localeCompare(b)),
        loaded_at: new Date(snapshot.loadedAt).toISOString(),
        summary: {
          crm_omzet: crmOmzet,
          crm_transaksi: crmTransaksi,
          total_omzet: totalOmzet,
          crm_share: totalOmzet > 0 ? crmOmzet / totalOmzet : 0,
          period_customers: periodCustomers,
          repeat_customers: repeatCustomers,
          new_customers: periodCustomers - repeatCustomers,
          repeat_rate: periodCustomers > 0 ? repeatCustomers / periodCustomers : 0,
          active_customers: activeCustomers,
          dormant_customers: dormantCustomers,
        },
        trend,
        leaderboard,
        ro_distribution: RO_BUCKETS.map((bucket, i) => ({ label: bucket.label, customers: roCounts[i] })),
        follow_up: {
          due_min_days: DUE_MIN_DAYS,
          due_max_days: DUE_MAX_DAYS,
          dormant_days: DORMANT_DAYS,
          due: { total: due.length, rows: due.slice(0, FOLLOW_UP_LIMIT).map((c) => toFollowUpRow(c, now)) },
          dormant: { total: dormant.length, rows: dormant.slice(0, FOLLOW_UP_LIMIT).map((c) => toFollowUpRow(c, now)) },
        },
      },
    });
  } catch (error) {
    console.error('[API /dashboard_crm GET]', error);
    return Response.json({ success: false, message: 'Gagal mengambil data dashboard CRM' }, { status: 500 });
  }
}
