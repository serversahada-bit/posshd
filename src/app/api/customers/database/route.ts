import { NextRequest } from 'next/server';
import {
  PROVINCES,
  createCustomerSearch,
  getDatasluCustomers,
  matchesProvinceFilter,
  matchesRoFilter,
  resolvePeriods,
  sumPeriodStats,
} from '@/lib/dataslu';
import { requireCrmAccess } from '@/lib/crmAccess';

export const dynamic = 'force-dynamic';

// GET /api/customers/database — database customer dari dataslu.data_transaksi (bukan database POS)
export async function GET(request: NextRequest) {
  try {
    const denied = await requireCrmAccess();
    if (denied) return denied;

    const { searchParams } = request.nextUrl;
    const year = Number(searchParams.get('year')) || 0;
    const month = Number(searchParams.get('month')) || 0;
    const province = searchParams.get('province') ?? '';
    const ro = searchParams.get('ro') ?? '';
    const page = Math.max(1, Number(searchParams.get('page')) || 1);
    const limit = 20;
    const matchesSearch = createCustomerSearch(searchParams.get('search') ?? '');

    const { years, periods } = resolvePeriods(year, month);

    const allCustomers = await getDatasluCustomers();
    const customers = [];

    for (const customer of allCustomers) {
      if (!matchesProvinceFilter(customer.province, province) || !matchesSearch(customer)) continue;

      const stats = sumPeriodStats(customer, periods);
      // Filter RO mengikuti jumlah transaksi pada periode yang dipilih (sama dengan kolom Transaksi).
      if (!stats || !matchesRoFilter(stats.total_transaksi, ro)) continue;

      customers.push({ customer, stats });
    }

    customers.sort((a, b) => b.stats.last_order_at - a.stats.last_order_at);

    const totalRows = customers.length;
    const pageRows = customers.slice((page - 1) * limit, page * limit);

    return Response.json({
      success: true,
      data: {
        customers: pageRows.map(({ customer, stats }) => ({
          id: customer.phone,
          name: customer.name,
          whatsapp_number: customer.phone,
          address: customer.address,
          city: customer.city,
          province: customer.province,
          total_transaksi: stats.total_transaksi,
          total_belanja: stats.total_belanja,
          first_order_at: new Date(stats.first_order_at).toISOString(),
          last_order_at: new Date(stats.last_order_at).toISOString(),
        })),
        years,
        provinces: PROVINCES,
        pagination: {
          page,
          limit,
          totalRows,
          totalPages: Math.max(1, Math.ceil(totalRows / limit)),
        },
      },
    });
  } catch (error) {
    console.error('[API /customers/database GET]', error);
    return Response.json({ success: false, message: 'Gagal mengambil database customer dari dataslu' }, { status: 500 });
  }
}
