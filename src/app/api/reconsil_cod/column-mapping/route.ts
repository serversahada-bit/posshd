import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

// Lets the frontend re-apply a remembered column mapping when the admin picks/changes the
// courier AFTER a file is already loaded, without re-uploading/re-parsing the file.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const courierName = (searchParams.get('courier_name') || '').trim();

  if (!courierName) {
    return NextResponse.json({ status: 'success', mapping: null });
  }

  try {
    const mapping = await prisma.cod_courier_column_mappings.findUnique({
      where: { courier_name: courierName },
      select: { resi_header: true, amount_header: true, disbursed_at_header: true },
    });

    return NextResponse.json({ status: 'success', mapping: mapping || null });
  } catch (error: unknown) {
    console.error('[API /reconsil_cod/column-mapping GET]', error);
    return NextResponse.json({ status: 'error', message: 'Gagal mengambil mapping kolom' }, { status: 500 });
  }
}
