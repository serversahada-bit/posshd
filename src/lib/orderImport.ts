import ExcelJS from 'exceljs';
import { cookies } from 'next/headers';

import prisma from '@/lib/db';
import { parseTariffPrice } from '@/lib/shippingPrice';
import { calculateShippingMultiplier, getCourierWeightRules } from '@/lib/shippingWeight';
import { ORIGINS, ORIGIN_CODES, buildCourierAliases, getOriginByWarehouseId, normalizeCourierKey, type ShippingOrigin } from '@/lib/shippingRates';
import {
  IMPORT_COLUMNS,
  MAX_ITEMS_PER_ROW,
  ORDER_FIELD_KEYS,
  ORDER_IMPORT_TYPES,
  PAYMENT_METHOD_LABELS,
  normalizeHeader,
  resolveImportWhatsapp,
  whatsappVariants,
  type ImportItemInput,
  type ImportOrderInput,
  type ImportOrderPreview,
  type ImportPreviewItem,
  type OrderFieldKey,
  type OrderImportType,
} from '@/lib/orderImportShared';

// ---------------------------------------------------------------------------
// Hak akses — sama dengan menu "Buat Pesanan" di Sidebar (roleMapping + permission).
// ---------------------------------------------------------------------------

const ORDER_ROLES = ['admin', 'owner', 'cs', 'cs_crm'];

type AccessUserRow = { role: string | null; permissions: string | null };

const parsePermissions = (value: string | null): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};

// Mengembalikan Response 401/403 jika user tidak boleh membuat pesanan, atau null jika boleh.
export async function requireOrderImportAccess(): Promise<Response | null> {
  const cookieStore = await cookies();
  const userId = Number(cookieStore.get('sahada_user_id')?.value || 0);

  if (!userId) {
    return Response.json({ status: 'error', message: 'Silakan login terlebih dahulu.' }, { status: 401 });
  }

  const rows = await prisma.$queryRawUnsafe<AccessUserRow[]>('SELECT role, permissions FROM users WHERE id = ? LIMIT 1', userId);
  const user = rows[0];

  if (!user) {
    return Response.json({ status: 'error', message: 'Silakan login terlebih dahulu.' }, { status: 401 });
  }

  if (ORDER_ROLES.includes(user.role || 'cs') || parsePermissions(user.permissions).includes('buat_pesanan')) {
    return null;
  }

  return Response.json({ status: 'error', message: 'Anda tidak memiliki akses Buat Pesanan.' }, { status: 403 });
}

// ---------------------------------------------------------------------------
// Membaca file Excel
// ---------------------------------------------------------------------------

const REQUIRED_HEADERS = ['jenis', 'customer_name', 'whatsapp', 'address', 'destination', 'warehouse', 'courier', 'payment_method', 'item_name_1', 'qty_1'];
const ITEM_SLOTS = Array.from({ length: MAX_ITEMS_PER_ROW }, (_, index) => index + 1);

const cellText = (cell: ExcelJS.Cell): string => {
  const value = cell.value;
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((part) => part.text).join('').trim();
    if ('formula' in value || 'sharedFormula' in value) {
      const result = (value as ExcelJS.CellFormulaValue).result;
      return result === null || result === undefined || typeof result === 'object' ? '' : String(result).trim();
    }
    if ('text' in value) return String(value.text).trim();
    return '';
  }
  return String(value).trim();
};

export async function parseOrderImportWorkbook(buffer: ArrayBuffer): Promise<ImportOrderInput[]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw new Error('File tidak bisa dibaca. Pastikan formatnya .xlsx (gunakan template dari tombol "Download Template").');
  }

  const sheet = workbook.getWorksheet('Pesanan') || workbook.worksheets[0];
  if (!sheet) {
    throw new Error('File Excel tidak memiliki sheet.');
  }

  const headerLookup = new Map<string, string>();
  IMPORT_COLUMNS.forEach((column) => {
    [column.header, column.key, ...(column.aliases || [])].forEach((label) => headerLookup.set(normalizeHeader(label), column.key));
  });

  const columnByKey = new Map<string, number>();
  let hasLegacyRefColumn = false;
  sheet.getRow(1).eachCell((cell, colNumber) => {
    const header = normalizeHeader(cellText(cell));
    if (header === 'ref') hasLegacyRefColumn = true;
    const key = headerLookup.get(header);
    if (key && !columnByKey.has(key)) columnByKey.set(key, colNumber);
  });

  // Template lama memakai kolom Ref (1 pesanan bisa beberapa baris); dibaca dengan format baru
  // hasilnya salah, jadi minta template terbaru.
  if (hasLegacyRefColumn) {
    throw new Error('File ini memakai template lama (ada kolom Ref). Download template terbaru: 1 baris = 1 pesanan, item ditulis ke kanan.');
  }

  const missingHeaders = REQUIRED_HEADERS.filter((key) => !columnByKey.has(key));
  if (missingHeaders.length > 0) {
    const labels = missingHeaders.map((key) => IMPORT_COLUMNS.find((column) => column.key === key)?.header || key);
    throw new Error(`Kolom berikut tidak ditemukan di baris judul: ${labels.join(', ')}. Gunakan template dari tombol "Download Template".`);
  }

  const read = (row: ExcelJS.Row, key: string) => {
    const colNumber = columnByKey.get(key);
    return colNumber ? cellText(row.getCell(colNumber)) : '';
  };

  const orders: ImportOrderInput[] = [];

  // 1 baris = 1 pesanan; baris yang kosong semua dilewati.
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const values = IMPORT_COLUMNS.map((column) => read(row, column.key));
    if (values.every((value) => !value)) continue;

    const items: ImportItemInput[] = [];
    for (const slot of ITEM_SLOTS) {
      const item: ImportItemInput = {
        slot,
        item_type: read(row, `item_type_${slot}`),
        item_name: read(row, `item_name_${slot}`),
        qty: read(row, `qty_${slot}`),
        item_discount: read(row, `item_discount_${slot}`),
      };
      if (item.item_type || item.item_name || item.qty || item.item_discount) {
        items.push(item);
      }
    }

    orders.push({
      row: rowNumber,
      fields: Object.fromEntries(ORDER_FIELD_KEYS.map((key) => [key, read(row, key)])) as Record<OrderFieldKey, string>,
      items,
    });
  }

  return orders;
}

