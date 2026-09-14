import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getScalevBaseUrl, getScalevOrderDetail, type ScalevOrderLine } from '@/lib/scalev';

export const dynamic = 'force-dynamic';

// Diambil terpisah dari /api/scalev/orders (list) karena `orderlines` hanya tersedia lewat
// endpoint detail per-order — dipanggil oleh frontend SETELAH tabel utama tampil, supaya
// load awal halaman Data Scalev tidak menunggu N request tambahan ke Scalev.
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

    const scalevSetting = await prisma.scalev.findFirst({
      where: { status: 'active' },
      orderBy: { id: 'desc' }
    });

    if (!scalevSetting || !scalevSetting.api_key) {
      return NextResponse.json({ success: false, message: 'API Key Scalev belum dikonfigurasi atau tidak aktif.' }, { status: 400 });
    }

    const apiKey = scalevSetting.api_key;
    const baseUrl = getScalevBaseUrl(scalevSetting.url);

    const results = await Promise.all(
      orderIds.map(async (orderId) => {
        try {
          const detail = await getScalevOrderDetail({ apiKey, baseUrl, orderId, timeoutMs: 6000 });
          return [orderId, detail.ok ? (detail.order?.orderlines || []) : []] as const;
        } catch {
          return [orderId, [] as ScalevOrderLine[]] as const;
        }
      })
    );

    const data: Record<string, ScalevOrderLine[]> = {};
    for (const [orderId, lines] of results) {
      data[orderId] = lines;
    }

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API /scalev/orders/products GET]', error);
    return NextResponse.json({ success: false, message: 'Internal Server Error: ' + message }, { status: 500 });
  }
}
