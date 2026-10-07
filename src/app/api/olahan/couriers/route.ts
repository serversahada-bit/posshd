import { NextResponse } from 'next/server';

import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

type CourierRow = { courier_name: string };

// Daftar ekspedisi untuk filter di /olahan. Sengaja dibaca dari nama kurir yang benar-benar
// tersimpan di order (shipments*), bukan dari tabel `couriers` — karena keduanya bisa beda:
// order lama menyimpan "POS" sedangkan tabel couriers memakai "POS REGULER", jadi kalau
// daftarnya diambil dari tabel couriers, order lama tidak akan pernah cocok saat difilter.
export async function GET() {
  try {
    const rows = await prisma.$queryRawUnsafe<CourierRow[]>(`
      SELECT DISTINCT courier_name FROM (
        SELECT courier_name FROM shipments
        UNION
        SELECT courier_name FROM shipments_cso
        UNION
        SELECT courier_name FROM shipments_crm
      ) gabungan
      WHERE courier_name IS NOT NULL AND TRIM(courier_name) <> ''
      ORDER BY courier_name ASC
    `);

    return NextResponse.json({ success: true, data: rows.map((row) => row.courier_name) });
  } catch (error: unknown) {
    console.error('[API /olahan/couriers GET]', error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Gagal mengambil daftar ekspedisi' },
      { status: 500 },
    );
  }
}
