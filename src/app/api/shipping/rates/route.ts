import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { splitRegionParts } from '@/lib/address';
import { parseTariffPrice } from '@/lib/shippingPrice';
import { ORIGINS, ORIGIN_CODES, ORIGIN_TO_WAREHOUSE_IDS, buildCourierAliases, normalizeCourierKey } from '@/lib/shippingRates';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const subdistrict = searchParams.get('subdistrict') || '';

  if (!subdistrict) {
    return NextResponse.json(
      { status: 'error', message: 'Destination subdistrict is empty' },
      { status: 400 }
    );
  }

  const region = splitRegionParts(subdistrict);
  const province = region.province || '';
  const city = region.city || '';
  const district = region.district || '';

  const allOriginRates: Record<string, any> = {};

  try {
    const courierRows = await prisma.couriers.findMany({
      select: { courier_name: true, code: true },
      orderBy: { courier_name: 'asc' },
    });

    const { courierAliasMap, courierDisplayNames } = buildCourierAliases(courierRows);

    for (const origin of ORIGINS) {
      const kode_asal = ORIGIN_CODES[origin];

      // Exact match first
      let rates = await prisma.$queryRaw<any[]>`
        SELECT *
        FROM tarif_pengiriman
        WHERE kode_asal = ${kode_asal}
          AND nama_tujuan COLLATE utf8mb4_unicode_ci = CONVERT(${subdistrict} USING utf8mb4) COLLATE utf8mb4_unicode_ci
      `;

      if (rates.length === 0) {
        // Fallback LIKE match
        const cleanCity = city.replace(/kabupaten /i, '').replace(/kota /i, '').trim();
        rates = await prisma.$queryRaw<any[]>`
          SELECT *
          FROM tarif_pengiriman
          WHERE kode_asal = ${kode_asal}
            AND nama_tujuan COLLATE utf8mb4_unicode_ci LIKE CONCAT('%', CONVERT(${province} USING utf8mb4) COLLATE utf8mb4_unicode_ci, '%')
            AND nama_tujuan COLLATE utf8mb4_unicode_ci LIKE CONCAT('%', CONVERT(${cleanCity} USING utf8mb4) COLLATE utf8mb4_unicode_ci, '%')
            AND nama_tujuan COLLATE utf8mb4_unicode_ci LIKE CONCAT('%', CONVERT(${district} USING utf8mb4) COLLATE utf8mb4_unicode_ci, '%')
        `;
      }

      if (rates.length > 0) {
        // price null = kurir tidak punya tarif sah untuk tujuan ini; 0 = gratis ongkir.
        const couriers: Record<string, { price: number | null; estimation: string; out_of_coverage: string }> = Object.fromEntries(
          courierDisplayNames.map((name) => [name, { price: null, estimation: '', out_of_coverage: '' }])
        );

        for (const row of rates) {
          if (!row.kurir) continue;
          const kurir = normalizeCourierKey(row.kurir);
          const canonicalCourierKey = courierAliasMap.get(kurir);
          if (canonicalCourierKey && couriers[canonicalCourierKey]) {
            couriers[canonicalCourierKey].price = parseTariffPrice(row.harga);
            couriers[canonicalCourierKey].estimation = row.estimasi || '';
            couriers[canonicalCourierKey].out_of_coverage = row.out_of_coverage || '';
          }
        }

        let cheapest: number | null = null;
        for (const c in couriers) {
          const price = couriers[c].price;
          if (price !== null && (cheapest === null || price < cheapest)) {
            cheapest = price;
          }
        }

        allOriginRates[origin] = {
          warehouse_ids: ORIGIN_TO_WAREHOUSE_IDS[origin],
          rates: couriers,
          cheapest_price: cheapest,
        };
      }
    }

    let bestOrigin: string | null = null;
    let bestPrice: number | null = null;
    for (const origin in allOriginRates) {
      const price = allOriginRates[origin].cheapest_price;
      if (price !== null && (bestPrice === null || price < bestPrice)) {
        bestPrice = price;
        bestOrigin = origin;
      }
    }

    return NextResponse.json({
      status: 'success',
      origins: allOriginRates,
      best_origin: bestOrigin,
      best_price: bestPrice,
    });
  } catch (error: any) {
    console.error('Error fetching shipping rates:', error);
    return NextResponse.json(
      { status: 'error', message: 'Failed to fetch shipping rates' },
      { status: 500 }
    );
  }
}
