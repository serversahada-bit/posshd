import ExcelJS from 'exceljs';

import prisma from '@/lib/db';
import { formatPaymentAccount, requireOrderImportAccess } from '@/lib/orderImport';
import { IMPORT_COLUMNS, ITEM_TYPES, MAX_ITEMS_PER_ROW, ORDER_IMPORT_MAX_ORDERS, ORDER_IMPORT_TYPES, PAYMENT_METHOD_OPTIONS, waCountryLabel } from '@/lib/orderImportShared';
import { buildCourierAliases, normalizeCourierKey } from '@/lib/shippingRates';
import { WA_COUNTRIES, getWaCountry } from '@/lib/whatsappNumber';

export const dynamic = 'force-dynamic';

const TEMPLATE_ROWS = ORDER_IMPORT_MAX_ORDERS;
const HEADER_FILLS: Record<string, string> = { ya: 'FFE9D5FF', kondisional: 'FFFEF3C7', tidak: 'FFF1F5F9' };

const columnLetter = (index: number) => {
  let letter = '';
  let value = index;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    value = Math.floor((value - 1) / 26);
  }
  return letter;
};

// GET /api/orders_import/template — template Excel Import Pesanan, lengkap dengan dropdown dari data master.
export async function GET() {
  try {
    const denied = await requireOrderImportAccess();
    if (denied) return denied;

    const [products, gifts, bundles, warehouses, couriers, tariffCouriers, paymentAccounts, noPaymentMethods, advertisers, adSources, promos, destinations] = await Promise.all([
      prisma.products.findMany({ where: { status: 'active' }, select: { product_name: true }, orderBy: { product_name: 'asc' } }),
      prisma.gifts.findMany({ where: { status: 'active' }, select: { gift_name: true }, orderBy: { gift_name: 'asc' } }),
      prisma.product_bundles.findMany({ where: { status: 'active' }, select: { bundle_name: true }, orderBy: { bundle_name: 'asc' } }),
      // Hanya gudang yang aktif untuk salah satu jenis pesanan yang bisa di-import (Endorse tidak ada di import).
      prisma.$queryRawUnsafe<Array<{ warehouse_name: string }>>(
        "SELECT warehouse_name FROM warehouses WHERE order_channels REGEXP '(^|,)(akuisisi|cso|crm|resend)(,|$)' ORDER BY distance_km ASC",
      ),
      prisma.couriers.findMany({ select: { courier_name: true, code: true }, orderBy: { courier_name: 'asc' } }),
      prisma.$queryRawUnsafe<Array<{ kurir: string }>>('SELECT DISTINCT kurir FROM tarif_pengiriman WHERE kurir IS NOT NULL'),
      prisma.payment_accounts.findMany({ select: { bank_name: true, account_name: true, account_number: true }, orderBy: { bank_name: 'asc' } }),
      prisma.$queryRawUnsafe<Array<{ method_name: string }>>('SELECT method_name FROM no_payment_methods WHERE is_active = 1 ORDER BY method_name ASC'),
      prisma.advertisers.findMany({ where: { status: 'active' }, select: { name: true }, orderBy: { name: 'asc' } }),
      prisma.ad_sources.findMany({ where: { status: 'active' }, select: { name: true }, orderBy: { name: 'asc' } }),
      prisma.promos.findMany({ where: { status: 'active' }, select: { promo_name: true }, orderBy: { promo_name: 'asc' } }),
      prisma.$queryRawUnsafe<Array<{ nama_tujuan: string }>>('SELECT DISTINCT nama_tujuan FROM tarif_pengiriman WHERE nama_tujuan IS NOT NULL ORDER BY nama_tujuan ASC'),
    ]);

    // Hanya ekspedisi yang benar-benar punya tarif (nama di tarif bisa beda dengan master, mis. "POS" vs "POS REGULER").
    const { courierAliasMap, courierDisplayNames } = buildCourierAliases(couriers);
    const tariffCourierNames = new Set(tariffCouriers.map((row) => courierAliasMap.get(normalizeCourierKey(row.kurir))).filter(Boolean));
    const courierOptions = courierDisplayNames.filter((name) => tariffCourierNames.has(name));

    const masterLists: Array<{ title: string; values: string[]; columnKeys: string[] }> = [
      { title: 'Jenis Pesanan', values: [...ORDER_IMPORT_TYPES], columnKeys: ['jenis'] },
      { title: 'Tipe Item', values: [...ITEM_TYPES], columnKeys: ['item_type'] },
      { title: 'Metode Bayar', values: [...PAYMENT_METHOD_OPTIONS], columnKeys: ['payment_method'] },
      { title: 'Semua Item', values: [...new Set([...products.map((row) => row.product_name), ...bundles.map((row) => row.bundle_name), ...gifts.map((row) => row.gift_name)])], columnKeys: ['item_name'] },
      { title: 'Produk', values: products.map((row) => row.product_name), columnKeys: [] },
      { title: 'Bundling', values: bundles.map((row) => row.bundle_name), columnKeys: [] },
      { title: 'Hadiah', values: gifts.map((row) => row.gift_name), columnKeys: [] },
      { title: 'Gudang', values: warehouses.map((row) => row.warehouse_name), columnKeys: ['warehouse'] },
      { title: 'Ekspedisi', values: courierOptions, columnKeys: ['courier'] },
      { title: 'Rekening Tujuan', values: paymentAccounts.map(formatPaymentAccount), columnKeys: ['payment_account'] },
      { title: 'Alasan Free', values: noPaymentMethods.map((row) => row.method_name), columnKeys: ['free_reason'] },
      { title: 'Advertiser', values: advertisers.map((row) => row.name), columnKeys: ['advertiser'] },
      { title: 'Sumber Iklan', values: adSources.map((row) => row.name), columnKeys: ['ad_source'] },
      { title: 'Promo', values: promos.map((row) => row.promo_name), columnKeys: [] },
      { title: 'Kode Negara', values: WA_COUNTRIES.map(waCountryLabel), columnKeys: ['whatsapp_country'] },
    ];

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'GreatSales';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Pesanan', { views: [{ state: 'frozen', ySplit: 1 }] });
    const guide = workbook.addWorksheet('Panduan');
    const master = workbook.addWorksheet('Master');
    const destinationSheet = workbook.addWorksheet('Tujuan');

    // --- Sheet Pesanan ---
    sheet.columns = IMPORT_COLUMNS.map((column) => ({ header: column.header, key: column.key, width: column.width }));
    const headerRow = sheet.getRow(1);
    headerRow.height = 22;
    IMPORT_COLUMNS.forEach((column, index) => {
      const cell = headerRow.getCell(index + 1);
      cell.font = { bold: true, color: { argb: 'FF1E293B' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILLS[column.required] } };
      cell.alignment = { vertical: 'middle' };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
      cell.note = `${column.required === 'ya' ? 'WAJIB. ' : column.required === 'kondisional' ? 'WAJIB BERSYARAT. ' : 'Opsional. '}${column.note}`;
    });

    // Kolom teks supaya angka 0 di depan nomor WA / ID order tidak hilang.
    ['whatsapp', 'old_order_id'].forEach((key) => {
      sheet.getColumn(key).numFmt = '@';
    });

    // --- Sheet Master (sumber dropdown) ---
    const validationRanges = new Map<string, string>();
    masterLists.forEach((list, index) => {
      const colNumber = index + 1;
      const letter = columnLetter(colNumber);
      master.getColumn(colNumber).width = Math.min(Math.max(list.title.length, ...list.values.map((value) => value.length), 10) + 2, 50);
      const titleCell = master.getCell(1, colNumber);
      titleCell.value = list.title;
      titleCell.font = { bold: true };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9D5FF' } };
      list.values.forEach((value, valueIndex) => {
        master.getCell(valueIndex + 2, colNumber).value = value;
      });
      if (list.values.length > 0) {
        list.columnKeys.forEach((key) => validationRanges.set(key, `Master!$${letter}$2:$${letter}$${list.values.length + 1}`));
      }
    });

    // --- Sheet Tujuan ---
    destinationSheet.getColumn(1).width = 60;
    destinationSheet.getCell(1, 1).value = 'Tujuan (salin persis ke kolom Tujuan)';
    destinationSheet.getCell(1, 1).font = { bold: true };
    destinations.forEach((row, index) => {
      destinationSheet.getCell(index + 2, 1).value = row.nama_tujuan;
    });
    if (destinations.length > 0) {
      validationRanges.set('destination', `Tujuan!$A$2:$A$${destinations.length + 1}`);
    }

    // Dropdown pakai gaya "warning": user tetap boleh mengetik/menempel nilai lain (mis. kode gudang),
    // validasi sebenarnya tetap dilakukan saat preview.
    IMPORT_COLUMNS.forEach((column, index) => {
      const range = validationRanges.get(column.itemField || column.key);
      if (!range) return;
      const colNumber = index + 1;
      for (let rowNumber = 2; rowNumber <= TEMPLATE_ROWS + 1; rowNumber += 1) {
        sheet.getCell(rowNumber, colNumber).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [range],
          showErrorMessage: true,
          errorStyle: 'warning',
          errorTitle: column.header,
          error: `Nilai tidak ada di daftar ${column.header}. Lanjutkan hanya jika Anda yakin.`,
        };
      }
    });

    // --- Sheet Panduan ---
    guide.getColumn(1).width = 22;
    guide.getColumn(2).width = 16;
    guide.getColumn(3).width = 90;
    const addGuideRow = (values: Array<string | number>, options: { bold?: boolean; fill?: string; size?: number } = {}) => {
      const row = guide.addRow(values);
      row.eachCell((cell) => {
        cell.font = { bold: options.bold, size: options.size };
        cell.alignment = { wrapText: true, vertical: 'top' };
        if (options.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: options.fill } };
      });
      return row;
    };

    addGuideRow(['Panduan Import Pesanan'], { bold: true, size: 14 });
    addGuideRow([]);
    [
      '1. Isi sheet "Pesanan" mulai baris 2. Satu baris = satu pesanan; jumlah pesanan dihitung otomatis dari baris yang terisi.',
      `2. Item ditulis ke kanan: Item 1, Item 2, ... sampai Item ${MAX_ITEMS_PER_ROW} (maksimal ${MAX_ITEMS_PER_ROW} item per pesanan, termasuk hadiah). Kosongkan slot yang tidak dipakai.`,
      '3. Harga, ongkir, fee COD & total bayar DIHITUNG SISTEM dari data master & tarif — tidak perlu diisi.',
      '4. Upload file di menu Buat Pesanan > Import Excel. Periksa hasil di halaman Preview sebelum disimpan.',
      '5. Untuk Transfer & Free, upload bukti di halaman Preview. Beri nama file sesuai No WhatsApp (mis. 081234567890.jpg) atau nomor baris Excel (mis. 5.jpg) agar otomatis terpasang.',
      '6. Kolom berwarna ungu wajib, kuning wajib bersyarat, abu-abu opsional. Arahkan kursor ke judul kolom untuk keterangan.',
      '7. Isi kolom Tujuan persis seperti daftar di sheet "Tujuan" (gunakan Ctrl+F untuk mencari kecamatan).',
      '8. Nomor WhatsApp luar negeri: pilih negaranya di kolom Kode Negara (mis. Hong Kong (+852)), lalu isi No WhatsApp tanpa kode negara (mis. 91234567). Kosongkan Kode Negara untuk nomor Indonesia.',
    ].forEach((text) => {
      const row = addGuideRow([text]);
      guide.mergeCells(`A${row.number}:C${row.number}`);
    });
    addGuideRow([]);
    addGuideRow(['Kolom', 'Wajib', 'Keterangan'], { bold: true, fill: 'FFE9D5FF' });
    IMPORT_COLUMNS.filter((column) => !column.slot || column.slot === 1).forEach((column) => {
      addGuideRow([column.header, column.required === 'ya' ? 'Ya' : column.required === 'kondisional' ? 'Bersyarat' : 'Tidak', column.note]);
    });
    addGuideRow([`Item 2 – ${MAX_ITEMS_PER_ROW}`, 'Tidak', `Kolom Tipe Item / Nama Item / Qty / Diskon Item bernomor 2 sampai ${MAX_ITEMS_PER_ROW}, aturannya sama dengan Item 1.`]);

    addGuideRow([]);
    addGuideRow(['Contoh pengisian (baris 1 = 2 produk COD, baris 2 = Transfer produk + hadiah dengan nomor Hong Kong, baris 3 = bundling)'], { bold: true });
    const exampleProduct = products[0]?.product_name || 'Nama Produk';
    const exampleProduct2 = products[1]?.product_name || exampleProduct;
    const exampleGift = gifts[0]?.gift_name || 'Nama Hadiah';
    const exampleBundle = bundles[0]?.bundle_name || 'Nama Bundling';
    const exampleWarehouse = warehouses[0]?.warehouse_name || 'Nama Gudang';
    const exampleCourier = masterLists.find((list) => list.title === 'Ekspedisi')?.values[0] || 'JNE';
    const exampleDestination = destinations[0]?.nama_tujuan || 'PROVINSI,KOTA,KECAMATAN';
    const exampleAccount = paymentAccounts[0] ? formatPaymentAccount(paymentAccounts[0]) : '';
    const exampleAdvertiser = advertisers[0]?.name || '';
    const exampleAdSource = adSources[0]?.name || '';
    const examples: Array<Record<string, string | number>> = [
      { jenis: 'Akuisisi', customer_name: 'Budi Santoso', whatsapp: '081234567890', address: 'Jl. Melati No. 5 RT 01/02', destination: exampleDestination, warehouse: exampleWarehouse, courier: exampleCourier, payment_method: 'COD', advertiser: exampleAdvertiser, ad_source: exampleAdSource, item_type_1: 'Produk', item_name_1: exampleProduct, qty_1: 2, item_type_2: 'Produk', item_name_2: exampleProduct2, qty_2: 1 },
      { jenis: 'CSO', customer_name: 'Siti Aminah', whatsapp: '91234567', whatsapp_country: waCountryLabel(getWaCountry('HK')), address: 'Perum Griya Asri Blok C2', destination: exampleDestination, warehouse: exampleWarehouse, courier: exampleCourier, payment_method: 'Transfer', payment_account: exampleAccount, advertiser: exampleAdvertiser, ad_source: exampleAdSource, item_type_1: 'Produk', item_name_1: exampleProduct, qty_1: 1, item_type_2: 'Hadiah', item_name_2: exampleGift, qty_2: 1 },
      { jenis: 'CRM', customer_name: 'Agus Salim', whatsapp: '081398765432', address: 'Jl. Kenanga 12', destination: exampleDestination, warehouse: exampleWarehouse, courier: exampleCourier, payment_method: 'COD', item_type_1: 'Bundling', item_name_1: exampleBundle, qty_1: 1 },
    ];
    addGuideRow(IMPORT_COLUMNS.map((column) => column.header), { bold: true, fill: 'FFF1F5F9' });
    examples.forEach((example) => addGuideRow(IMPORT_COLUMNS.map((column) => example[column.key] ?? '')));

    const buffer = await workbook.xlsx.writeBuffer();
    return new Response(buffer as ArrayBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="Template_Import_Pesanan.xlsx"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: unknown) {
    console.error('[API /orders_import/template GET]', error);
    return Response.json(
      { status: 'error', message: error instanceof Error ? error.message : 'Gagal membuat template' },
      { status: 500 },
    );
  }
}
