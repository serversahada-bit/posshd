import { NextRequest, NextResponse } from 'next/server';

import prisma from '@/lib/db';
import { parseTariffPrice, TARIFF_PRICE_RULE } from '@/lib/shippingPrice';
import * as xlsx from 'xlsx';

export const dynamic = 'force-dynamic';

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Terjadi kesalahan');
const PAGE_SIZE = 50;
const IMPORT_BATCH_SIZE = 250;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const page = Math.max(1, Number(searchParams.get('page') || 1));
    const search = (searchParams.get('search') || '').trim();

    const where = search
      ? {
          OR: [
            { nama_tujuan: { contains: search } },
            { kurir: { contains: search } },
            { kode_asal: { contains: search } },
          ],
        }
      : {};

    const [totalRows, items, couriers] = await Promise.all([
      prisma.tarif_pengiriman.count({ where }),
      prisma.tarif_pengiriman.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.couriers.findMany({
        distinct: ['courier_name'],
        select: { courier_name: true },
        orderBy: { courier_name: 'asc' },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        items,
        couriers,
        page,
        totalPages: Math.max(1, Math.ceil(totalRows / PAGE_SIZE)),
        totalRows,
      },
    });
  } catch (error: unknown) {
    console.error('[API /shipping/tariffs GET]', error);
    return NextResponse.json({ success: false, message: getErrorMessage(error) || 'Gagal mengambil data tarif ongkir' }, { status: 500 });
  }
}

const normalizeOriginCode = (value: string) => {
  const cleanValue = value.trim();
  const compactValue = cleanValue.replace(/\s+/g, ' ');

  if (/^madiun/i.test(compactValue) || compactValue === '39900') return 'Madiun (39900)';
  if (/^bekasi/i.test(compactValue) || /^beka i/i.test(compactValue) || compactValue === '6573') return 'Bekasi (6573)';
  if (/^jakarta/i.test(compactValue) || compactValue === '17665') return 'Jakarta (17665)';

  return compactValue;
};

type SkippedRow = { row: number; reason: string };

class ImportValidationError extends Error {
  constructor(message: string, public skipped: SkippedRow[]) {
    super(message);
  }
}

// Batas panjang mengikuti kolom VARCHAR di tabel tarif_pengiriman.
const MAX_LENGTH = { kode_asal: 50, nama_tujuan: 255, kurir: 20, estimasi: 100, out_of_coverage: 50 };

const cellText = (value: unknown) => (value === null || value === undefined ? '' : String(value).trim());

