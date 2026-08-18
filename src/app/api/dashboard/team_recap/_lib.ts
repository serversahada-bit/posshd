import prisma from '@/lib/db';

const DEFAULT_WINDOW_DAYS = 30;

export type GroupBy = 'day' | 'week' | 'month';

export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseDateKey(value: string | null | undefined, fallbackKey: string): string {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return fallbackKey;
}

export function parseGroupBy(value: string | null | undefined): GroupBy {
  if (value === 'week' || value === 'month') return value;
  return 'day';
}

export function resolveDefaultRange(): { defaultStartKey: string; defaultEndKey: string } {
  const defaultEndKey = toDateKey(new Date());
  const defaultStartDate = new Date(`${defaultEndKey}T00:00:00Z`);
  defaultStartDate.setUTCDate(defaultStartDate.getUTCDate() - (DEFAULT_WINDOW_DAYS - 1));
  return { defaultStartKey: toDateKey(defaultStartDate), defaultEndKey };
}

export type TeamTotals = {
  orderCount: number;
  addressClosing: number;
  box: number;
  crossSell: number;
  upsell: number;
};

export type ProductMetric = TeamTotals & {
  productKey: string;
  productName: string;
};

export type ChannelMetric = { channel: string; orderCount: number };

export type CrmTotals = TeamTotals & {
  dataMasuk: number;
  closingRatePercent: number | null;
};

export type PeriodBucket = {
  periodKey: string;
  periodLabel: string;
  cso: TeamTotals;
  crm: CrmTotals;
  total: TeamTotals;
};

