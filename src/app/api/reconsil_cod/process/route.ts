import { NextResponse } from 'next/server';
import { Buffer } from 'node:buffer';

import prisma from '@/lib/db';
import { normalizeTrackingNumber, parseAmount, parseWorkbook } from '@/lib/codReconciliation';

export const dynamic = 'force-dynamic';

const ALLOWED_EXTENSIONS = ['.xlsx', '.xls', '.csv'];

type MatchResult = {
  order_code: string;
  total_payment: bigint | number | null;
  payment_method: string | null;
  source_table: 'CSO' | 'CSO_AUTO' | 'CRM';
} | null;

async function findByTrackingNumber(trackingNumber: string): Promise<MatchResult> {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
    SELECT * FROM (
      SELECT o.order_code, o.total_payment, p.payment_method, 'CSO' as source_table
      FROM shipments s
      JOIN orders o ON o.id = s.order_id
      LEFT JOIN payments p ON p.order_id = o.id
      WHERE s.tracking_number = ?

      UNION ALL

      SELECT o.order_code, o.total_payment, p.payment_method, 'CSO_AUTO' as source_table
      FROM shipments_cso s
      JOIN orders_cso o ON o.id = s.order_id
      LEFT JOIN payments_cso p ON p.order_id = o.id
      WHERE s.tracking_number = ?

      UNION ALL

      SELECT o.order_code, o.total_payment, p.payment_method, 'CRM' as source_table
      FROM shipments_crm s
      JOIN orders_crm o ON o.id = s.order_id
      LEFT JOIN payments_crm p ON p.order_id = o.id
      WHERE s.tracking_number = ?
    ) matched
    LIMIT 1
    `,
    trackingNumber,
    trackingNumber,
    trackingNumber,
  );

  return rows[0] || null;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const resiColumn = Number(formData.get('resi_column')) || 0;
    const amountColumn = Number(formData.get('amount_column')) || 0;
    const courierName = String(formData.get('courier_name') || '').trim() || null;
    const userId = Number(formData.get('user_id')) || null;

    if (!(file instanceof File)) {
      return NextResponse.json({ status: 'error', message: 'File wajib diunggah.' }, { status: 400 });
    }
    const lowerName = file.name.toLowerCase();
    if (!ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext))) {
      return NextResponse.json({ status: 'error', message: 'Format file tidak didukung. Gunakan .xlsx, .xls, atau .csv' }, { status: 400 });
    }
    if (!resiColumn || !amountColumn) {
      return NextResponse.json({ status: 'error', message: 'Kolom No Resi dan Nominal COD wajib dipilih.' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const { headerRowIndex, rows } = parseWorkbook(buffer);

    type ItemRow = {
      tracking_number: string;
      reported_amount: bigint;
      expected_amount: bigint | null;
      difference: bigint | null;
      order_code: string | null;
      source_table: string | null;
      status: 'matched' | 'mismatch' | 'not_found';
    };

    const items: ItemRow[] = [];

    for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex] || [];
      const trackingNumber = normalizeTrackingNumber(row[resiColumn - 1]);
      if (!trackingNumber) continue;

      const reportedAmount = parseAmount(row[amountColumn - 1]);
      const match = await findByTrackingNumber(trackingNumber);

      if (!match) {
        items.push({
          tracking_number: trackingNumber,
          reported_amount: reportedAmount,
          expected_amount: null,
          difference: null,
          order_code: null,
          source_table: null,
          status: 'not_found',
        });
        continue;
      }

      const expectedAmount = BigInt(match.total_payment ?? 0);
      const difference = reportedAmount - expectedAmount;

      items.push({
        tracking_number: trackingNumber,
        reported_amount: reportedAmount,
        expected_amount: expectedAmount,
        difference,
        order_code: match.order_code,
        source_table: match.source_table,
        status: difference === BigInt(0) ? 'matched' : 'mismatch',
      });
    }

    if (items.length === 0) {
      return NextResponse.json({ status: 'error', message: 'Tidak ada baris data yang bisa diproses dari file ini.' }, { status: 400 });
    }

    const matchedCount = items.filter((item) => item.status === 'matched').length;
    const mismatchCount = items.filter((item) => item.status === 'mismatch').length;
    const notFoundCount = items.filter((item) => item.status === 'not_found').length;

    const reconciliationId = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `INSERT INTO cod_reconciliations (courier_name, file_name, total_rows, matched_count, mismatch_count, not_found_count, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        courierName,
        file.name,
        items.length,
        matchedCount,
        mismatchCount,
        notFoundCount,
        userId,
      );
      const [{ id: rawBatchId }] = await tx.$queryRawUnsafe<Array<{ id: number | bigint }>>('SELECT LAST_INSERT_ID() as id');
      const batchId = Number(rawBatchId);

      for (const item of items) {
        await tx.$executeRawUnsafe(
          `INSERT INTO cod_reconciliation_items (reconciliation_id, tracking_number, reported_amount, expected_amount, difference, order_code, source_table, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          batchId,
          item.tracking_number,
          item.reported_amount.toString(),
          item.expected_amount === null ? null : item.expected_amount.toString(),
          item.difference === null ? null : item.difference.toString(),
          item.order_code,
          item.source_table,
          item.status,
        );
      }

      return batchId;
    });

    return NextResponse.json({
      status: 'success',
      message: `Berhasil memproses ${items.length} baris (${matchedCount} cocok, ${mismatchCount} selisih, ${notFoundCount} tidak ditemukan).`,
      reconciliationId,
    });
  } catch (error: unknown) {
    console.error('[API /reconsil_cod/process POST]', error);
    return NextResponse.json({ status: 'error', message: error instanceof Error ? error.message : 'Gagal memproses file' }, { status: 500 });
  }
}