// ---------------------------------------------------------------------------
// Data master
// ---------------------------------------------------------------------------

const normKey = (value: string | null | undefined) => String(value || '').trim().replace(/\s+/g, ' ').toUpperCase();
const normDestination = (value: string | null | undefined) =>
  String(value || '').toUpperCase().split(',').map((part) => part.trim().replace(/\s+/g, ' ')).join(',');

type ProductRow = { id: number; product_name: string; sku: string | null; price: number; weight_gram: number };
type GiftRow = { id: number; gift_name: string; sku: string | null; weight_gram: number };
type BundleRow = { id: number; bundle_name: string; sku: string | null; price: number; components: Array<{ product: ProductRow; qty: number }> };
type CourierRate = { price: number | null; out_of_coverage: string };

export type ImportContext = {
  products: Map<string, ProductRow>;
  gifts: Map<string, GiftRow>;
  bundles: Map<string, BundleRow>;
  warehouses: Array<{ id: number; warehouse_name: string; code: string | null }>;
  courierAliasMap: Map<string, string>;
  courierDisplayNames: string[];
  paymentAccounts: Array<{ id: number; bank_name: string | null; account_name: string | null; account_number: string | null }>;
  noPaymentMethods: Array<{ id: number; method_name: string; no_shipping_cost: boolean }>;
  advertisers: Map<string, string>;
  adSources: Map<string, string>;
  promos: Map<string, { id: number; promo_name: string }>;
  destinations: Map<string, string>;
  weightSettings: { base_weight_gram: number | null; extra_weight_step_gram: number | null; rounding_tolerance_gram: number | null };
  courierWeightRules: Awaited<ReturnType<typeof getCourierWeightRules>>;
  productStock: Map<string, number>;
  giftStock: Map<string, number>;
  customersByWhatsapp: Map<string, string>;
  tariffs: Map<string, Record<string, CourierRate>>;
};

export const formatPaymentAccount = (account: { bank_name: string | null; account_name: string | null; account_number: string | null }) =>
  `${account.bank_name || '-'} - ${account.account_name || '-'} (${account.account_number || '-'})`;

const addKeys = <T>(map: Map<string, T>, value: T, ...keys: Array<string | null | undefined>) => {
  keys.forEach((key) => {
    const normalized = normKey(key);
    if (normalized && !map.has(normalized)) map.set(normalized, value);
  });
};

