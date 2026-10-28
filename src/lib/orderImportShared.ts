// Definisi bersama Import Pesanan (Excel) — aman dipakai di server maupun di halaman (tanpa prisma).

import { DEFAULT_WA_COUNTRY, WA_COUNTRIES, getWaCountry, parseWaInput, type WaCountryInfo } from '@/lib/whatsappNumber';

export const ORDER_IMPORT_TYPES = ['Akuisisi', 'CSO', 'CRM', 'Resend', 'Endorse'] as const;
export type OrderImportType = (typeof ORDER_IMPORT_TYPES)[number];

// Endorse memakai form & tabel yang sama dengan CRM (lihat crmOrderCreate.ts), jadi aturan kolomnya sama.
export const isCrmFamilyType = (jenis: OrderImportType | null) => jenis === 'CRM' || jenis === 'Endorse';

export const ITEM_TYPES = ['Produk', 'Hadiah', 'Bundling'] as const;
export const PAYMENT_METHOD_OPTIONS = ['COD', 'Transfer', 'Free'] as const;

export const ORDER_IMPORT_MAX_ORDERS = 500;
export const PAYMENT_PROOF_MAX_BYTES = 5 * 1024 * 1024;

export type OrderFieldKey =
  | 'jenis'
  | 'customer_name'
  | 'whatsapp'
  | 'whatsapp_country'
  | 'email'
  | 'age'
  | 'complaint'
  | 'address'
  | 'destination'
  | 'warehouse'
  | 'courier'
  | 'payment_method'
  | 'payment_account'
  | 'free_reason'
  | 'advertiser'
  | 'ad_source'
  | 'ro_count'
  | 'old_order_id'
  | 'promo'
  | 'product_discount'
  | 'other_fee'
  | 'notes';

export type ItemFieldKey = 'item_type' | 'item_name' | 'qty' | 'item_discount';

// 1 baris Excel = 1 pesanan, dengan maksimal 5 item (produk / hadiah / bundling) ditulis ke kanan.
export const MAX_ITEMS_PER_ROW = 5;

export type ImportColumn = {
  key: string;
  header: string;
  required: 'ya' | 'tidak' | 'kondisional';
  note: string;
  width: number;
  aliases?: string[];
  orderField?: OrderFieldKey;
  itemField?: ItemFieldKey;
  slot?: number;
};

type OrderColumn = Omit<ImportColumn, 'key' | 'orderField' | 'itemField' | 'slot'> & { key: OrderFieldKey };

const ORDER_COLUMNS: OrderColumn[] = [
  { key: 'jenis', header: 'Jenis Pesanan', required: 'ya', width: 14, note: 'Akuisisi / CSO / CRM / Resend / Endorse.' },
  { key: 'customer_name', header: 'Nama Customer', required: 'ya', width: 22, note: 'Nama penerima.' },
  { key: 'whatsapp', header: 'No WhatsApp', required: 'ya', width: 16, note: 'Format teks, mis. 081234567890 atau 6281234567890. Nomor luar negeri: isi kolom Kode Negara, lalu nomor tanpa kode negara (mis. 91234567 untuk Hong Kong). Juga dipakai untuk mencocokkan nama file bukti transfer (mis. 081234567890.jpg).', aliases: ['WhatsApp', 'No WA', 'Nomor WA'] },
  { key: 'whatsapp_country', header: 'Kode Negara', required: 'tidak', width: 22, note: 'Negara nomor WhatsApp. Kosong = Indonesia. Pilih dari daftar, atau isi kode ISO (HK) / kode telepon (852).', aliases: ['Negara', 'Country', 'Kode Negara WA'] },
  { key: 'email', header: 'Email', required: 'tidak', width: 20, note: 'Hanya dipakai jika customer baru.' },
  { key: 'age', header: 'Umur', required: 'tidak', width: 8, note: 'Hanya dipakai jika customer baru.' },
  { key: 'complaint', header: 'Keluhan', required: 'tidak', width: 20, note: 'Hanya dipakai jika customer baru.' },
  { key: 'address', header: 'Alamat Lengkap', required: 'ya', width: 36, note: 'Nama jalan, nomor rumah, RT/RW, desa.', aliases: ['Alamat'] },
  { key: 'destination', header: 'Tujuan', required: 'ya', width: 40, note: 'Harus sama dengan daftar di sheet "Tujuan" (format PROVINSI,KOTA,KECAMATAN).', aliases: ['Tujuan (Provinsi,Kota,Kecamatan)', 'Kecamatan Tujuan'] },
  { key: 'warehouse', header: 'Gudang', required: 'ya', width: 22, note: 'Nama atau kode gudang.' },
  { key: 'courier', header: 'Ekspedisi', required: 'ya', width: 14, note: 'Nama atau kode ekspedisi.', aliases: ['Kurir'] },
  { key: 'payment_method', header: 'Metode Bayar', required: 'ya', width: 13, note: 'COD / Transfer / Free.', aliases: ['Metode Pembayaran'] },
  { key: 'payment_account', header: 'Rekening Tujuan', required: 'kondisional', width: 36, note: 'Wajib jika Transfer. Pilih dari daftar, atau isi nomor rekening / nama bank.', aliases: ['Rekening'] },
  { key: 'free_reason', header: 'Alasan Free', required: 'kondisional', width: 18, note: 'Wajib jika Free.' },
  { key: 'advertiser', header: 'Advertiser', required: 'kondisional', width: 14, note: 'Wajib untuk Akuisisi & CSO. Diabaikan untuk CRM & Endorse.' },
  { key: 'ad_source', header: 'Sumber Iklan', required: 'kondisional', width: 13, note: 'Wajib untuk Akuisisi & CSO. Diabaikan untuk CRM & Endorse.' },
  { key: 'ro_count', header: 'Jumlah RO', required: 'tidak', width: 10, note: 'Hanya untuk CSO, CRM & Endorse. Kosong/0 jika pesanan baru.', aliases: ['RO'] },
  { key: 'old_order_id', header: 'ID Order Lama', required: 'tidak', width: 16, note: 'Hanya untuk Resend. Tepat 13 karakter.' },
  { key: 'promo', header: 'Promo', required: 'tidak', width: 18, note: 'Nama promo. Lebih dari satu dipisah koma.' },
  { key: 'product_discount', header: 'Diskon Produk', required: 'tidak', width: 13, note: 'Potongan total pesanan (Rp). Default 0.' },
  { key: 'other_fee', header: 'Biaya Lain', required: 'tidak', width: 11, note: 'Biaya tambahan (Rp). Default 0.' },
  { key: 'notes', header: 'Catatan', required: 'tidak', width: 24, note: 'Catatan pesanan.' },
];

