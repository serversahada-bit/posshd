import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getScalevBaseUrl, getScalevOrderDetail } from '@/lib/scalev';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ order_id: string }> }
) {
  try {
    const { order_id: orderId } = await params;

    if (!orderId) {
      return NextResponse.json({ success: false, message: 'Order ID tidak valid.' }, { status: 400 });
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

    const result = await getScalevOrderDetail({ apiKey, baseUrl, orderId });

    if (!result.ok) {
      return NextResponse.json({ success: false, message: result.message }, { status: result.statusCode });
    }

    if (!result.order) {
      return NextResponse.json({ success: false, message: result.message }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: result.order });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API /scalev/orders/[order_id] GET]', error);
    return NextResponse.json({ success: false, message: 'Internal Server Error: ' + message }, { status: 500 });
  }
}
