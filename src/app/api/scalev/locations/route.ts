import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getScalevBaseUrl, searchScalevLocations } from '@/lib/scalev';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || '';

    if (!search || search.length < 3) {
      return NextResponse.json({ success: false, message: 'Minimal 3 karakter untuk pencarian.' }, { status: 400 });
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

    const result = await searchScalevLocations({ apiKey, baseUrl, search, pageSize: 15 });

    if (!result.ok) {
      return NextResponse.json({ success: false, message: result.message }, { status: result.statusCode });
    }

    return NextResponse.json({ success: true, data: result.locations });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API /scalev/locations]', error);
    return NextResponse.json({ success: false, message: 'Terjadi kesalahan: ' + message }, { status: 500 });
  }
}
