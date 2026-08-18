import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/db';

function isValidDateKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { date, totalData } = body || {};

    if (!isValidDateKey(date)) {
      return Response.json({ success: false, message: 'Tanggal tidak valid.' }, { status: 400 });
    }

    const total = Number(totalData);
    if (!Number.isFinite(total) || total < 0) {
      return Response.json({ success: false, message: 'Jumlah data pembagi tidak valid.' }, { status: 400 });
    }

    const cookieStore = await cookies();
    const createdBy = Number(cookieStore.get('sahada_user_id')?.value) || null;
    const entryDate = new Date(`${date}T00:00:00Z`);

    await prisma.crm_data_distributions.upsert({
      where: { entry_date: entryDate },
      create: { entry_date: entryDate, total_data: Math.round(total), created_by: createdBy },
      update: { total_data: Math.round(total), created_by: createdBy },
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error('[API /dashboard/crm_cr_input POST]', error);
    return Response.json(
      { success: false, message: 'Gagal menyimpan data pembagi CR.' },
      { status: 500 },
    );
  }
}
