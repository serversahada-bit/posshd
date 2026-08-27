import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

const jsonSafe = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value, (_key, item) => (typeof item === 'bigint' ? item.toString() : item))) as T;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const reconciliationId = Number(id);
    if (!reconciliationId) {
      return NextResponse.json({ status: 'error', message: 'ID tidak valid' }, { status: 400 });
    }

    const batchRows = await prisma.$queryRawUnsafe<any[]>(
      `
      SELECT r.id, r.courier_name, r.file_name, r.total_rows, r.matched_count, r.mismatch_count, r.not_found_count, r.created_at,
             COALESCE(NULLIF(u.name, ''), NULLIF(u.email, ''), 'User') as created_by_name
      FROM cod_reconciliations r
      LEFT JOIN users u ON u.id = r.created_by
      WHERE r.id = ?
      `,
      reconciliationId,
    );

    const batch = batchRows[0];
    if (!batch) {
      return NextResponse.json({ status: 'error', message: 'Riwayat tidak ditemukan' }, { status: 404 });
    }

    const items = await prisma.$queryRawUnsafe<any[]>(
      `
      SELECT id, tracking_number, reported_amount, expected_amount, difference, order_code, source_table, status
      FROM cod_reconciliation_items
      WHERE reconciliation_id = ?
      ORDER BY FIELD(status, 'mismatch', 'not_found', 'matched'), id ASC
      `,
      reconciliationId,
    );

    return NextResponse.json({ status: 'success', data: jsonSafe({ ...batch, items }) });
  } catch (error: unknown) {
    console.error('[API /reconsil_cod/[id] GET]', error);
    return NextResponse.json({ status: 'error', message: error instanceof Error ? error.message : 'Gagal memuat detail' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const reconciliationId = Number(id);
    if (!reconciliationId) {
      return NextResponse.json({ status: 'error', message: 'ID tidak valid' }, { status: 400 });
    }

    // cod_reconciliation_items has ON DELETE CASCADE on reconciliation_id, so its rows go with it.
    const deleted = await prisma.$executeRawUnsafe('DELETE FROM cod_reconciliations WHERE id = ?', reconciliationId);
    if (!deleted) {
      return NextResponse.json({ status: 'error', message: 'Riwayat tidak ditemukan' }, { status: 404 });
    }

    return NextResponse.json({ status: 'success', message: 'Riwayat berhasil dihapus.' });
  } catch (error: unknown) {
    console.error('[API /reconsil_cod/[id] DELETE]', error);
    return NextResponse.json({ status: 'error', message: error instanceof Error ? error.message : 'Gagal menghapus riwayat' }, { status: 500 });
  }
}