export type TeamRecapData = {
  startDate: string;
  endDate: string;
  groupBy: GroupBy;
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

type OrderRow = {
  id: number;
  created_at: Date | null;
  ad_source?: string | null;
  customer_address_id: number | null;
  order_status: string | null;
};

type ItemRow = {
  order_id: number;
  product_id: number | null;
  product_name: string;
  qty: number;
};

type ClassifiedOrder = {
  id: number;
  createdAt: Date | null;
  channel: string;
  isCancelled: boolean;
  isClosing: boolean;
  isCrossSell: boolean;
  isUpsell: boolean;
  products: Map<string, { name: string; qty: number }>;
};

function classifyOrders(orders: OrderRow[], items: ItemRow[]): ClassifiedOrder[] {
  const itemsByOrder = new Map<number, ItemRow[]>();
  for (const item of items) {
    const list = itemsByOrder.get(item.order_id) || [];
    list.push(item);
    itemsByOrder.set(item.order_id, list);
  }

  return orders.map((order) => {
    const orderItems = itemsByOrder.get(order.id) || [];
    const qtyByProduct = new Map<string, { name: string; qty: number }>();
    for (const item of orderItems) {
      const key = item.product_id != null ? `id:${item.product_id}` : `name:${item.product_name}`;
      const existing = qtyByProduct.get(key) || { name: item.product_name, qty: 0 };
      existing.qty += Number(item.qty || 0);
      qtyByProduct.set(key, existing);
    }

    const distinctProductCount = qtyByProduct.size;
    const isCancelled = order.order_status === 'cancelled';
    const hasAddress = order.customer_address_id != null;
    const singleProductQty = distinctProductCount === 1 ? Array.from(qtyByProduct.values())[0].qty : 0;

    return {
      id: order.id,
      createdAt: order.created_at,
      channel: order.ad_source?.trim() || 'Tidak Diketahui',
      isCancelled,
      isClosing: hasAddress && !isCancelled,
      isCrossSell: !isCancelled && distinctProductCount > 1,
      isUpsell: !isCancelled && distinctProductCount === 1 && singleProductQty > 1,
      products: qtyByProduct,
    };
  });
}

function emptyTotals(): TeamTotals {
  return { orderCount: 0, addressClosing: 0, box: 0, crossSell: 0, upsell: 0 };
}

function buildTotals(classified: ClassifiedOrder[]): TeamTotals {
  const totals = emptyTotals();
  for (const order of classified) {
    totals.orderCount += 1;
    if (order.isClosing) totals.addressClosing += 1;
    if (!order.isCancelled) {
      for (const info of order.products.values()) totals.box += info.qty;
      if (order.isCrossSell) totals.crossSell += 1;
      if (order.isUpsell) totals.upsell += 1;
    }
  }
  return totals;
}

function buildProductMetrics(classified: ClassifiedOrder[]): ProductMetric[] {
  const map = new Map<string, ProductMetric>();
  for (const order of classified) {
    for (const [key, info] of order.products.entries()) {
      const existing = map.get(key) || {
        productKey: key,
        productName: info.name,
        ...emptyTotals(),
      };
      existing.orderCount += 1;
      if (order.isClosing) existing.addressClosing += 1;
      if (!order.isCancelled) {
        existing.box += info.qty;
        if (order.isCrossSell) existing.crossSell += 1;
        if (order.isUpsell) existing.upsell += 1;
      }
      map.set(key, existing);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.box - a.box);
}

function buildLeadByChannel(classified: ClassifiedOrder[]): ChannelMetric[] {
  const map = new Map<string, number>();
  for (const order of classified) {
    map.set(order.channel, (map.get(order.channel) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([channel, orderCount]) => ({ channel, orderCount }))
    .sort((a, b) => b.orderCount - a.orderCount);
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function getIsoWeek(date: Date): { isoYear: number; isoWeek: number; weekStartKey: string } {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const isoWeek = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  const weekStart = new Date(date);
  weekStart.setUTCDate(weekStart.getUTCDate() - (dayNum - 1));
  return { isoYear: d.getUTCFullYear(), isoWeek, weekStartKey: toDateKey(weekStart) };
}

const MONTH_LABELS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

function periodKeyFor(date: Date, groupBy: GroupBy): { key: string; label: string } {
  if (groupBy === 'month') {
    const key = `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`;
    return { key, label: `${MONTH_LABELS_ID[date.getUTCMonth()]} ${date.getUTCFullYear()}` };
  }
  if (groupBy === 'week') {
    const { isoYear, isoWeek, weekStartKey } = getIsoWeek(date);
    return { key: `${isoYear}-W${pad2(isoWeek)}`, label: `Minggu ${isoWeek} (mulai ${weekStartKey})` };
  }
  return { key: toDateKey(date), label: toDateKey(date) };
}

function buildPeriodRecap(
  csoClassified: ClassifiedOrder[],
  crmClassified: ClassifiedOrder[],
  dataMasukByDate: Map<string, number>,
  groupBy: GroupBy,
): PeriodBucket[] {
  const buckets = new Map<string, { label: string; cso: ClassifiedOrder[]; crm: ClassifiedOrder[]; dataMasuk: number }>();

  const ensureBucket = (date: Date) => {
    const { key, label } = periodKeyFor(date, groupBy);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { label, cso: [], crm: [], dataMasuk: 0 };
      buckets.set(key, bucket);
    }
    return { key, bucket };
  };

  for (const order of csoClassified) {
    if (!order.createdAt) continue;
    ensureBucket(order.createdAt).bucket.cso.push(order);
  }
  for (const order of crmClassified) {
    if (!order.createdAt) continue;
    ensureBucket(order.createdAt).bucket.crm.push(order);
  }
  for (const [dateKey, totalData] of dataMasukByDate.entries()) {
    const date = new Date(`${dateKey}T00:00:00Z`);
    ensureBucket(date).bucket.dataMasuk += totalData;
  }

  const result: PeriodBucket[] = [];
  for (const [key, bucket] of buckets.entries()) {
    const cso = buildTotals(bucket.cso);
    const crmBase = buildTotals(bucket.crm);
    const crm: CrmTotals = {
      ...crmBase,
      dataMasuk: bucket.dataMasuk,
      closingRatePercent: bucket.dataMasuk > 0 ? (crmBase.addressClosing / bucket.dataMasuk) * 100 : null,
    };
    result.push({
      periodKey: key,
      periodLabel: bucket.label,
      cso,
      crm,
      total: {
        orderCount: cso.orderCount + crm.orderCount,
        addressClosing: cso.addressClosing + crm.addressClosing,
        box: cso.box + crm.box,
        crossSell: cso.crossSell + crm.crossSell,
        upsell: cso.upsell + crm.upsell,
      },
    });
  }

  result.sort((a, b) => a.periodKey.localeCompare(b.periodKey));
  return result;
}

export async function getTeamRecapData(startKey: string, endKey: string, groupBy: GroupBy): Promise<TeamRecapData> {
  const rangeStart = new Date(`${startKey}T00:00:00Z`);
  const rangeEnd = new Date(`${endKey}T23:59:59.999Z`);
  const dateFilter = { gte: rangeStart, lte: rangeEnd };

  const [csoOrders, csoItems, crmOrders, crmItems, dataMasukRows] = await Promise.all([
    prisma.orders_cso.findMany({
      where: { created_at: dateFilter },
      select: { id: true, created_at: true, ad_source: true, customer_address_id: true, order_status: true },
    }),
    prisma.order_items_cso.findMany({
      where: { created_at: dateFilter },
      select: { order_id: true, product_id: true, product_name: true, qty: true },
    }),
    prisma.orders_crm.findMany({
      where: { created_at: dateFilter },
      select: { id: true, created_at: true, customer_address_id: true, order_status: true },
    }),
    prisma.order_items_crm.findMany({
      where: { created_at: dateFilter },
      select: { order_id: true, product_id: true, product_name: true, qty: true },
    }),
    prisma.crm_data_distributions.findMany({
      where: { entry_date: { gte: rangeStart, lte: rangeEnd } },
      select: { entry_date: true, total_data: true },
    }),
  ]);

  const csoClassified = classifyOrders(csoOrders, csoItems);
  const crmClassified = classifyOrders(
    crmOrders.map((order) => ({ ...order, ad_source: null })),
    crmItems,
  );

  const dataMasukByDate = new Map<string, number>();
  for (const row of dataMasukRows) {
    dataMasukByDate.set(toDateKey(row.entry_date), row.total_data);
  }
  const dataMasukTotal = Array.from(dataMasukByDate.values()).reduce((sum, v) => sum + v, 0);

  const csoTotalAllProduct = buildTotals(csoClassified);
  const crmTotalsBase = buildTotals(crmClassified);
  const crmTotalAllProduct: CrmTotals = {
    ...crmTotalsBase,
    dataMasuk: dataMasukTotal,
    closingRatePercent: dataMasukTotal > 0 ? (crmTotalsBase.addressClosing / dataMasukTotal) * 100 : null,
  };

  const combinedTotal: TeamTotals = {
    orderCount: csoTotalAllProduct.orderCount + crmTotalsBase.orderCount,
    addressClosing: csoTotalAllProduct.addressClosing + crmTotalsBase.addressClosing,
    box: csoTotalAllProduct.box + crmTotalsBase.box,
    crossSell: csoTotalAllProduct.crossSell + crmTotalsBase.crossSell,
    upsell: csoTotalAllProduct.upsell + crmTotalsBase.upsell,
  };

  const dataMasukEntries: { date: string; totalData: number }[] = [];
  const cursor = new Date(rangeStart);
  while (cursor <= rangeEnd) {
    const dateKey = toDateKey(cursor);
    dataMasukEntries.push({ date: dateKey, totalData: dataMasukByDate.get(dateKey) || 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return {
    startDate: toDateKey(rangeStart),
    endDate: toDateKey(rangeEnd),
    groupBy,
    cso: {
      byProduct: buildProductMetrics(csoClassified),
      totalAllProduct: csoTotalAllProduct,
      leadByChannel: buildLeadByChannel(csoClassified),
    },
    crm: {
      byProduct: buildProductMetrics(crmClassified),
      totalAllProduct: crmTotalAllProduct,
      dataMasukEntries,
    },
    combinedTotal,
    periodRecap: buildPeriodRecap(csoClassified, crmClassified, dataMasukByDate, groupBy),
  };
}
