import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

const jsonSafe = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value, (_key, item) => (typeof item === 'bigint' ? item.toString() : item))) as T;

export async function GET() {
  try {
    const batches = await prisma.$queryRawUnsafe<any[]>(`
      SELECT r.id, r.courier_name, r.file_name, r.total_rows, r.matched_count, r.mismatch_count, r.not_found_count, r.created_at,
             COALESCE(NULLIF(u.name, ''), NULLIF(u.email, ''), 'User') as created_by_name
      FROM cod_reconciliations r
      LEFT JOIN users u ON u.id = r.created_by
      ORDER BY r.id DESC
      LIMIT 100
    `);

    return NextResponse.json({ status: 'success', data: jsonSafe(batches) });
  } catch (error: unknown) {
    console.error('[API /reconsil_cod GET]', error);
    return NextResponse.json({ status: 'error', message: error instanceof Error ? error.message : 'Gagal memuat riwayat' }, { status: 500 });
  }
}
