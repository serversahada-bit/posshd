import prisma from '@/lib/db';

const DEFAULT_WINDOW_DAYS = 30;

export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseDateKey(value: string | null | undefined, fallbackKey: string): string {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return fallbackKey;
}

type RecapRow = {
  created_at: Date | null;
  total_payment: bigint | number | null;
  shipping_discount: bigint | number | null;
  promo_id: string | null;
};

export type DailyRecapEntry = { date: string; omset: number; voucherOngkir: number; orderCount: number };
export type PromoUsageEntry = { promoId: string; promoName: string; usageCount: number };

export type RekapHarianData = {
  startDate: string;
  endDate: string;
  totals: { omset: number; voucherOngkir: number; orderCount: number };
  dailyRecap: DailyRecapEntry[];
  promoUsage: PromoUsageEntry[];
};

export function resolveDefaultRange(): { defaultStartKey: string; defaultEndKey: string } {
  const defaultEndKey = toDateKey(new Date());
  const defaultStartDate = new Date(`${defaultEndKey}T00:00:00Z`);
  defaultStartDate.setUTCDate(defaultStartDate.getUTCDate() - (DEFAULT_WINDOW_DAYS - 1));
  return { defaultStartKey: toDateKey(defaultStartDate), defaultEndKey };
}

export async function getRekapHarianData(startKey: string, endKey: string): Promise<RekapHarianData> {
  const rangeStart = new Date(`${startKey}T00:00:00Z`);
  const rangeEnd = new Date(`${endKey}T23:59:59.999Z`);

  const dateFilter = { gte: rangeStart, lte: rangeEnd };
  const select = { created_at: true, total_payment: true, shipping_discount: true, promo_id: true } as const;

  const [ordersRows, crmRows, csoRows] = await Promise.all([
    prisma.orders.findMany({ where: { created_at: dateFilter, order_status: { not: 'cancelled' } }, select }),
    prisma.orders_crm.findMany({ where: { created_at: dateFilter, order_status: { not: 'cancelled' } }, select }),
    prisma.orders_cso.findMany({ where: { created_at: dateFilter, order_status: { not: 'cancelled' } }, select }),
  ]);

  const allRows: RecapRow[] = [...ordersRows, ...crmRows, ...csoRows];

  const dailyMap = new Map<string, { omset: number; voucherOngkir: number; orderCount: number }>();
  const promoUsageMap = new Map<string, number>();

  for (const row of allRows) {
    if (!row.created_at) continue;
    const dateKey = toDateKey(row.created_at);
    const existing = dailyMap.get(dateKey) || { omset: 0, voucherOngkir: 0, orderCount: 0 };
    existing.omset += Number(row.total_payment || 0);
    existing.voucherOngkir += Number(row.shipping_discount || 0);
    existing.orderCount += 1;
    dailyMap.set(dateKey, existing);

    if (row.promo_id) {
      const promoIds = row.promo_id.split(',').map((pid) => pid.trim()).filter(Boolean);
      for (const pid of promoIds) {
        promoUsageMap.set(pid, (promoUsageMap.get(pid) || 0) + 1);
      }
    }
  }

  const dailyRecap: DailyRecapEntry[] = [];
  const cursor = new Date(rangeStart);
  while (cursor <= rangeEnd) {
    const dateKey = toDateKey(cursor);
    const entry = dailyMap.get(dateKey) || { omset: 0, voucherOngkir: 0, orderCount: 0 };
    dailyRecap.push({ date: dateKey, ...entry });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const totals = dailyRecap.reduce(
    (acc, day) => ({
      omset: acc.omset + day.omset,
      voucherOngkir: acc.voucherOngkir + day.voucherOngkir,
      orderCount: acc.orderCount + day.orderCount,
    }),
    { omset: 0, voucherOngkir: 0, orderCount: 0 },
  );

  const promoCache: Record<string, string> = {};
  const promoUsage: PromoUsageEntry[] = [];
  for (const [pid, usageCount] of promoUsageMap.entries()) {
    if (!promoCache[pid]) {
      const numericId = parseInt(pid, 10);
      const result = Number.isNaN(numericId)
        ? []
        : await prisma.$queryRawUnsafe<Array<{ promo_name: string }>>('SELECT promo_name FROM promos WHERE id = ?', numericId);
      promoCache[pid] = result[0]?.promo_name || `Promo #${pid}`;
    }
    promoUsage.push({ promoId: pid, promoName: promoCache[pid], usageCount });
  }
  promoUsage.sort((a, b) => b.usageCount - a.usageCount);

  return {
    startDate: toDateKey(rangeStart),
    endDate: toDateKey(rangeEnd),
    totals,
    dailyRecap,
    promoUsage,
  };
}