const ITEM_COLUMNS: Array<Omit<ImportColumn, 'key' | 'orderField' | 'itemField' | 'slot'> & { field: ItemFieldKey }> = [
  { field: 'item_type', header: 'Tipe Item', required: 'tidak', width: 11, note: 'Produk / Hadiah / Bundling. Boleh kosong jika nama item hanya ada di satu tipe.' },
  { field: 'item_name', header: 'Nama Item', required: 'ya', width: 26, note: 'Nama produk / hadiah / bundling sesuai master.', aliases: ['Nama Produk', 'Item'] },
  { field: 'qty', header: 'Qty', required: 'ya', width: 7, note: 'Jumlah. Untuk bundling = jumlah paket.' },
  { field: 'item_discount', header: 'Diskon Item', required: 'tidak', width: 11, note: 'Potongan per pcs (Rp), hanya untuk tipe Produk. Default 0.', aliases: ['Diskon per Item'] },
];

// Urutan kolom di template: data pesanan, lalu 5 slot item ke kanan (Tipe Item 1, Nama Item 1, Qty 1,
// Diskon Item 1, ..., Diskon Item 5). Header dicocokkan tanpa memedulikan huruf besar/spasi/tanda baca,
// jadi user boleh menukar urutan kolom asal judulnya sama. Header tanpa nomor ("Nama Item", "Qty")
// dianggap slot 1.
export const IMPORT_COLUMNS: ImportColumn[] = [
  ...ORDER_COLUMNS.map((column) => ({ ...column, orderField: column.key })),
  ...Array.from({ length: MAX_ITEMS_PER_ROW }, (_, index) => index + 1).flatMap((slot) =>
    ITEM_COLUMNS.map(({ field, ...column }) => ({
      ...column,
      key: `${field}_${slot}`,
      header: `${column.header} ${slot}`,
      required: slot === 1 ? column.required : 'tidak',
      note: slot === 1 ? `${column.note} Item 2–${MAX_ITEMS_PER_ROW} ditulis ke kanan di kolom bernomor berikutnya.` : `Item ke-${slot} (opsional). ${column.note}`,
      aliases: slot === 1 ? [column.header, ...(column.aliases || [])] : (column.aliases || []).map((alias) => `${alias} ${slot}`),
      itemField: field,
      slot,
    })),
  ),
];

export const ORDER_FIELD_KEYS = ORDER_COLUMNS.map((column) => column.key);

export type ImportItemInput = {
  slot: number;
  item_type: string;
  item_name: string;
  qty: string;
  item_discount: string;
};

export type ImportOrderInput = {
  // Nomor baris di Excel — sekaligus identitas pesanan di preview & pencocokan nama file bukti.
  row: number;
  fields: Record<OrderFieldKey, string>;
  items: ImportItemInput[];
};

export type ImportPreviewItem = {
  name: string;
  kind: 'product' | 'gift' | 'bundle';
  qty: number;
  price: number;
  discount: number;
  subtotal: number;
  components?: string[];
};