// Memuat semua master yang dibutuhkan validasi. Data master sama dengan /api/data/initial
// (yang dipakai form Buat Pesanan), jadi pilihan yang sah di import = pilihan yang sah di form.
export async function loadImportContext(orders: ImportOrderInput[]): Promise<ImportContext> {
  const [
    productRows,
    giftRows,
    bundleRows,
    warehouses,
    courierRows,
    paymentAccounts,
    noPaymentMethodRows,
    advertiserRows,
    adSourceRows,
    promoRows,
    destinationRows,
    weightSettings,
    courierWeightRules,
    productStockRows,
    giftStockRows,
  ] = await Promise.all([
    prisma.products.findMany({ where: { status: 'active' }, select: { id: true, product_name: true, sku: true, price: true, weight_gram: true } }),
    prisma.gifts.findMany({ where: { status: 'active' }, select: { id: true, gift_name: true, sku: true, weight_gram: true } }),
    prisma.product_bundles.findMany({ where: { status: 'active' }, include: { product_bundle_items: { include: { products: true } } } }),
    prisma.warehouses.findMany({ select: { id: true, warehouse_name: true, code: true }, orderBy: { distance_km: 'asc' } }),
    prisma.couriers.findMany({ select: { courier_name: true, code: true }, orderBy: { courier_name: 'asc' } }),
    prisma.payment_accounts.findMany({ select: { id: true, bank_name: true, account_name: true, account_number: true }, orderBy: { bank_name: 'asc' } }),
    prisma.$queryRawUnsafe<Array<{ id: number; method_name: string; no_shipping_cost: number | boolean | null }>>(
      'SELECT id, method_name, no_shipping_cost FROM no_payment_methods WHERE is_active = 1 ORDER BY method_name ASC',
    ),
    prisma.advertisers.findMany({ where: { status: 'active' }, select: { name: true } }),
    prisma.ad_sources.findMany({ where: { status: 'active' }, select: { name: true } }),
    prisma.promos.findMany({ where: { status: 'active' }, select: { id: true, promo_name: true } }),
    prisma.$queryRawUnsafe<Array<{ nama_tujuan: string }>>('SELECT DISTINCT nama_tujuan FROM tarif_pengiriman WHERE nama_tujuan IS NOT NULL'),
    prisma.shipping_weight_settings.findFirst({ select: { base_weight_gram: true, extra_weight_step_gram: true, rounding_tolerance_gram: true } }),
    getCourierWeightRules(prisma),
    prisma.warehouse_stock.findMany({ select: { warehouse_id: true, product_id: true, stock: true } }),
    prisma.warehouse_gift_stock.findMany({ select: { warehouse_id: true, gift_id: true, stock: true } }),
  ]);

  const products = new Map<string, ProductRow>();
  const productById = new Map<number, ProductRow>();
  productRows.forEach((row) => {
    const product = { id: row.id, product_name: row.product_name, sku: row.sku, price: Number(row.price || 0), weight_gram: row.weight_gram || 0 };
    productById.set(row.id, product);
    addKeys(products, product, row.product_name, row.sku);
  });

  const gifts = new Map<string, GiftRow>();
  giftRows.forEach((row) => addKeys(gifts, { id: row.id, gift_name: row.gift_name, sku: row.sku, weight_gram: row.weight_gram || 0 }, row.gift_name, row.sku));

  // Sama seperti /api/data/initial: bundling yang komponennya rusak tidak bisa dipilih.
  const bundles = new Map<string, BundleRow>();
  bundleRows
    .filter((bundle) => bundle.product_bundle_items.length > 0 && bundle.product_bundle_items.every((item) => item.products))
    .forEach((bundle) => {
      const components = bundle.product_bundle_items.map((item) => ({
        product: productById.get(item.product_id) || {
          id: item.product_id,
          product_name: item.products.product_name,
          sku: item.products.sku,
          price: Number(item.products.price || 0),
          weight_gram: item.products.weight_gram || 0,
        },
        qty: Number(item.qty || 1),
      }));
      addKeys(bundles, { id: bundle.id, bundle_name: bundle.bundle_name, sku: bundle.sku, price: Number(bundle.price || 0), components }, bundle.bundle_name, bundle.sku);
    });

  const advertisers = new Map<string, string>();
  advertiserRows.forEach((row) => addKeys(advertisers, row.name, row.name));
  const adSources = new Map<string, string>();
  adSourceRows.forEach((row) => addKeys(adSources, row.name, row.name));
  const promos = new Map<string, { id: number; promo_name: string }>();
  promoRows.forEach((row) => addKeys(promos, row, row.promo_name));

  const destinations = new Map<string, string>();
  destinationRows.forEach((row) => {
    const key = normDestination(row.nama_tujuan);
    if (key && !destinations.has(key)) destinations.set(key, row.nama_tujuan);
  });

  const productStock = new Map<string, number>();
  productStockRows.forEach((row) => productStock.set(`${row.warehouse_id}:${row.product_id}`, row.stock));
  const giftStock = new Map<string, number>();
  giftStockRows.forEach((row) => giftStock.set(`${row.warehouse_id}:${row.gift_id}`, row.stock));

  const { courierAliasMap, courierDisplayNames } = buildCourierAliases(courierRows);

  const context: ImportContext = {
    products,
    gifts,
    bundles,
    warehouses,
    courierAliasMap,
    courierDisplayNames,
    paymentAccounts,
    noPaymentMethods: noPaymentMethodRows.map((row) => ({ id: row.id, method_name: row.method_name, no_shipping_cost: Boolean(row.no_shipping_cost) })),
    advertisers,
    adSources,
    promos,
    destinations,
    // Default sama dengan /api/data/initial bila pengaturan berat belum pernah disimpan.
    weightSettings: weightSettings || { base_weight_gram: 1000, extra_weight_step_gram: 1000, rounding_tolerance_gram: 300 },
    courierWeightRules,
    productStock,
    giftStock,
    customersByWhatsapp: new Map(),
    tariffs: new Map(),
  };

  await Promise.all([loadCustomers(context, orders), loadTariffs(context, orders)]);
  return context;
}

// Nomor customer lama tersimpan dengan format campuran (62…, +62…, 08…, +852…). Route pembuatan
// pesanan mencari customer dengan nomor persis, jadi kirim nomor sesuai yang tersimpan.
async function loadCustomers(context: ImportContext, orders: ImportOrderInput[]) {
  // Varian format -> nomor baku
  const numberByVariant = new Map<string, string>();
  orders.forEach((order) => {
    const wa = resolveImportWhatsapp(order.fields.whatsapp, order.fields.whatsapp_country);
    if (wa.error) return;
    whatsappVariants(wa.number, wa.country).forEach((variant) => numberByVariant.set(variant, wa.number));
  });

  const variants = [...numberByVariant.keys()];
  if (variants.length === 0) return;

  for (let start = 0; start < variants.length; start += 1000) {
    const rows = await prisma.customers.findMany({
      where: { whatsapp_number: { in: variants.slice(start, start + 1000) } },
      select: { id: true, whatsapp_number: true },
      orderBy: { id: 'desc' },
    });
    rows.forEach((row) => {
      const key = numberByVariant.get((row.whatsapp_number || '').trim());
      if (key && !context.customersByWhatsapp.has(key)) context.customersByWhatsapp.set(key, row.whatsapp_number || key);
    });
  }
}

