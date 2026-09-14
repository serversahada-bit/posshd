import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getScalevBaseUrl, listScalevSalesPeople } from '@/lib/scalev';

export const dynamic = 'force-dynamic';

// Dipakai untuk mengisi filter "Nama CS" di halaman Data Scalev — daftar sales people
// diambil langsung dari Scalev (bukan tabel user lokal), karena CS di sana bisa berbeda dari user POS.
export async function GET() {
  try {
    const scalevSetting = await prisma.scalev.findFirst({
      where: { status: 'active' },
      orderBy: { id: 'desc' },
    });

    if (!scalevSetting || !scalevSetting.api_key) {
      return NextResponse.json({ success: false, message: 'API Key Scalev belum dikonfigurasi atau tidak aktif.' }, { status: 400 });
    }

    const apiKey = scalevSetting.api_key;
    const baseUrl = getScalevBaseUrl(scalevSetting.url);

    const result = await listScalevSalesPeople({ apiKey, baseUrl });

    if (!result.ok) {
      return NextResponse.json({ success: false, message: result.message }, { status: result.statusCode });
    }

    return NextResponse.json({ success: true, data: result.people });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API /scalev/sales-people GET]', error);
    return NextResponse.json({ success: false, message: 'Internal Server Error: ' + message }, { status: 500 });
  }
}