export type ImportOrderPreview = {
  row: number;
  jenis: OrderImportType | null;
  customerName: string;
  // Nomor yang dikirim ke route pesanan (format tersimpan bila customer lama).
  whatsapp: string;
  // Nomor baku (kode negara + nomor lokal) & ISO negaranya, untuk tampilan dan pencocokan.
  whatsappKey: string;
  whatsappCountry: string;
  isExistingCustomer: boolean;
  destination: string;
  warehouseName: string;
  courierName: string;
  paymentMethod: 'cod' | 'bank_transfer' | 'free' | null;
  paymentDetail: string;
  items: ImportPreviewItem[];
  totals: {
    subtotal: number;
    productDiscount: number;
    shippingCost: number;
    feeCod: number;
    otherFee: number;
    totalPayment: number;
    totalWeight: number;
  };
  needsProof: boolean;
  errors: string[];
  warnings: string[];
  input: ImportOrderInput;
};

export const normalizeHeader = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

// Label negara di dropdown template, mis. "Hong Kong (+852)".
export const waCountryLabel = (country: WaCountryInfo) => `${country.name} (+${country.dial})`;

// Isi kolom Kode Negara -> negara. Menerima label dropdown, kode ISO ("HK"), kode telepon ("852" / "+852")
// atau nama negara. Kode telepon yang dipakai beberapa negara memilih negara utamanya (mis. +1 = Amerika Serikat).
export const findWaCountry = (value: string): WaCountryInfo | null => {
  const text = String(value || '').trim();
  if (!text) return null;
  const lower = text.toLowerCase();

  const byText = WA_COUNTRIES.find((country) =>
    country.iso.toLowerCase() === lower || country.name.toLowerCase() === lower || waCountryLabel(country).toLowerCase() === lower);
  if (byText) return byText;

  const dial = (/^\+?(\d{1,4})$/.exec(text) || /\(\s*\+?(\d{1,4})\s*\)/.exec(text))?.[1];
  if (!dial) return null;
  return WA_COUNTRIES.find((country) => country.dial === dial && !country.alt) || WA_COUNTRIES.find((country) => country.dial === dial) || null;
};

// Nomor baku = kode negara + nomor lokal tanpa nol depan, sama seperti form Buat Pesanan
// (mis. "6281234567890" atau "85291234567").
export type ImportWhatsapp = { number: string; country: string; error: string | null; warning: string | null };

export function resolveImportWhatsapp(wa: string, countryText: string): ImportWhatsapp {
  const chosen = countryText.trim() ? findWaCountry(countryText) : getWaCountry(DEFAULT_WA_COUNTRY);
  if (!chosen) {
    return { number: '', country: DEFAULT_WA_COUNTRY, error: `Kode Negara "${countryText}" tidak dikenal. Pilih dari daftar Kode Negara di sheet Master.`, warning: null };
  }

  const parsed = parseWaInput(wa, chosen.iso);
  const country = getWaCountry(parsed.country);
  // Nomor ditulis dengan "+kode" lain dari kolom Kode Negara: kode di nomor yang dipakai.
  const warning = countryText.trim() && country.iso !== chosen.iso
    ? `Kode Negara ${chosen.name} tidak cocok dengan nomor +${country.dial}, dipakai ${waCountryLabel(country)}.`
    : null;

  let error: string | null = null;
  if (country.iso === DEFAULT_WA_COUNTRY) {
    if (parsed.number.length < 10 || parsed.number.length > 15) error = `No WhatsApp "${wa}" tidak valid.`;
  } else if (country.len) {
    if (parsed.local.length !== country.len) error = `No WhatsApp "${wa}" tidak valid. Nomor ${country.name} harus ${country.len} digit tanpa kode negara +${country.dial}.`;
  } else if (parsed.local.length < 6 || parsed.number.length > 15) {
    error = `No WhatsApp "${wa}" tidak valid untuk ${waCountryLabel(country)}.`;
  }

  return { number: parsed.number, country: country.iso, error, warning };
}

// Variasi format nomor yang mungkin tersimpan di data customer lama.
export const whatsappVariants = (number: string, country: string) =>
  country === DEFAULT_WA_COUNTRY ? [number, `+${number}`, `0${number.slice(2)}`] : [number, `+${number}`];

// "+852 91234567" untuk tampilan.
export const formatWhatsapp = (number: string, country: string) => {
  const { dial } = getWaCountry(country);
  return number.startsWith(dial) ? `+${dial} ${number.slice(dial.length)}` : number;
};

// Nama file bukti transfer (mis. "081234567890", "91234567", "+85291234567") cocok dengan nomor pesanan?
// Dibaca memakai negara pesanannya, jadi nomor lokal tanpa kode negara tetap cocok.
export const matchesWhatsappFileName = (fileName: string, number: string, country: string) =>
  fileName.replace(/[^0-9]/g, '').length >= 6 && parseWaInput(fileName, country).number === number;

export const PAYMENT_METHOD_LABELS: Record<'cod' | 'bank_transfer' | 'free', string> = {
  cod: 'COD',
  bank_transfer: 'Transfer',
  free: 'Free',
};
