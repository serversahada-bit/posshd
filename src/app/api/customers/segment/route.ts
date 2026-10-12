import { NextRequest } from 'next/server';
import {
  PROVINCES,
  createCustomerSearch,
  getDatasluCustomers,
  matchesProvinceFilter,
  matchesRoFilter,
  resolvePeriods,
  type DatasluCustomer,
} from '@/lib/dataslu';
import { requireCrmAccess } from '@/lib/crmAccess';

export const dynamic = 'force-dynamic';

const LIMIT = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

const SORTERS: Record<string, (a: DatasluCustomer, b: DatasluCustomer) => number> = {
  belanja: (a, b) => b.lifetimeBelanja - a.lifetimeBelanja,
  first: (a, b) => b.firstSeenAt - a.firstSeenAt,
  last: (a, b) => b.lastSeenAt - a.lastSeenAt,
};

const matchesYearMonth = (timestamp: number, year: number, month: number) => {
  const date = new Date(timestamp);
  return (!year || date.getFullYear() === year) && (!month || date.getMonth() + 1 === month);
};

// GET /api/customers/segment — daftar customer dari dataslu dengan filter pembelian pertama/terakhir, provinsi, dan RO.
// Jumlah transaksi & total belanja dihitung sepanjang data (sejak 2023).
export async function GET(request: NextRequest) {
  try {
    const denied = await requireCrmAccess();
    if (denied) return denied;

    const { searchParams } = request.nextUrl;
    const firstYear = Number(searchParams.get('first_year')) || 0;
    const firstMonth = Number(searchParams.get('first_month')) || 0;
    const lastYear = Number(searchParams.get('last_year')) || 0;
    const lastMonth = Number(searchParams.get('last_month')) || 0;
    const province = searchParams.get('province') ?? '';
    const ro = searchParams.get('ro') ?? '';
    const sort = SORTERS[searchParams.get('sort') ?? ''] ? (searchParams.get('sort') as string) : 'belanja';
    const page = Math.max(1, Number(searchParams.get('page')) || 1);
    const matchesSearch = createCustomerSearch(searchParams.get('search') ?? '');

    const allCustomers = await getDatasluCustomers();
    const now = Date.now();

    const customers = allCustomers
      .filter(
        (customer) =>
          matchesYearMonth(customer.firstSeenAt, firstYear, firstMonth) &&
          matchesYearMonth(customer.lastSeenAt, lastYear, lastMonth) &&
          matchesProvinceFilter(customer.province, province) &&
          matchesRoFilter(customer.lifetimeTransaksi, ro) &&
          matchesSearch(customer),
      )
      .sort(SORTERS[sort]);

    return Response.json({
      success: true,
      data: {
        years: resolvePeriods(0, 0).years,
        provinces: PROVINCES,
        customers: customers.slice((page - 1) * LIMIT, page * LIMIT).map((customer) => ({
          phone: customer.phone,
          name: customer.name,
          address: customer.address,
          city: customer.city,
          province: customer.province,
          agent: customer.agent,
          total_transaksi: customer.lifetimeTransaksi,
          total_belanja: customer.lifetimeBelanja,
          first_order_at: new Date(customer.firstSeenAt).toISOString(),
          last_order_at: new Date(customer.lastSeenAt).toISOString(),
          days_since_last_order: Math.floor((now - customer.lastSeenAt) / DAY_MS),
        })),
        summary: {
          customers: customers.length,
          ro_customers: customers.filter((customer) => customer.lifetimeTransaksi > 1).length,
          total_belanja: customers.reduce((sum, customer) => sum + customer.lifetimeBelanja, 0),
        },
        pagination: {
          page,
          limit: LIMIT,
          totalRows: customers.length,
          totalPages: Math.max(1, Math.ceil(customers.length / LIMIT)),
        },
      },
    });
  } catch (error) {
    console.error('[API /customers/segment GET]', error);
    return Response.json({ success: false, message: 'Gagal mengambil data customer' }, { status: 500 });
  }
}
