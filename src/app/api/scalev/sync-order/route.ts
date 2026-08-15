import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getScalevBaseUrl, syncPosOrderToScalev } from '@/lib/scalev';

export const dynamic = 'force-dynamic';

// Trigger manual dari tombol "Kirim ke Scalev" di halaman POS to Scalev — mengulang proses yang
// sama dengan yang otomatis dijalankan saat pesanan dibuat (lihat syncPosOrderToScalev), dipakai
// untuk retry kalau sinkronisasi otomatis sebelumnya gagal.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const orderCode = String(body?.order_code || '').trim();

    if (!orderCode) {
      return NextResponse.json({ success: false, message: 'order_code wajib diisi.' }, { status: 400 });
    }

    const order = await prisma.orders.findUnique({
      where: { order_code: orderCode },
      include: {
        customer_addresses: true,
        shipments: { orderBy: { id: 'desc' }, take: 1 },
        payments: { orderBy: { id: 'desc' }, take: 1 },
      },
    });

    if (!order) {
      return NextResponse.json({ success: false, message: 'Pesanan tidak ditemukan di POS.' }, { status: 404 });
    }

    if (!order.scalev_order_id) {
      return NextResponse.json({ success: false, message: 'Pesanan ini tidak berasal dari draft Scalev (tidak ada scalev_order_id).' }, { status: 400 });
    }

    const scalevSetting = await prisma.scalev.findFirst({
      where: { status: 'active' },
      orderBy: { id: 'desc' },
    });

    if (!scalevSetting || !scalevSetting.api_key) {
      return NextResponse.json({ success: false, message: 'API Key Scalev belum dikonfigurasi atau tidak aktif.' }, { status: 400 });
    }

    const apiKey = scalevSetting.api_key;
    const baseUrl = getScalevBaseUrl(scalevSetting.url);

    const addr = order.customer_addresses;
    const shipment = order.shipments[0];
    const payment = order.payments[0];
    const warehouse = order.warehouse_id
      ? await prisma.warehouses.findUnique({ where: { id: order.warehouse_id }, select: { code: true } })
      : null;

    const result = await syncPosOrderToScalev({
      apiKey,
      baseUrl,
      scalevOrderId: order.scalev_order_id,
      courierName: shipment?.courier_name,
      warehouseCode: warehouse?.code,
      province: addr?.province,
      city: addr?.city,
      district: addr?.district,
      address: addr?.address,
      customerName: addr?.receiver_name,
      customerPhone: addr?.whatsapp_number,
      paymentMethod: payment?.payment_method,
    });

    if (!result.ok) {
      return NextResponse.json({ success: false, message: result.message }, { status: 409 });
    }

    await prisma.orders.update({
      where: { id: order.id },
      data: { scalev_synced_at: new Date() },
    });

    return NextResponse.json({ success: true, message: result.message });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API /scalev/sync-order POST]', error);
    return NextResponse.json({ success: false, message: 'Internal Server Error: ' + message }, { status: 500 });
  }
}
