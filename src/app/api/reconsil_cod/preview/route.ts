import { NextResponse } from 'next/server';
import { Buffer } from 'node:buffer';

import prisma from '@/lib/db';
import { findColumnByHeaderName, guessAmountColumn, guessDisbursedAtColumn, guessResiColumn, parseWorkbook } from '@/lib/codReconciliation';

export const dynamic = 'force-dynamic';

const ALLOWED_EXTENSIONS = ['.xlsx', '.xls', '.csv'];

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const courierName = String(formData.get('courier_name') || '').trim();

    if (!(file instanceof File)) {
      return NextResponse.json({ status: 'error', message: 'File wajib diunggah.' }, { status: 400 });
    }

    const lowerName = file.name.toLowerCase();
    if (!ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext))) {
      return NextResponse.json({ status: 'error', message: 'Format file tidak didukung. Gunakan .xlsx, .xls, atau .csv' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const { headerRowIndex, headers, rows } = parseWorkbook(buffer);

    const sampleRows = rows
      .slice(headerRowIndex + 1, headerRowIndex + 6)
      .map((row) => headers.map((_, index) => String(row[index] ?? '').trim()));

    let suggestedResiColumn = guessResiColumn(headers) || 1;
    let suggestedAmountColumn = guessAmountColumn(headers) || 2;
    // Unlike resi/amount, "Tanggal Cair" isn't every courier's report — 0 means "-- Tidak
    // Ada --" in the UI rather than forcing a guess onto an unrelated column.
    let suggestedDisbursedAtColumn = guessDisbursedAtColumn(headers);

    if (courierName) {
      const mapping = await prisma.cod_courier_column_mappings.findUnique({ where: { courier_name: courierName } });
      if (mapping) {
        const resiMatch = findColumnByHeaderName(headers, mapping.resi_header);
        const amountMatch = findColumnByHeaderName(headers, mapping.amount_header);
        const disbursedAtMatch = findColumnByHeaderName(headers, mapping.disbursed_at_header);
        if (resiMatch) suggestedResiColumn = resiMatch;
        if (amountMatch) suggestedAmountColumn = amountMatch;
        if (disbursedAtMatch) suggestedDisbursedAtColumn = disbursedAtMatch;
      }
    }

    return NextResponse.json({
      status: 'success',
      headers,
      sampleRows,
      totalRows: Math.max(rows.length - headerRowIndex - 1, 0),
      suggestedResiColumn,
      suggestedAmountColumn,
      suggestedDisbursedAtColumn,
    });
  } catch (error: unknown) {
    console.error('[API /reconsil_cod/preview POST]', error);
    return NextResponse.json({ status: 'error', message: error instanceof Error ? error.message : 'Gagal membaca file' }, { status: 500 });
  }
}
