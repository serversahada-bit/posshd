import type { NextRequest } from 'next/server';
import { getTeamRecapData, parseDateKey, parseGroupBy, resolveDefaultRange } from './_lib';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const { defaultStartKey, defaultEndKey } = resolveDefaultRange();

    const startKey = parseDateKey(searchParams.get('start_date'), defaultStartKey);
    const endKey = parseDateKey(searchParams.get('end_date'), defaultEndKey);
    const groupBy = parseGroupBy(searchParams.get('group_by'));

    const data = await getTeamRecapData(startKey, endKey, groupBy);

    return Response.json({ success: true, data });
  } catch (error) {
    console.error('[API /dashboard/team_recap]', error);
    return Response.json(
      { success: false, message: 'Gagal mengambil data capaian tim. Pastikan DB aktif.' },
      { status: 500 },
    );
  }
}
