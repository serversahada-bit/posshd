import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { emitEvent } from '@/lib/socket';
import { orders_order_status, orders_order_type, payments_payment_method } from '@prisma/client';
import { cookies } from 'next/headers';

// GET /api/orders — setara olahan.php POIN
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const status = searchParams.get('status') ?? '';
    const search = searchParams.get('search') ?? '';
    const page = Math.max(1, Number(searchParams.get('page') ?? 1));
    const limit = 20;
    const offset = (page - 1) * limit;

    const whereClause: any = {};

    if (status) {
      whereClause.order_status = status;
    }

    if (search) {
      whereClause.OR = [
        { order_code: { contains: search } },
        { customers: { name: { contains: search } } },
      ];
    }

    const [orders, total] = await Promise.all([
      prisma.orders.findMany({
        where: whereClause,
        include: { customers: true },
        orderBy: { created_at: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.orders.count({ where: whereClause }),
    ]);

    const serializedOrders = orders.map(o => ({
      ...o,
      total_product_price: Number(o.total_product_price),
      product_discount: Number(o.product_discount),
      shipping_cost: Number(o.shipping_cost),
      other_fee: Number(o.other_fee),
      total_payment: Number(o.total_payment),
      customer_name: o.customers?.name || 'Unknown',
    }));

    return Response.json({ success: true, data: serializedOrders, total, page, limit });
  } catch (error) {
    console.error('[API /orders GET]', error);
    return Response.json({ success: false, message: 'Gagal mengambil data pesanan' }, { status: 500 });
  }
}

// POST /api/orders — buat pesanan baru (setara buat_pesanan.php)
export async function POST(request: NextRequest) {
  try {
    const createdByUserId = Number((await cookies()).get('sahada_user_id')?.value) || null;
    const body = await request.json();
    const {
      customer_id,
      customer_address_id,
      order_type,
      order_source,
      manual_order_code,
      items,
      product_discount,
      shipping_cost,
      other_fee,
      notes,
      payment_method,
    } = body as {
      customer_id: number;
      customer_address_id?: number;
      order_type?: orders_order_type;
      order_source?: string;
      manual_order_code?: string;
      items: Array<{ product_id: number; product_name: string; qty: number; price: number }>;
      product_discount?: number;
      shipping_cost?: number;
      other_fee?: number;
      notes?: string;
      payment_method?: payments_payment_method;
    };

    if (!customer_id || !items?.length) {
      return Response.json({ success: false, message: 'Customer dan item wajib diisi' }, { status: 400 });
    }

    const order_code = manual_order_code?.trim()
      ? manual_order_code.trim()
      : (() => {
          const now = new Date();
          const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
          const random = Math.floor(Math.random() * 9000) + 1000;
          return `ORD-${dateStr}-${random}`;
        })();

    if (manual_order_code?.trim() && order_code.length !== 13) {
      return Response.json({ success: false, message: 'ID Order (Scalev) harus tepat 13 karakter' }, { status: 400 });
    }

    const total_product_price = items.reduce((sum, item) => sum + item.price * item.qty, 0);
    const total_payment =
      total_product_price -
      (product_discount ?? 0) +
      (shipping_cost ?? 0) +
      (other_fee ?? 0);

    // Prisma Transaction for nested creation
    const order = await prisma.orders.create({
      data: {
        order_code,
        customer_id,
        created_by_user_id: createdByUserId,
        customer_address_id: customer_address_id || null,
        order_type: order_type || 'normal',
        order_source: order_source || 'pos',
        order_status: 'pending',
        total_product_price,
        product_discount: product_discount ?? 0,
        shipping_cost: shipping_cost ?? 0,
        other_fee: other_fee ?? 0,
        total_payment,
        notes: notes || null,
        order_items: {
          create: items.map(item => ({
            product_id: item.product_id,
            product_name: item.product_name,
            qty: item.qty,
            price: item.price,
            subtotal: item.price * item.qty,
          }))
        },
        payments: {
          create: {
            payment_method: payment_method || 'bank_transfer',
            payment_status: 'unpaid'
          }
        }
      }
    });

    await emitEvent('NEW_ORDER');
    await emitEvent('REFRESH_OLAHAN');

    return Response.json({
      success: true,
      message: 'Pesanan berhasil dibuat',
      data: { order_code, order_id: order.id },
    });
  } catch (error) {
    console.error('[API /orders POST]', error);
    return Response.json({ success: false, message: 'Gagal membuat pesanan' }, { status: 500 });
  }
}

// PATCH /api/orders — update status pesanan
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, order_status } = body as { id: number; order_status: orders_order_status };

    if (!id || !order_status) {
      return Response.json({ success: false, message: 'ID dan status wajib diisi' }, { status: 400 });
    }

    await prisma.orders.update({
      where: { id: Number(id) },
      data: { order_status },
    });

    await emitEvent('NEW_ORDER');
    await emitEvent('REFRESH_OLAHAN');

    return Response.json({ success: true, message: 'Status pesanan diperbarui' });
  } catch (error) {
    console.error('[API /orders PATCH]', error);
    return Response.json({ success: false, message: 'Gagal memperbarui status' }, { status: 500 });
  }
}

