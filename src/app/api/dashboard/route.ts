import prisma from '@/lib/db';
import type { orders_order_status } from '@prisma/client';
import type { NextRequest } from 'next/server';

const DEFAULT_WINDOW_DAYS = 30;

const ORDER_STATUSES: orders_order_status[] = [
  'pending',
  'paid',
  'processing',
  'ready_to_ship',
  'shipped',
  'completed',
  'cancelled',
  'rts',
  'problem',
];

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDateKey(value: string | null, fallbackKey: string): string {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return fallbackKey;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const defaultEndKey = toDateKey(new Date());
    const defaultStartDate = new Date(`${defaultEndKey}T00:00:00Z`);
    defaultStartDate.setUTCDate(defaultStartDate.getUTCDate() - (DEFAULT_WINDOW_DAYS - 1));
    const defaultStartKey = toDateKey(defaultStartDate);

    const startKey = parseDateKey(searchParams.get('start_date'), defaultStartKey);
    const endKey = parseDateKey(searchParams.get('end_date'), defaultEndKey);

    const rangeStart = new Date(`${startKey}T00:00:00Z`);
    const rangeEnd = new Date(`${endKey}T23:59:59.999Z`);

    const dateFilter = { gte: rangeStart, lte: rangeEnd };

    const [
      ordersAgg,
      crmAgg,
      csoAgg,
      ordersGroups,
      crmGroups,
      csoGroups,
      ordersTrend,
      crmTrend,
      csoTrend,
    ] = await Promise.all([
      prisma.orders.aggregate({
        _sum: { total_payment: true },
        _count: { _all: true },
        where: { created_at: dateFilter },
      }),
      prisma.orders_crm.aggregate({
        _sum: { total_payment: true },
        _count: { _all: true },
        where: { created_at: dateFilter },
      }),
      prisma.orders_cso.aggregate({
        _sum: { total_payment: true },
        _count: { _all: true },
        where: { created_at: dateFilter },
      }),
      prisma.orders.groupBy({
        by: ['order_status'],
        _sum: { total_payment: true },
        _count: { _all: true },
        where: { created_at: dateFilter },
      }),
      prisma.orders_crm.groupBy({
        by: ['order_status'],
        _sum: { total_payment: true },
        _count: { _all: true },
        where: { created_at: dateFilter },
      }),
      prisma.orders_cso.groupBy({
        by: ['order_status'],
        _sum: { total_payment: true },
        _count: { _all: true },
        where: { created_at: dateFilter },
      }),
      prisma.orders.findMany({
        where: { created_at: dateFilter, order_status: { not: 'cancelled' } },
        select: { created_at: true, total_payment: true },
      }),
      prisma.orders_crm.findMany({
        where: { created_at: dateFilter, order_status: { not: 'cancelled' } },
        select: { created_at: true, total_payment: true },
      }),
      prisma.orders_cso.findMany({
        where: { created_at: dateFilter, order_status: { not: 'cancelled' } },
        select: { created_at: true, total_payment: true },
      }),
    ]);

    const statusMap = new Map<string, { revenue: number; count: number }>();
    for (const group of [ordersGroups, crmGroups, csoGroups]) {
      for (const row of group) {
        if (!row.order_status) continue;
        const existing = statusMap.get(row.order_status) || { revenue: 0, count: 0 };
        existing.revenue += Number(row._sum.total_payment || 0);
        existing.count += row._count._all;
        statusMap.set(row.order_status, existing);
      }
    }

    const statusBreakdown = ORDER_STATUSES.map((status) => ({
      status,
      revenue: statusMap.get(status)?.revenue || 0,
      count: statusMap.get(status)?.count || 0,
    }));

    const grossRevenue = statusBreakdown
      .filter((s) => s.status !== 'cancelled')
      .reduce((sum, s) => sum + s.revenue, 0);
    const totalCount = statusBreakdown
      .filter((s) => s.status !== 'cancelled')
      .reduce((sum, s) => sum + s.count, 0);

    const allOrdersRevenue =
      Number(ordersAgg._sum.total_payment || 0) +
      Number(crmAgg._sum.total_payment || 0) +
      Number(csoAgg._sum.total_payment || 0);
    const allOrdersCount = ordersAgg._count._all + crmAgg._count._all + csoAgg._count._all;

    const trendByDate = new Map<string, { revenue: number; count: number }>();
    for (const order of [...ordersTrend, ...crmTrend, ...csoTrend]) {
      if (!order.created_at) continue;
      const dateKey = toDateKey(order.created_at);
      const existing = trendByDate.get(dateKey) || { revenue: 0, count: 0 };
      existing.revenue += Number(order.total_payment || 0);
      existing.count += 1;
      trendByDate.set(dateKey, existing);
    }

    const dailyTrend: { date: string; revenue: number; count: number }[] = [];
    const cursor = new Date(rangeStart);
    while (cursor <= rangeEnd) {
      const dateKey = toDateKey(cursor);
      const entry = trendByDate.get(dateKey) || { revenue: 0, count: 0 };
      dailyTrend.push({ date: dateKey, revenue: entry.revenue, count: entry.count });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return Response.json({
      success: true,
      data: {
        startDate: toDateKey(rangeStart),
        endDate: toDateKey(rangeEnd),
        grossRevenue,
        totalCount,
        allOrders: {
          revenue: allOrdersRevenue,
          count: allOrdersCount,
        },
        statusBreakdown,
        dailyTrend,
      },
    });
  } catch (error) {
    console.error('[API /dashboard]', error);
    return Response.json(
      { success: false, message: 'Gagal mengambil data dashboard. Pastikan DB aktif.' },
      { status: 500 }
    );
  }
}
