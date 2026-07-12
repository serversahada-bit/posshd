import prisma from '@/lib/db';

export async function GET() {
  try {
    const [totalOrders, revenueResult, totalCustomers, totalProducts, recentOrders] =
      await Promise.all([
        prisma.orders.count({
          where: { order_status: { not: 'cancelled' } },
        }),
        prisma.orders.aggregate({
          _sum: { total_payment: true },
          where: { order_status: { in: ['paid', 'completed'] } },
        }),
        prisma.customers.count(),
        prisma.products.count(),
        prisma.orders.findMany({
          take: 5,
          orderBy: { created_at: 'desc' },
          include: { customers: true },
        }),
      ]);

    return Response.json({
      success: true,
      data: {
        totalOrders,
        totalRevenue: Number(revenueResult._sum.total_payment || 0),
        totalCustomers,
        totalProducts,
        recentOrders: recentOrders.map((o) => ({
          order_code: o.order_code,
          customer_name: o.customers?.name || 'Unknown',
          total_payment: Number(o.total_payment),
          order_status: o.order_status,
          created_at: o.created_at,
        })),
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
