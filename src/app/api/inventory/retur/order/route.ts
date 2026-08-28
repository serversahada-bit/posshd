import { NextResponse } from 'next/server';

import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Terjadi kesalahan');

const jsonSafe = <T>(value: T): T => JSON.parse(JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item)) as T;

type Source = 'CSO' | 'CSO_AUTO' | 'CRM';

const SOURCE_CONFIG: Record<Source, { orders: string; items: string; extraItems?: string }> = {
  CSO: { orders: 'orders', items: 'order_items', extraItems: 'order_items_resend' },
  CSO_AUTO: { orders: 'orders_cso', items: 'order_items_cso' },
  CRM: { orders: 'orders_crm', items: 'order_items_crm' },
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const source = searchParams.get('source') as Source | null;
    const orderId = Number(searchParams.get('order_id') || 0);

    if (!source || !SOURCE_CONFIG[source] || !orderId) {
      return NextResponse.json({ success: false, message: 'Source dan order_id wajib diisi.' }, { status: 400 });
    }

    const { orders, items, extraItems } = SOURCE_CONFIG[source];

    const orderRows: any[] = await prisma.$queryRawUnsafe(
      `SELECT o.id as order_id, o.order_code, o.order_status, o.warehouse_id, w.warehouse_name,
              COALESCE(ca.receiver_name, c.name) as customer_name
       FROM ${orders} o
       LEFT JOIN warehouses w ON w.id = o.warehouse_id
       LEFT JOIN customers c ON o.customer_id = c.id
       LEFT JOIN customer_addresses ca ON ca.id = o.customer_address_id
       WHERE o.id = ?
       LIMIT 1`,
      orderId,
    );
    const order = orderRows[0];

    if (!order) {
      return NextResponse.json({ success: false, message: 'Order tidak ditemukan.' }, { status: 404 });
    }
    if (order.order_status !== 'shipped') {
      return NextResponse.json({ success: false, message: `Order ${order.order_code} sudah bukan status Shipped (sekarang: ${order.order_status}).` }, { status: 400 });
    }
    if (!order.warehouse_id) {
      return NextResponse.json({ success: false, message: `Order ${order.order_code} tidak punya gudang terpasang.` }, { status: 400 });
    }

    const itemsQuery = extraItems
      ? `SELECT id, product_id, product_name, qty, is_gift, is_bundle FROM ${items} WHERE order_id = ?
         UNION ALL
         SELECT id, product_id, product_name, qty, is_gift, is_bundle FROM ${extraItems} WHERE order_id = ?`
      : `SELECT id, product_id, product_name, qty, is_gift, is_bundle FROM ${items} WHERE order_id = ?`;
    const itemRows: any[] = await prisma.$queryRawUnsafe(itemsQuery, ...(extraItems ? [orderId, orderId] : [orderId]));

    const validItems = itemRows.filter((item) => Number(item.product_id) > 0 && Number(item.qty) > 0);

    return NextResponse.json(jsonSafe({
      success: true,
      data: {
        source,
        order_id: order.order_id,
        order_code: order.order_code,
        warehouse_id: order.warehouse_id,
        warehouse_name: order.warehouse_name,
        customer_name: order.customer_name,
        items: validItems.map((item) => ({
          order_item_id: Number(item.id),
          product_id: Number(item.product_id),
          product_name: item.product_name,
          qty: Number(item.qty),
          is_gift: Boolean(item.is_gift),
          is_bundle: Boolean(item.is_bundle),
        })),
      },
    }));
  } catch (error: unknown) {
    console.error('[API /inventory/retur/order GET]', error);
    return NextResponse.json({ success: false, message: getErrorMessage(error) || 'Gagal mengambil detail order' }, { status: 500 });
  }
}