// Tarif dibaca sekaligus untuk semua tujuan di file, dengan aturan yang sama seperti /api/shipping/rates.
async function loadTariffs(context: ImportContext, orders: ImportOrderInput[]) {
  const destinations = [...new Set(
    orders.map((order) => context.destinations.get(normDestination(order.fields.destination))).filter((value): value is string => Boolean(value)),
  )];
  if (destinations.length === 0) return;

  const originByCode = new Map<string, ShippingOrigin>(ORIGINS.map((origin) => [ORIGIN_CODES[origin], origin]));

  for (let start = 0; start < destinations.length; start += 500) {
    const chunk = destinations.slice(start, start + 500);
    const rows = await prisma.$queryRawUnsafe<Array<{ kode_asal: string | null; nama_tujuan: string | null; kurir: string | null; harga: string | null; out_of_coverage: string | null }>>(
      `SELECT kode_asal, nama_tujuan, kurir, harga, out_of_coverage FROM tarif_pengiriman WHERE nama_tujuan IN (${chunk.map(() => '?').join(',')}) ORDER BY id ASC`,
      ...chunk,
    );

    rows.forEach((row) => {
      const origin = originByCode.get(String(row.kode_asal || ''));
      if (!origin || !row.nama_tujuan || !row.kurir) return;

      const key = `${origin}|${normDestination(row.nama_tujuan)}`;
      let couriers = context.tariffs.get(key);
      if (!couriers) {
        couriers = Object.fromEntries(context.courierDisplayNames.map((name) => [name, { price: null, out_of_coverage: '' }]));
        context.tariffs.set(key, couriers);
      }

      const displayName = context.courierAliasMap.get(normalizeCourierKey(row.kurir));
      if (displayName && couriers[displayName]) {
        couriers[displayName] = { price: parseTariffPrice(row.harga), out_of_coverage: row.out_of_coverage || '' };
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Validasi & perhitungan per pesanan
// ---------------------------------------------------------------------------

export type OrderFormItem = { product_id: number; is_gift: boolean; price: number; discount: number; qty: number };

export type OrderFormPayload = {
  jenis: OrderImportType;
  customer_name: string;
  whatsapp_number: string;
  email: string;
  address: string;
  subdistrict: string;
  age: string;
  complaint: string;
  notes: string;
  advertiser_name: string;
  ad_source: string;
  ro_count: number;
  old_order_id: string;
  promo_id: string;
  total_product_price: number;
  product_discount: number;
  shipping_cost: number;
  manual_fee_cod: number;
  other_fee: number;
  total_payment: number;
  warehouse_id: number;
  courier_name: string;
  payment_method: 'cod' | 'bank_transfer' | 'free';
  payment_account_id: number;
  no_payment_method_id: number;
  items: OrderFormItem[];
};

type StockNeed = { key: string; name: string; qty: number; kind: 'product' | 'gift' };

export type ResolvedImportOrder = {
  preview: ImportOrderPreview;
  form: OrderFormPayload | null;
  stockNeeds: StockNeed[];
};

const parseAmount = (value: string): number | null => {
  const cleaned = value.replace(/^rp\.?\s*/i, '').replace(/\s+/g, '');
  if (!cleaned) return 0;
  return parseTariffPrice(cleaned);
};

const parsePaymentMethod = (value: string): OrderFormPayload['payment_method'] | null => {
  const key = normalizeHeader(value);
  if (key === 'cod' || key === 'cashondelivery') return 'cod';
  if (['transfer', 'tf', 'banktransfer', 'transferbank', 'banktransfermanual'].includes(key)) return 'bank_transfer';
  if (['free', 'gratis', 'tanpapembayaran', 'freetanpapembayaran'].includes(key)) return 'free';
  return null;
};

export function resolveImportOrder(input: ImportOrderInput, context: ImportContext): ResolvedImportOrder {
  const { fields } = input;
  const errors: string[] = [];
  const warnings: string[] = [];

  const jenis = ORDER_IMPORT_TYPES.find((type) => type.toLowerCase() === fields.jenis.trim().toLowerCase()) || null;
  if (!fields.jenis) errors.push('Jenis Pesanan wajib diisi.');
  else if (!jenis) errors.push(`Jenis Pesanan "${fields.jenis}" tidak dikenal. Pilih: ${ORDER_IMPORT_TYPES.join(' / ')}.`);

  // Customer
  const customerName = fields.customer_name.trim();
  if (!customerName) errors.push('Nama Customer wajib diisi.');
  const wa = resolveImportWhatsapp(fields.whatsapp, fields.whatsapp_country);
  const normalizedWa = wa.number;
  if (!fields.whatsapp) errors.push('No WhatsApp wajib diisi.');
  else if (wa.error) errors.push(wa.error);
  if (wa.warning) warnings.push(wa.warning);
  const storedWa = context.customersByWhatsapp.get(normalizedWa);
  const address = fields.address.trim();
  if (!address) errors.push('Alamat Lengkap wajib diisi.');

  const destination = context.destinations.get(normDestination(fields.destination)) || '';
  if (!fields.destination) errors.push('Tujuan wajib diisi.');
  else if (!destination) errors.push(`Tujuan "${fields.destination}" tidak ditemukan. Salin persis dari sheet "Tujuan" di template.`);

  if (fields.age && !/^\d{1,3}$/.test(fields.age)) errors.push(`Umur "${fields.age}" harus berupa angka.`);

  // Gudang & ekspedisi
  const warehouseKey = normKey(fields.warehouse);
  const warehouse = context.warehouses.find((row) => normKey(row.warehouse_name) === warehouseKey)
    || context.warehouses.find((row) => normKey(row.code) === warehouseKey);
  if (!fields.warehouse) errors.push('Gudang wajib diisi.');
  else if (!warehouse) errors.push(`Gudang "${fields.warehouse}" tidak ditemukan.`);

  const courierName = context.courierAliasMap.get(normalizeCourierKey(fields.courier)) || '';
  if (!fields.courier) errors.push('Ekspedisi wajib diisi.');
  else if (!courierName) errors.push(`Ekspedisi "${fields.courier}" tidak ditemukan.`);

  // Pembayaran
  const paymentMethod = parsePaymentMethod(fields.payment_method);
  if (!fields.payment_method) errors.push('Metode Bayar wajib diisi.');
  else if (!paymentMethod) errors.push(`Metode Bayar "${fields.payment_method}" tidak dikenal. Pilih: COD / Transfer / Free.`);

  let paymentDetail = '';
  let paymentAccountId = 0;
  let noPaymentMethod: ImportContext['noPaymentMethods'][number] | undefined;

  if (paymentMethod === 'bank_transfer') {
    const accountKey = normKey(fields.payment_account);
    const byLabelOrNumber = context.paymentAccounts.find((account) =>
      normKey(formatPaymentAccount(account)) === accountKey || normKey(account.account_number) === accountKey,
    );
    const byBank = context.paymentAccounts.filter((account) => normKey(account.bank_name) === accountKey);
    const account = byLabelOrNumber || (byBank.length === 1 ? byBank[0] : undefined);

    if (!fields.payment_account) errors.push('Rekening Tujuan wajib diisi untuk Transfer.');
    else if (byBank.length > 1 && !byLabelOrNumber) errors.push(`Rekening "${fields.payment_account}" ada lebih dari satu. Pilih rekening lengkap dari daftar.`);
    else if (!account) errors.push(`Rekening Tujuan "${fields.payment_account}" tidak ditemukan.`);
    else {
      paymentAccountId = account.id;
      paymentDetail = formatPaymentAccount(account);
    }
  } else if (paymentMethod === 'free') {
    noPaymentMethod = context.noPaymentMethods.find((method) => normKey(method.method_name) === normKey(fields.free_reason));
    if (!fields.free_reason) errors.push('Alasan Free wajib diisi untuk metode Free.');
    else if (!noPaymentMethod) errors.push(`Alasan Free "${fields.free_reason}" tidak ditemukan.`);
    else paymentDetail = noPaymentMethod.method_name;
  }

  // Advertiser & sumber iklan: wajib di form Akuisisi/CSO, tidak dipakai di CRM.
  let advertiserName = '';
  let adSource = '';
  if (jenis === 'CRM') {
    if (fields.advertiser || fields.ad_source) warnings.push('Advertiser & Sumber Iklan tidak dipakai untuk pesanan CRM, diabaikan.');
  } else {
    const advertiserRequired = jenis === 'Akuisisi' || jenis === 'CSO';
    if (fields.advertiser) {
      advertiserName = context.advertisers.get(normKey(fields.advertiser)) || '';
      if (!advertiserName) errors.push(`Advertiser "${fields.advertiser}" tidak ditemukan / tidak aktif.`);
    } else if (advertiserRequired) {
      errors.push(`Advertiser wajib diisi untuk pesanan ${jenis}.`);
    }
    if (fields.ad_source) {
      adSource = context.adSources.get(normKey(fields.ad_source)) || '';
      if (!adSource) errors.push(`Sumber Iklan "${fields.ad_source}" tidak ditemukan / tidak aktif.`);
    } else if (advertiserRequired) {
      errors.push(`Sumber Iklan wajib diisi untuk pesanan ${jenis}.`);
    }
  }

  let roCount = 0;
  if (fields.ro_count) {
    if (jenis !== 'CSO' && jenis !== 'CRM') warnings.push('Jumlah RO hanya dipakai untuk pesanan CSO & CRM, diabaikan.');
    else if (!/^\d+$/.test(fields.ro_count)) errors.push(`Jumlah RO "${fields.ro_count}" harus angka 0 ke atas.`);
    else roCount = Number(fields.ro_count);
  }

  let oldOrderId = '';
  if (fields.old_order_id) {
    if (jenis !== 'Resend') warnings.push('ID Order Lama hanya dipakai untuk pesanan Resend, diabaikan.');
    else if (fields.old_order_id.trim().length !== 13) errors.push('ID Order Lama harus tepat 13 karakter.');
    else oldOrderId = fields.old_order_id.trim();
  }

  const promoIds: number[] = [];
  fields.promo.split(',').map((name) => name.trim()).filter(Boolean).forEach((name) => {
    const promo = context.promos.get(normKey(name));
    if (!promo) errors.push(`Promo "${name}" tidak ditemukan / tidak aktif.`);
    else if (!promoIds.includes(promo.id)) promoIds.push(promo.id);
  });

  const productDiscount = parseAmount(fields.product_discount);
  if (productDiscount === null) errors.push(`Diskon Produk "${fields.product_discount}" harus angka bulat 0 ke atas.`);
  const otherFee = parseAmount(fields.other_fee);
  if (otherFee === null) errors.push(`Biaya Lain "${fields.other_fee}" harus angka bulat 0 ke atas.`);

  // Item — harga selalu dari master. Bundling dipecah menjadi produk komponennya dengan
  // diskon per pcs, persis seperti saat bundling dipilih di form Buat Pesanan.
  const previewItems: ImportPreviewItem[] = [];
  const formItems: OrderFormItem[] = [];
  const stockByKey = new Map<string, StockNeed>();
  let subtotal = 0;
  let totalWeight = 0;

  const addStock = (kind: StockNeed['kind'], id: number, name: string, qty: number) => {
    if (!warehouse) return;
    const key = `${kind}:${warehouse.id}:${id}`;
    const existing = stockByKey.get(key);
    if (existing) existing.qty += qty;
    else stockByKey.set(key, { key, name, qty, kind });
  };

  if (input.items.length === 0) errors.push('Pesanan tidak memiliki item. Isi kolom Nama Item 1 & Qty 1.');

  // Sama seperti form: item yang sama tidak boleh dipilih dua kali dalam satu pesanan.
  const seenItems = new Map<string, string>();
  const isDuplicateItem = (kind: string, id: number, label: string, name: string) => {
    const key = `${kind}:${id}`;
    const firstLabel = seenItems.get(key);
    if (firstLabel) {
      errors.push(`${label}: "${name}" sudah ada di ${firstLabel}. Gabungkan Qty-nya di satu kolom.`);
      return true;
    }
    seenItems.set(key, label);
    return false;
  };

  input.items.forEach((item) => {
    const label = `Item ${item.slot}`;
    const qty = parseAmount(item.qty);
    if (!item.item_name) {
      errors.push(`${label}: Nama Item wajib diisi.`);
      return;
    }
    if (!item.qty) {
      errors.push(`${label}: Qty wajib diisi untuk "${item.item_name}".`);
      return;
    }
    if (qty === null || qty < 1) {
      errors.push(`${label}: Qty "${item.qty}" harus angka bulat minimal 1.`);
      return;
    }
    const discount = parseAmount(item.item_discount);
    if (discount === null) {
      errors.push(`${label}: Diskon Item "${item.item_discount}" harus angka bulat 0 ke atas.`);
      return;
    }

    const nameKey = normKey(item.item_name);
    const typeKey = normKey(item.item_type);
    let type = typeKey === 'PRODUK' ? 'product' : typeKey === 'HADIAH' ? 'gift' : typeKey === 'BUNDLING' ? 'bundle' : '';
    if (item.item_type && !type) {
      errors.push(`${label}: Tipe Item "${item.item_type}" tidak dikenal. Pilih: Produk / Hadiah / Bundling.`);
      return;
    }
    if (!type) {
      const matches = [context.products.has(nameKey) && 'product', context.bundles.has(nameKey) && 'bundle', context.gifts.has(nameKey) && 'gift'].filter(Boolean) as string[];
      if (matches.length !== 1) {
        errors.push(matches.length === 0
          ? `${label}: Item "${item.item_name}" tidak ditemukan / tidak aktif.`
          : `${label}: Item "${item.item_name}" ada di beberapa tipe, isi kolom Tipe Item.`);
        return;
      }
      type = matches[0];
    }

    if (type === 'product') {
      const product = context.products.get(nameKey);
      if (!product) {
        errors.push(`${label}: Produk "${item.item_name}" tidak ditemukan / tidak aktif.`);
        return;
      }
      if (isDuplicateItem('product', product.id, label, product.product_name)) return;
      if (discount > product.price) {
        errors.push(`${label}: Diskon Item melebihi harga ${product.product_name}.`);
        return;
      }
      const lineSubtotal = (product.price - discount) * qty;
      subtotal += lineSubtotal;
      totalWeight += product.weight_gram * qty;
      previewItems.push({ name: product.product_name, kind: 'product', qty, price: product.price, discount, subtotal: lineSubtotal });
      formItems.push({ product_id: product.id, is_gift: false, price: product.price, discount, qty });
      addStock('product', product.id, product.product_name, qty);
    } else if (type === 'gift') {
      const gift = context.gifts.get(nameKey);
      if (!gift) {
        errors.push(`${label}: Hadiah "${item.item_name}" tidak ditemukan / tidak aktif.`);
        return;
      }
      if (isDuplicateItem('gift', gift.id, label, gift.gift_name)) return;
      if (discount > 0) warnings.push(`${label}: Diskon Item tidak berlaku untuk hadiah, diabaikan.`);
      totalWeight += gift.weight_gram * qty;
      previewItems.push({ name: gift.gift_name, kind: 'gift', qty, price: 0, discount: 0, subtotal: 0 });
      formItems.push({ product_id: gift.id, is_gift: true, price: 0, discount: 0, qty });
      addStock('gift', gift.id, gift.gift_name, qty);
    } else {
      const bundle = context.bundles.get(nameKey);
      if (!bundle) {
        errors.push(`${label}: Bundling "${item.item_name}" tidak ditemukan / tidak aktif.`);
        return;
      }
      if (isDuplicateItem('bundle', bundle.id, label, bundle.bundle_name)) return;
      if (discount > 0) warnings.push(`${label}: Diskon Item tidak berlaku untuk bundling (diskon bundling dihitung otomatis), diabaikan.`);

      const unitsPerBundle = bundle.components.reduce((sum, component) => sum + component.qty, 0);
      const normalPrice = bundle.components.reduce((sum, component) => sum + component.product.price * component.qty, 0);
      const totalDiscount = normalPrice > bundle.price ? normalPrice - bundle.price : 0;
      const discountPerItem = unitsPerBundle > 0 ? Math.round(totalDiscount / unitsPerBundle) : 0;

      let bundleSubtotal = 0;
      bundle.components.forEach((component) => {
        const componentQty = component.qty * qty;
        bundleSubtotal += (component.product.price - discountPerItem) * componentQty;
        totalWeight += component.product.weight_gram * componentQty;
        formItems.push({ product_id: component.product.id, is_gift: false, price: component.product.price, discount: discountPerItem, qty: componentQty });
        addStock('product', component.product.id, component.product.product_name, componentQty);
      });
      subtotal += bundleSubtotal;
      previewItems.push({
        name: bundle.bundle_name,
        kind: 'bundle',
        qty,
        price: bundle.price,
        discount: 0,
        subtotal: bundleSubtotal,
        components: bundle.components.map((component) => `${component.product.product_name} × ${component.qty * qty}`),
      });
    }
  });

  // Ongkir dari tarif gudang → tujuan, dikali pengali berat (sama dengan form).
  let shippingCost = 0;
  if (warehouse && courierName && destination) {
    const origin = getOriginByWarehouseId(warehouse.id);
    const rates = origin ? context.tariffs.get(`${origin}|${normDestination(destination)}`) : undefined;
    const rate = rates?.[courierName];

    if (!origin) {
      errors.push(`Gudang "${warehouse.warehouse_name}" belum terhubung ke tarif ongkir mana pun.`);
    } else if (!rate || rate.price === null) {
      errors.push(`Ekspedisi ${courierName} tidak punya tarif dari ${warehouse.warehouse_name} ke ${destination}.`);
    } else {
      const ooc = rate.out_of_coverage.trim().toUpperCase();
      if (ooc !== 'ALL' && ooc !== 'TF') {
        errors.push(`Ekspedisi ${courierName} ke tujuan ini tidak tersedia untuk pembayaran apa pun (OOC: ${rate.out_of_coverage || 'kosong'}).`);
      } else if (ooc === 'TF' && paymentMethod && paymentMethod !== 'bank_transfer') {
        errors.push(`Ekspedisi ${courierName} ke tujuan ini hanya melayani Transfer (OOC: TF).`);
      }
      const multiplier = calculateShippingMultiplier(totalWeight, courierName, context.weightSettings, context.courierWeightRules);
      shippingCost = rate.price * multiplier;
    }
  }

  if (paymentMethod === 'free' && noPaymentMethod?.no_shipping_cost) {
    shippingCost = 0;
  }

  const feeCod = paymentMethod === 'cod' ? Math.round((subtotal + shippingCost) * 0.03) : 0;
  const totalPayment = Math.max(0, subtotal - (productDiscount || 0) + shippingCost + feeCod + (otherFee || 0));

  const preview: ImportOrderPreview = {
    row: input.row,
    jenis,
    customerName,
    whatsapp: storedWa || normalizedWa,
    whatsappKey: normalizedWa,
    whatsappCountry: wa.country,
    isExistingCustomer: Boolean(storedWa),
    destination: destination || fields.destination,
    warehouseName: warehouse?.warehouse_name || fields.warehouse,
    courierName: courierName || fields.courier,
    paymentMethod,
    paymentDetail: paymentMethod ? [PAYMENT_METHOD_LABELS[paymentMethod], paymentDetail].filter(Boolean).join(' · ') : fields.payment_method,
    items: previewItems,
    totals: {
      subtotal,
      productDiscount: productDiscount || 0,
      shippingCost,
      feeCod,
      otherFee: otherFee || 0,
      totalPayment,
      totalWeight,
    },
    needsProof: paymentMethod === 'bank_transfer' || paymentMethod === 'free',
    errors,
    warnings,
    input,
  };

  const isValid = errors.length === 0 && jenis && warehouse && paymentMethod;
  const form: OrderFormPayload | null = isValid
    ? {
        jenis,
        customer_name: customerName,
        whatsapp_number: storedWa || normalizedWa,
        email: fields.email.trim(),
        address,
        subdistrict: destination,
        age: fields.age,
        complaint: fields.complaint.trim(),
        notes: fields.notes.trim(),
        advertiser_name: advertiserName,
        ad_source: adSource,
        ro_count: roCount,
        old_order_id: oldOrderId,
        promo_id: promoIds.join(','),
        total_product_price: subtotal,
        product_discount: productDiscount || 0,
        shipping_cost: shippingCost,
        manual_fee_cod: feeCod,
        other_fee: otherFee || 0,
        total_payment: totalPayment,
        warehouse_id: warehouse.id,
        courier_name: courierName,
        payment_method: paymentMethod,
        payment_account_id: paymentAccountId,
        no_payment_method_id: noPaymentMethod?.id || 0,
        items: formItems,
      }
    : null;

  return { preview, form, stockNeeds: [...stockByKey.values()] };
}

// Stok dicek untuk seluruh file sekaligus: pesanan dihitung berurutan, dan stok yang sudah
// "dipakai" pesanan sebelumnya di file yang sama tidak bisa dipakai lagi.
export function applyStockCheck(orders: ResolvedImportOrder[], context: ImportContext) {
  const used = new Map<string, number>();

  orders.forEach((order) => {
    if (!order.form) return;

    const shortages = order.stockNeeds.flatMap((need) => {
      const [, warehouseId, itemId] = need.key.split(':');
      const stockKey = `${warehouseId}:${itemId}`;
      const available = (need.kind === 'gift' ? context.giftStock : context.productStock).get(stockKey) ?? 0;
      const alreadyUsed = used.get(need.key) ?? 0;
      if (alreadyUsed + need.qty <= available) return [];

      const label = need.kind === 'gift' ? 'hadiah' : 'produk';
      const remaining = Math.max(available - alreadyUsed, 0);
      return [`Stok ${label} "${need.name}" di ${order.preview.warehouseName} tidak cukup: butuh ${need.qty}, sisa ${remaining}${alreadyUsed > 0 ? ' (sudah terpakai pesanan lain di file ini)' : ''}.`];
    });

    if (shortages.length > 0) {
      order.preview.errors.push(...shortages);
      order.form = null;
      return;
    }

    order.stockNeeds.forEach((need) => used.set(need.key, (used.get(need.key) ?? 0) + need.qty));
  });
}

// Peringatan yang hanya terlihat bila semua pesanan di file dibandingkan.
export function applyFileWarnings(orders: ResolvedImportOrder[]) {
  const rowsByWhatsapp = new Map<string, number[]>();
  orders.forEach((order) => {
    const wa = order.preview.whatsappKey;
    if (!wa) return;
    rowsByWhatsapp.set(wa, [...(rowsByWhatsapp.get(wa) || []), order.preview.row]);
  });

  orders.forEach((order) => {
    const rows = rowsByWhatsapp.get(order.preview.whatsappKey) || [];
    if (rows.length > 1) {
      order.preview.warnings.push(`No WhatsApp yang sama juga ada di Baris ${rows.filter((row) => row !== order.preview.row).join(', ')}. Pastikan bukan pesanan ganda.`);
    }
  });
}

// FormData dengan field yang sama persis seperti yang dikirim form Buat Pesanan.
export function buildOrderFormData(form: OrderFormPayload, userId: number, paymentProof: File | null) {
  const fd = new FormData();
  fd.append('user_id', String(userId));
  fd.append('customer_name', form.customer_name);
  fd.append('whatsapp_number', form.whatsapp_number);
  fd.append('email', form.email);
  fd.append('address', form.address);
  fd.append('subdistrict', form.subdistrict);
  fd.append('desa', '');
  fd.append('age', form.age);
  fd.append('complaint', form.complaint);
  fd.append('notes', form.notes);
  if (form.jenis !== 'CRM') {
    fd.append('advertiser_name', form.advertiser_name);
    fd.append('ad_source', form.ad_source);
  }
  if (form.jenis === 'CSO' || form.jenis === 'CRM') fd.append('ro_count', String(form.ro_count));
  if (form.jenis === 'Resend') fd.append('old_order_id', form.old_order_id);
  fd.append('promo_id', form.promo_id);

  fd.append('total_product_price', String(form.total_product_price));
  fd.append('product_discount', String(form.product_discount));
  fd.append('shipping_cost', String(form.shipping_cost));
  fd.append('manual_fee_cod', String(form.manual_fee_cod));
  fd.append('other_fee', String(form.other_fee));
  fd.append('total_payment', String(form.total_payment));

  fd.append('warehouse_id', String(form.warehouse_id));
  fd.append('courier_name', form.courier_name);
  fd.append('payment_method', form.payment_method);
  if (form.payment_method === 'bank_transfer') fd.append('payment_account_id', String(form.payment_account_id));
  if (form.payment_method === 'free') fd.append('no_payment_method_id', String(form.no_payment_method_id));
  if (paymentProof) fd.append('payment_proof', paymentProof);

  form.items.forEach((item) => {
    fd.append('item_product_id[]', String(item.product_id));
    fd.append('item_is_gift[]', item.is_gift ? '1' : '0');
    fd.append('item_is_bundle[]', '0');
    fd.append('item_price[]', String(item.price));
    fd.append('item_discount[]', String(item.discount));
    fd.append('item_qty[]', String(item.qty));
  });

  return fd;
}
