import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

type PosStatusEntry = {
  order_code: string;
  order_status: string | null;
  source_table: 'CSO' | 'CSO_AUTO' | 'CRM';
  scalev_synced_at: string | null;
};

// Menggantikan pengecekan manual lewat Google Sheets (scalev_to_pos.py): status "sudah dibuat"
// ditentukan dari keberadaan scalev_order_id di salah satu tabel order lokal (diisi otomatis
// saat pesanan dibuat dari draft Scalev lewat /buat_pesanan_scalev, /buat_pesanan_cso, atau /buat_pesanan_crm).
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderIds = (searchParams.get('order_ids') || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    if (orderIds.length === 0) {
      return NextResponse.json({ success: true, data: {} });
    }

    const [fromOrders, fromOrdersCso, fromOrdersCrm] = await Promise.all([
      prisma.orders.findMany({
        where: { scalev_order_id: { in: orderIds } },
        select: { order_code: true, scalev_order_id: true, order_status: true, scalev_synced_at: true },
      }),
      prisma.orders_cso.findMany({
        where: { scalev_order_id: { in: orderIds } },
        select: { order_code: true, scalev_order_id: true, order_status: true },
      }),
      prisma.orders_crm.findMany({
        where: { scalev_order_id: { in: orderIds } },
        select: { order_code: true, scalev_order_id: true, order_status: true },
      }),
    ]);

    const data: Record<string, PosStatusEntry> = {};

    for (const row of fromOrders) {
      if (row.scalev_order_id) {
        data[row.scalev_order_id] = {
          order_code: row.order_code,
          order_status: row.order_status,
          source_table: 'CSO',
          scalev_synced_at: row.scalev_synced_at ? row.scalev_synced_at.toISOString() : null,
        };
      }
    }
    for (const row of fromOrdersCso) {
      if (row.scalev_order_id && !data[row.scalev_order_id]) {
        data[row.scalev_order_id] = { order_code: row.order_code, order_status: row.order_status, source_table: 'CSO_AUTO', scalev_synced_at: null };
      }
    }
    for (const row of fromOrdersCrm) {
      if (row.scalev_order_id && !data[row.scalev_order_id]) {
        data[row.scalev_order_id] = { order_code: row.order_code, order_status: row.order_status, source_table: 'CRM', scalev_synced_at: null };
      }
    }

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API /scalev/pos-status GET]', error);
    return NextResponse.json({ success: false, message: 'Internal Server Error: ' + message }, { status: 500 });
  }
}
