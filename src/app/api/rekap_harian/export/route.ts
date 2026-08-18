import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { getRekapHarianData, parseDateKey, resolveDefaultRange } from '../_lib';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { defaultStartKey, defaultEndKey } = resolveDefaultRange();
    const startKey = parseDateKey(body?.startDate, defaultStartKey);
    const endKey = parseDateKey(body?.endDate, defaultEndKey);

    const data = await getRekapHarianData(startKey, endKey);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = '';

    const recapSheet = workbook.addWorksheet('Rekap Harian');
    const recapHeaders = ['Tanggal', 'Omset', 'Voucher Ongkir', 'Jumlah Pesanan'];
    const recapHeaderRow = recapSheet.addRow(recapHeaders);
    recapHeaderRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', family: 2, size: 10, bold: true };
    });

    for (const day of data.dailyRecap) {
      recapSheet.addRow([day.date, day.omset, day.voucherOngkir, day.orderCount]);
    }

    const totalRow = recapSheet.addRow([
      'Total',
      data.totals.omset,
      data.totals.voucherOngkir,
      data.totals.orderCount,
    ]);
    totalRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', family: 2, size: 10, bold: true };
    });

    recapSheet.getColumn(1).width = 14;
    recapSheet.getColumn(2).width = 18;
    recapSheet.getColumn(3).width = 18;
    recapSheet.getColumn(4).width = 16;

    const promoSheet = workbook.addWorksheet('Promo Digunakan');
    const promoHeaderRow = promoSheet.addRow(['Nama Promo', 'Jumlah Pemakaian']);
    promoHeaderRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', family: 2, size: 10, bold: true };
    });

    for (const promo of data.promoUsage) {
      promoSheet.addRow([promo.promoName, promo.usageCount]);
    }

    promoSheet.getColumn(1).width = 30;
    promoSheet.getColumn(2).width = 18;

    const buffer = await workbook.xlsx.writeBuffer();

    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    const timestampName = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Rekap_Harian_${timestampName}.xlsx"`,
      },
    });
  } catch (error) {
    console.error('[API /rekap_harian/export]', error);
    return NextResponse.json({ success: false, message: 'Gagal mengekspor rekap harian' }, { status: 500 });
  }
}
