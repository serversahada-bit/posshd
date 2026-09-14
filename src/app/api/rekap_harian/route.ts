import type { NextRequest } from 'next/server';
import { getRekapHarianData, parseDateKey, resolveDefaultRange } from './_lib';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const { defaultStartKey, defaultEndKey } = resolveDefaultRange();

    const startKey = parseDateKey(searchParams.get('start_date'), defaultStartKey);
    const endKey = parseDateKey(searchParams.get('end_date'), defaultEndKey);

    const data = await getRekapHarianData(startKey, endKey);

    return Response.json({ success: true, data });
  } catch (error) {
    console.error('[API /rekap_harian]', error);
    return Response.json(
      { success: false, message: 'Gagal mengambil data rekap harian. Pastikan DB aktif.' },
      { status: 500 },
    );
  }
}
