import { NextResponse } from 'next/server';
import { Buffer } from 'node:buffer';

import { guessAmountColumn, guessResiColumn, parseWorkbook } from '@/lib/codReconciliation';

export const dynamic = 'force-dynamic';

const ALLOWED_EXTENSIONS = ['.xlsx', '.xls', '.csv'];

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

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

    return NextResponse.json({
      status: 'success',
      headers,
      sampleRows,
      totalRows: Math.max(rows.length - headerRowIndex - 1, 0),
      suggestedResiColumn: guessResiColumn(headers) || 1,
      suggestedAmountColumn: guessAmountColumn(headers) || 2,
    });
  } catch (error: unknown) {
    console.error('[API /reconsil_cod/preview POST]', error);
    return NextResponse.json({ status: 'error', message: error instanceof Error ? error.message : 'Gagal membaca file' }, { status: 500 });
  }
}
