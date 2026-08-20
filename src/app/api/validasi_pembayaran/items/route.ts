import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

const itemSelect = {
  product_name: true,
  qty: true,
  price: true,
  discount: true,
  is_gift: true,
  is_bundle: true,
} as const;

const orderTotalsSelect = {
  total_product_price: true,
  product_discount: true,
  shipping_cost: true,
  shipping_discount: true,
  other_fee: true,
  additional_shipping_cost: true,
  total_payment: true,
} as const;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const orderId = Number(searchParams.get('order_id'));
    const sourceTable = searchParams.get('source_table');

    if (!orderId || !sourceTable) {
      return NextResponse.json({ status: 'error', message: 'order_id dan source_table wajib diisi' }, { status: 400 });
    }

    let items;
    let order;
    if (sourceTable === 'CRM') {
      [items, order] = await Promise.all([
        prisma.order_items_crm.findMany({ where: { order_id: orderId }, select: itemSelect }),
        prisma.orders_crm.findUnique({ where: { id: orderId }, select: orderTotalsSelect }),
      ]);
    } else if (sourceTable === 'CSO_AUTO') {
      [items, order] = await Promise.all([
        prisma.order_items_cso.findMany({ where: { order_id: orderId }, select: itemSelect }),
        prisma.orders_cso.findUnique({ where: { id: orderId }, select: orderTotalsSelect }),
      ]);
    } else {
      const [main, legacy, orderRow] = await Promise.all([
        prisma.order_items.findMany({ where: { order_id: orderId }, select: itemSelect }),
        prisma.order_items_resend.findMany({ where: { order_id: orderId }, select: itemSelect }),
        prisma.orders.findUnique({ where: { id: orderId }, select: orderTotalsSelect }),
      ]);
      items = [...main, ...legacy];
      order = orderRow;
    }

    if (!order) {
      return NextResponse.json({ status: 'error', message: 'Pesanan tidak ditemukan' }, { status: 404 });
    }

    const safeItems = items.map((item) => ({
      product_name: item.product_name,
      qty: Number(item.qty || 0),
      price: Number(item.price || 0),
      discount: Number(item.discount || 0),
      is_gift: item.is_gift,
      is_bundle: item.is_bundle,
    }));

    return NextResponse.json({
      status: 'success',
      data: {
        items: safeItems,
        totals: {
          product_price: Number(order.total_product_price || 0),
          product_discount: Number(order.product_discount || 0),
          shipping_cost: Number(order.shipping_cost || 0),
          shipping_discount: Number(order.shipping_discount || 0),
          cod_fee: Number(order.other_fee || 0),
          other_fee: Number(order.additional_shipping_cost || 0),
          total_payment: Number(order.total_payment || 0),
        },
      },
    });
  } catch (error: unknown) {
    console.error('Error fetching order items:', error);
    return NextResponse.json(
      { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
