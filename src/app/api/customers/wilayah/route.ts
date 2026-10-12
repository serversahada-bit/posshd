import { NextRequest } from 'next/server';
import { getDatasluCustomers, matchesRoFilter } from '@/lib/dataslu';
import { requireCrmAccess } from '@/lib/crmAccess';

export const dynamic = 'force-dynamic';

const ACTIVE_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

// GET /api/customers/wilayah — ringkasan customer per provinsi dari dataslu.
export async function GET(request: NextRequest) {
  try {
    const denied = await requireCrmAccess();
    if (denied) return denied;

    const ro = request.nextUrl.searchParams.get('ro') ?? '';
    const customers = await getDatasluCustomers();
    const now = Date.now();

    const byProvince = new Map<string, { customers: number; ro_customers: number; active_customers: number; total_belanja: number }>();
    let totalCustomers = 0;

    for (const customer of customers) {
      if (!matchesRoFilter(customer.lifetimeTransaksi, ro)) continue;
      const key = customer.province ?? 'unknown';
      const stats = byProvince.get(key) ?? { customers: 0, ro_customers: 0, active_customers: 0, total_belanja: 0 };
      stats.customers += 1;
      if (customer.lifetimeTransaksi > 1) stats.ro_customers += 1;
      if (now - customer.lastSeenAt <= ACTIVE_DAYS * DAY_MS) stats.active_customers += 1;
      stats.total_belanja += customer.lifetimeBelanja;
      byProvince.set(key, stats);
      totalCustomers += 1;
    }

    const provinces = Array.from(byProvince, ([key, stats]) => ({
      key,
      name: key === 'unknown' ? 'Tidak diketahui' : key,
      ...stats,
    })).sort((a, b) => (a.key === 'unknown' ? 1 : b.key === 'unknown' ? -1 : b.customers - a.customers));

    return Response.json({
      success: true,
      data: { active_days: ACTIVE_DAYS, total_customers: totalCustomers, provinces },
    });
  } catch (error) {
    console.error('[API /customers/wilayah GET]', error);
    return Response.json({ success: false, message: 'Gagal mengambil data wilayah customer' }, { status: 500 });
  }
}