async function handleImport(formData: FormData) {
  const file = formData.get('file_csv');
  const truncateTable = formData.get('truncate_table') === '1';

  if (!(file instanceof File)) {
    throw new Error('File gagal diunggah atau belum dipilih.');
  }

  const buffer = await file.arrayBuffer();
  // raw: true supaya isi CSV dibaca apa adanya — tanpa ini "10.000" terbaca 10 dan "2-3" terbaca tanggal.
  const workbook = xlsx.read(buffer, { type: 'buffer', raw: true });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // Convert to array of arrays
  const jsonData = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as unknown[][];

  if (jsonData.length <= 1) {
    throw new Error('File tidak memiliki data untuk diimpor.');
  }

  // Skip header row
  const rows = jsonData.slice(1);
  const importRows: Array<{
    kode_asal: string;
    kode_tujuan: string;
    nama_tujuan: string;
    kurir: string;
    harga: string;
    estimasi: string;
    out_of_coverage: string;
  }> = [];
  const skipped: SkippedRow[] = [];

  rows.forEach((parts, index) => {
    const rowNumber = index + 2; // +1 header, +1 karena baris di file mulai dari 1
    if (parts.every((cell) => cellText(cell) === '')) return;

    // ID, Kode Asal, Nama Tujuan, Kurir, Harga, Estimasi, OOC
    const kodeAsal = normalizeOriginCode(cellText(parts[1]));
    const namaTujuan = cellText(parts[2]);
    const kurir = cellText(parts[3]).toUpperCase();
    const rawHarga = cellText(parts[4]);
    const estimasi = cellText(parts[5]);
    const outOfCoverage = cellText(parts[6]);

    const harga = parseTariffPrice(parts[4]);
    let reason = '';
    if (!namaTujuan) reason = 'Nama Tujuan kosong';
    else if (!kurir) reason = 'Kurir kosong';
    else if (harga === null) reason = rawHarga ? `harga "${rawHarga}" tidak valid` : 'harga kosong';
    else if (kodeAsal.length > MAX_LENGTH.kode_asal) reason = `Kode Asal lebih dari ${MAX_LENGTH.kode_asal} karakter`;
    else if (namaTujuan.length > MAX_LENGTH.nama_tujuan) reason = `Nama Tujuan lebih dari ${MAX_LENGTH.nama_tujuan} karakter`;
    else if (kurir.length > MAX_LENGTH.kurir) reason = `nama kurir "${kurir}" lebih dari ${MAX_LENGTH.kurir} karakter`;
    else if (estimasi.length > MAX_LENGTH.estimasi) reason = `Estimasi lebih dari ${MAX_LENGTH.estimasi} karakter`;
    else if (outOfCoverage.length > MAX_LENGTH.out_of_coverage) reason = `OOC lebih dari ${MAX_LENGTH.out_of_coverage} karakter`;

    if (reason) {
      skipped.push({ row: rowNumber, reason });
      return;
    }

    importRows.push({
      kode_asal: kodeAsal,
      kode_tujuan: kodeAsal,
      nama_tujuan: namaTujuan,
      kurir,
      harga: String(harga),
      estimasi,
      out_of_coverage: outOfCoverage,
    });
  });

  if (importRows.length === 0) {
    throw new ImportValidationError(
      'Tidak ada baris valid yang ditemukan dalam file. Pastikan urutan kolom sesuai standar (ID, Kode Asal, Nama Tujuan, Kurir, Harga, Estimasi, OOC).',
      skipped,
    );
  }

  // Satu transaksi: kalau satu batch gagal, data lama (termasuk yang dikosongkan) tidak ikut hilang.
  await prisma.$transaction(async (tx) => {
    if (truncateTable) {
      await tx.tarif_pengiriman.deleteMany();
    }

    for (let index = 0; index < importRows.length; index += IMPORT_BATCH_SIZE) {
      await tx.tarif_pengiriman.createMany({
        data: importRows.slice(index, index + IMPORT_BATCH_SIZE),
      });
    }
  }, { timeout: 10 * 60 * 1000 });

  return { count: importRows.length, skipped };
}

