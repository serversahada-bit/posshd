import { NextRequest } from 'next/server';
import { getDatasluSnapshot, normalizePhone, resolvePeriods, type DatasluCustomer } from '@/lib/dataslu';
import { requireCrmAccess } from '@/lib/crmAccess';

export const dynamic = 'force-dynamic';

const LIMIT = 20;

type CohortMember = {
  customer: DatasluCustomer;
  // Jumlah transaksi & belanja per tahun dalam rentang tahun awal–akhir.
  perYear: Map<number, { transaksi: number; belanja: number }>;
  transaksi: number;
  belanja: number;
};

// GET /api/customers/database/matrix — lacak angkatan customer (pertama beli di tahun awal) sampai tahun akhir.
// mode=loyal → beli di SETIAP tahun dari tahun awal sampai tahun akhir tanpa putus.
// mode=akhir → masih beli di tahun akhir (boleh sempat putus).
// Jika tahun awal = tahun akhir, RO berarti beli lebih dari sekali di tahun itu.
export async function GET(request: NextRequest) {
  try {
    const denied = await requireCrmAccess();
    if (denied) return denied;

    const { searchParams } = request.nextUrl;
    const { years } = resolvePeriods(0, 0);
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);

    const start = Math.min(maxYear, Math.max(minYear, Number(searchParams.get('start')) || minYear));
    const end = Math.min(maxYear, Math.max(start, Number(searchParams.get('end')) || maxYear));
    const mode = searchParams.get('mode') === 'akhir' ? 'akhir' : 'loyal';
    const search = (searchParams.get('search') ?? '').trim().toLowerCase();
    const page = Math.max(1, Number(searchParams.get('page')) || 1);

    const rangeYears = Array.from({ length: end - start + 1 }, (_, i) => start + i);

    const { customers } = await getDatasluSnapshot();
    const cohort: CohortMember[] = [];

    for (const customer of customers) {
      if (new Date(customer.firstSeenAt).getFullYear() !== start) continue;

      const perYear = new Map<number, { transaksi: number; belanja: number }>();
      let transaksi = 0;
      let belanja = 0;
      for (const [period, stats] of customer.byMonth) {
        const year = Math.floor(period / 100);
        if (year < start || year > end) continue;
        const total = perYear.get(year) ?? { transaksi: 0, belanja: 0 };
        total.transaksi += stats.total_transaksi;
        total.belanja += stats.total_belanja;
        perYear.set(year, total);
        transaksi += stats.total_transaksi;
        belanja += stats.total_belanja;
      }
      cohort.push({ customer, perYear, transaksi, belanja });
    }

    const isLoyal = (member: CohortMember) => member.transaksi > 1 && rangeYears.every((year) => member.perYear.has(year));
    const isStillBuying = (member: CohortMember) => member.transaksi > 1 && member.perYear.has(end);

    // Ringkasan per tahun: beli di tahun itu vs beli terus tanpa putus sejak tahun awal.
    const yearly = rangeYears.map((year) => {
      let beli = 0;
      let tanpaPutus = 0;
      for (const member of cohort) {
        if (!member.perYear.has(year)) continue;
        beli += 1;
        if (rangeYears.filter((y) => y <= year).every((y) => member.perYear.has(y))) tanpaPutus += 1;
      }
      return { year, beli, tanpa_putus: tanpaPutus };
    });

    const loyalCount = cohort.filter(isLoyal).length;
    const stillBuyingCount = cohort.filter(isStillBuying).length;

    const searchDigits = /^[+0-9\s-]+$/.test(search) ? search.replace(/[^0-9]/g, '') : '';
    const phoneSearch = searchDigits.startsWith('0') ? normalizePhone(searchDigits) : searchDigits;

    const members = cohort
      .filter(mode === 'loyal' ? isLoyal : isStillBuying)
      .filter(({ customer }) => {
        if (!search) return true;
        return (
          (phoneSearch && customer.phone.includes(phoneSearch)) ||
          customer.name?.toLowerCase().includes(search) ||
          customer.city?.toLowerCase().includes(search) ||
          customer.agent?.toLowerCase().includes(search)
        );
      })
      .sort((a, b) => b.belanja - a.belanja);

    return Response.json({
      success: true,
      data: {
        years,
        start,
        end,
        mode,
        range_years: rangeYears,
        summary: {
          cohort_customers: cohort.length,
          loyal_customers: loyalCount,
          still_buying_customers: stillBuyingCount,
        },
        yearly,
        customers: members.slice((page - 1) * LIMIT, page * LIMIT).map(({ customer, perYear, transaksi, belanja }) => ({
          phone: customer.phone,
          name: customer.name,
          city: customer.city,
          agent: customer.agent,
          per_year: rangeYears.map((year) => perYear.get(year)?.transaksi ?? 0),
          total_transaksi: transaksi,
          total_belanja: belanja,
          last_order_at: new Date(customer.lastSeenAt).toISOString(),
        })),
        pagination: {
          page,
          limit: LIMIT,
          totalRows: members.length,
          totalPages: Math.max(1, Math.ceil(members.length / LIMIT)),
        },
      },
    });
  } catch (error) {
    console.error('[API /customers/database/matrix GET]', error);
    return Response.json({ success: false, message: 'Gagal mengambil matrix customer' }, { status: 500 });
  }
}