export async function POST(request: NextRequest) {
  try {
    const isMultipart = request.headers.get('content-type')?.includes('multipart/form-data');

    if (isMultipart) {
      const formData = await request.formData();
      const action = String(formData.get('action') || '');

      if (action === 'import_csv') {
        try {
          const { count, skipped } = await handleImport(formData);
          const skippedNote = skipped.length > 0 ? ` ${skipped.length} baris dilewati karena tidak valid.` : '';
          return NextResponse.json({
            success: true,
            message: `Berhasil mengimpor ${count} baris tarif ongkir.${skippedNote}`,
            skipped,
          });
        } catch (error: unknown) {
          if (error instanceof ImportValidationError) {
            return NextResponse.json({ success: false, message: error.message, skipped: error.skipped }, { status: 400 });
          }
          throw error;
        }
      }

      return NextResponse.json({ success: false, message: 'Action multipart tidak valid' }, { status: 400 });
    }

    const body = await request.json();
    const action = String(body?.action || '');

    if (action === 'truncate') {
      await prisma.tarif_pengiriman.deleteMany();
      return NextResponse.json({ success: true, message: 'Semua data tarif ongkir berhasil dikosongkan.' });
    }

    if (action === 'create') {
      const kode_asal = normalizeOriginCode(String(body?.kode_asal || '').trim());
      const kode_tujuan = kode_asal;
      const nama_tujuan = String(body?.nama_tujuan || '').trim();
      const kurir = String(body?.kurir || '').trim();
      const harga = parseTariffPrice(body?.harga);
      const estimasi = String(body?.estimasi || '').trim();
      const out_of_coverage = String(body?.out_of_coverage || '').trim();

      if (!nama_tujuan || !kurir || String(body?.harga ?? '').trim() === '') {
        return NextResponse.json({ success: false, message: 'Nama Tujuan, Kurir, dan Harga wajib diisi.' }, { status: 400 });
      }

      if (harga === null) {
        return NextResponse.json({ success: false, message: TARIFF_PRICE_RULE }, { status: 400 });
      }

      await prisma.tarif_pengiriman.create({
        data: {
          kode_asal,
          kode_tujuan,
          nama_tujuan,
          kurir: kurir.toUpperCase(),
          harga: String(harga),
          estimasi,
          out_of_coverage,
        },
      });

      return NextResponse.json({ success: true, message: 'Tarif ongkir baru berhasil ditambahkan.' });
    }

    if (action === 'update') {
      const id = Number(body?.id || 0);
      const kode_asal = normalizeOriginCode(String(body?.kode_asal || '').trim());
      const kode_tujuan = kode_asal;
      const nama_tujuan = String(body?.nama_tujuan || '').trim();
      const kurir = String(body?.kurir || '').trim();
      const harga = parseTariffPrice(body?.harga);
      const estimasi = String(body?.estimasi || '').trim();
      const out_of_coverage = String(body?.out_of_coverage || '').trim();

      if (!id || !nama_tujuan || !kurir || String(body?.harga ?? '').trim() === '') {
        return NextResponse.json({ success: false, message: 'Nama Tujuan, Kurir, dan Harga wajib diisi.' }, { status: 400 });
      }

      if (harga === null) {
        return NextResponse.json({ success: false, message: TARIFF_PRICE_RULE }, { status: 400 });
      }

      await prisma.tarif_pengiriman.update({
        where: { id },
        data: {
          kode_asal,
          kode_tujuan,
          nama_tujuan,
          kurir: kurir.toUpperCase(),
          harga: String(harga),
          estimasi,
          out_of_coverage,
        },
      });

      return NextResponse.json({ success: true, message: 'Informasi tarif ongkir berhasil diperbarui.' });
    }

    if (action === 'delete') {
      const id = Number(body?.id || 0);
      if (!id) {
        return NextResponse.json({ success: false, message: 'ID tarif wajib diisi.' }, { status: 400 });
      }

      await prisma.tarif_pengiriman.delete({ where: { id } });
      return NextResponse.json({ success: true, message: 'Tarif ongkir berhasil dihapus.' });
    }

    if (action === 'bulk_update_nama') {
      const selectedIds = Array.isArray(body?.selected_ids) ? body.selected_ids.map((value: unknown) => Number(value)).filter((value: number) => value > 0) : [];
      const findText = String(body?.find_text || '').trim();
      const replaceText = String(body?.replace_text || '');

      if (selectedIds.length === 0) {
        return NextResponse.json({ success: false, message: 'Pilih minimal satu data tarif ongkir.' }, { status: 400 });
      }

      if (!findText) {
        return NextResponse.json({ success: false, message: 'Teks yang ingin diganti wajib diisi.' }, { status: 400 });
      }

      const items = await prisma.tarif_pengiriman.findMany({
        where: { id: { in: selectedIds } },
      });

      await prisma.$transaction(
        items.map((item) =>
          prisma.tarif_pengiriman.update({
            where: { id: item.id },
            data: {
              nama_tujuan: (item.nama_tujuan || '').replaceAll(findText, replaceText),
            },
          })
        )
      );

      return NextResponse.json({ success: true, message: `Berhasil memperbarui nama tujuan untuk ${selectedIds.length} tarif ongkir.` });
    }

    return NextResponse.json({ success: false, message: 'Action tidak valid' }, { status: 400 });
  } catch (error: unknown) {
    console.error('[API /shipping/tariffs POST]', error);
    return NextResponse.json({ success: false, message: getErrorMessage(error) || 'Gagal memproses tarif ongkir' }, { status: 500 });
  }
}

