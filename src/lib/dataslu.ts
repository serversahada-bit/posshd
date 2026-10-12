import mysql, { Pool, RowDataPacket } from 'mysql2/promise';

// Koneksi ke database transaksi "dataslu" — terpisah dari database POS (DATABASE_URL).

declare global {
  var datasluPool: Pool | undefined;
  var datasluSnapshotCache: { loadedAt: number; promise: Promise<DatasluSnapshot> } | undefined;
}

export const DATASLU_MIN_YEAR = 2023;
const CACHE_TTL_MS = 5 * 60 * 1000;

type TransaksiRow = RowDataPacket & {
  contack: string | null;
  first_name: string | null;
  alamat: string | null;
  kota: string | null;
  provinsi: string | null;
  time_stamp: Date;
  total_harga: string | null;
  adv: string | null;
  cs: string | null;
};

type DataCustomerRow = RowDataPacket & {
  hp_customer: string | null;
  crm: string | null;
};

export type DatasluPeriodStats = {
  total_transaksi: number;
  total_belanja: number;
  first_order_at: number;
  last_order_at: number;
};

export type DatasluCustomer = {
  phone: string;
  name: string | null;
  address: string | null;
  city: string | null;
  // Provinsi yang sudah dinormalisasi ke 38 provinsi resmi; null jika tidak dikenali.
  province: string | null;
  // Agen CRM penanggung jawab customer (data_customer.crm).
  agent: string | null;
  firstSeenAt: number;
  lastSeenAt: number;
  lifetimeTransaksi: number;
  lifetimeBelanja: number;
  // Kunci: tahun * 100 + bulan (1-12), misalnya 202403 untuk Maret 2024.
  byMonth: Map<number, DatasluPeriodStats>;
};

export type DatasluMonthTotals = {
  crmTransaksi: number;
  crmOmzet: number;
  nonCrmTransaksi: number;
  nonCrmOmzet: number;
};

export type DatasluAgentMonth = {
  transaksi: number;
  omzet: number;
  phones: Set<string>;
};

export type DatasluSnapshot = {
  customers: DatasluCustomer[];
  // Termasuk transaksi dengan nomor HP disensor marketplace, supaya omzet total tetap lengkap.
  monthTotals: Map<number, DatasluMonthTotals>;
  // Transaksi CRM per agen (kolom cs) per bulan.
  agentMonths: Map<number, Map<string, DatasluAgentMonth>>;
  loadedAt: number;
};

const getDatasluPool = () => {
  if (!process.env.DATASLU_DATABASE_URL) {
    throw new Error('DATASLU_DATABASE_URL belum diatur');
  }

  if (!global.datasluPool) {
    global.datasluPool = mysql.createPool({
      uri: process.env.DATASLU_DATABASE_URL,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
    });
  }

  return global.datasluPool;
};

// Nomor HP disamakan ke format 62xxx supaya "+62", "62", dan "0" dihitung sebagai customer yang sama.
export const normalizePhone = (value: string) => {
  const digits = value.replace(/[^0-9]/g, '');
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  if (digits.startsWith('8')) return `62${digits}`;
  return digits;
};

// "indri", "INDRI " → "Indri"
export const normalizeAgentName = (value: string | null) => {
  const name = (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  if (!name || name === '-') return null;
  return name.replace(/\b\w/g, (char) => char.toUpperCase());
};

export const PROVINCES = [
  'Aceh', 'Sumatera Utara', 'Sumatera Barat', 'Riau', 'Kepulauan Riau', 'Jambi', 'Sumatera Selatan',
  'Kepulauan Bangka Belitung', 'Bengkulu', 'Lampung', 'DKI Jakarta', 'Jawa Barat', 'Banten', 'Jawa Tengah',
  'DI Yogyakarta', 'Jawa Timur', 'Bali', 'Nusa Tenggara Barat', 'Nusa Tenggara Timur', 'Kalimantan Barat',
  'Kalimantan Tengah', 'Kalimantan Selatan', 'Kalimantan Timur', 'Kalimantan Utara', 'Sulawesi Utara', 'Gorontalo',
  'Sulawesi Tengah', 'Sulawesi Barat', 'Sulawesi Selatan', 'Sulawesi Tenggara', 'Maluku', 'Maluku Utara', 'Papua',
  'Papua Barat', 'Papua Barat Daya', 'Papua Tengah', 'Papua Pegunungan', 'Papua Selatan',
] as const;

const PROVINCE_ALIASES: Record<string, string> = {
  ...Object.fromEntries(PROVINCES.map((province) => [province.toUpperCase(), province])),
  'NANGGROE ACEH DARUSSALAM': 'Aceh', 'NAD': 'Aceh', 'DI ACEH': 'Aceh',
  'NORTH SUMATRA': 'Sumatera Utara', 'SUMUT': 'Sumatera Utara',
  'WEST SUMATRA': 'Sumatera Barat', 'SOUTH SUMATRA': 'Sumatera Selatan',
  'RIAU ISLANDS': 'Kepulauan Riau',
  'BANGKA BELITUNG': 'Kepulauan Bangka Belitung', 'BANGKA BELITUNG ISLANDS': 'Kepulauan Bangka Belitung',
  'JAKARTA': 'DKI Jakarta', 'JAKARTA RAYA': 'DKI Jakarta', 'DAERAH KHUSUS IBUKOTA JAKARTA': 'DKI Jakarta',
  'WEST JAVA': 'Jawa Barat', 'JABAR': 'Jawa Barat',
  'CENTRAL JAVA': 'Jawa Tengah', 'EAST JAVA': 'Jawa Timur',
  'YOGYAKARTA': 'DI Yogyakarta', 'DAERAH ISTIMEWA YOGYAKARTA': 'DI Yogyakarta',
  'WEST NUSA TENGGARA': 'Nusa Tenggara Barat', 'NTB': 'Nusa Tenggara Barat',
  'EAST NUSA TENGGARA': 'Nusa Tenggara Timur', 'NTT': 'Nusa Tenggara Timur',
  'WEST KALIMANTAN': 'Kalimantan Barat', 'CENTRAL KALIMANTAN': 'Kalimantan Tengah',
  'SOUTH KALIMANTAN': 'Kalimantan Selatan', 'EAST KALIMANTAN': 'Kalimantan Timur', 'NORTH KALIMANTAN': 'Kalimantan Utara',
  'NORTH SULAWESI': 'Sulawesi Utara', 'CENTRAL SULAWESI': 'Sulawesi Tengah', 'WEST SULAWESI': 'Sulawesi Barat',
  'SOUTH SULAWESI': 'Sulawesi Selatan', 'SOUTHEAST SULAWESI': 'Sulawesi Tenggara',
  'WEST PAPUA': 'Papua Barat',
};

// "JAWA+BARAT", "West Java Province", "NUSA TENGGARA BARAT (NTB)", "D.I. Yogyakarta" → nama provinsi resmi.
export const normalizeProvince = (value: string | null) => {
  const key = (value ?? '')
    .toUpperCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[+.]/g, ' ')
    .replace(/\b(PROVINCE|PROVINSI|PROV)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^D I /, 'DI ');
  return PROVINCE_ALIASES[key] ?? null;
};

// "288.000" atau "288000" → 288000
const parseRupiah = (value: string | null) => {
  const amount = Number((value ?? '').replace(/[^0-9]/g, ''));
  return Number.isFinite(amount) ? amount : 0;
};

const isCrmTransaction = (adv: string | null) => (adv ?? '').trim().toUpperCase().startsWith('CRM');

async function loadSnapshot(): Promise<DatasluSnapshot> {
  const pool = getDatasluPool();

  // Transaksi batal/cancel tidak dihitung.
  const [[rows], [customerRows]] = await Promise.all([
    pool.query<TransaksiRow[]>(
      // Diurutkan dari yang terlama, jadi data customer (nama, alamat, dsb.) terisi dari transaksi terbaru yang ada isinya.
      `SELECT contack, first_name, alamat, kota, provinsi, time_stamp, total_harga, adv, cs
       FROM data_transaksi
       WHERE time_stamp >= ?
         AND (status IS NULL OR (status NOT LIKE '%batal%' AND status NOT LIKE '%cancel%'))
       ORDER BY time_stamp`,
      [`${DATASLU_MIN_YEAR}-01-01`],
    ),
    pool.query<DataCustomerRow[]>(`SELECT hp_customer, crm FROM data_customer WHERE hp_customer IS NOT NULL AND crm IS NOT NULL`),
  ]);

  const agentByPhone = new Map<string, string>();
  for (const row of customerRows) {
    const agent = normalizeAgentName(row.crm);
    if (row.hp_customer && agent) agentByPhone.set(normalizePhone(row.hp_customer), agent);
  }

  const customers = new Map<string, DatasluCustomer>();
  const monthTotals = new Map<number, DatasluMonthTotals>();
  const agentMonths = new Map<number, Map<string, DatasluAgentMonth>>();

  for (const row of rows) {
    const ts = row.time_stamp.getTime();
    const period = row.time_stamp.getFullYear() * 100 + row.time_stamp.getMonth() + 1;
    const amount = parseRupiah(row.total_harga);
    const isCrm = isCrmTransaction(row.adv);

    let totals = monthTotals.get(period);
    if (!totals) {
      totals = { crmTransaksi: 0, crmOmzet: 0, nonCrmTransaksi: 0, nonCrmOmzet: 0 };
      monthTotals.set(period, totals);
    }
    if (isCrm) {
      totals.crmTransaksi += 1;
      totals.crmOmzet += amount;
    } else {
      totals.nonCrmTransaksi += 1;
      totals.nonCrmOmzet += amount;
    }

    // Nomor HP yang disensor marketplace ("******23") tidak bisa dikenali sebagai customer.
    const phone = row.contack && !row.contack.includes('*') ? normalizePhone(row.contack) : '';
    const isKnownCustomer = phone.length >= 9;

    if (isCrm) {
      const agent = normalizeAgentName(row.cs) ?? 'Tanpa Nama';
      let agents = agentMonths.get(period);
      if (!agents) {
        agents = new Map();
        agentMonths.set(period, agents);
      }
      let agentStats = agents.get(agent);
      if (!agentStats) {
        agentStats = { transaksi: 0, omzet: 0, phones: new Set() };
        agents.set(agent, agentStats);
      }
      agentStats.transaksi += 1;
      agentStats.omzet += amount;
      if (isKnownCustomer) agentStats.phones.add(phone);
    }

    if (!isKnownCustomer) continue;

    let customer = customers.get(phone);
    if (!customer) {
      customer = {
        phone,
        name: null,
        address: null,
        city: null,
        province: null,
        agent: agentByPhone.get(phone) ?? null,
        firstSeenAt: ts,
        lastSeenAt: 0,
        lifetimeTransaksi: 0,
        lifetimeBelanja: 0,
        byMonth: new Map(),
      };
      customers.set(phone, customer);
    }

    customer.lifetimeTransaksi += 1;
    customer.lifetimeBelanja += amount;
    customer.firstSeenAt = Math.min(customer.firstSeenAt, ts);

    // Nama, alamat, kota & provinsi diambil dari transaksi terbaru yang ada isinya.
    customer.lastSeenAt = Math.max(customer.lastSeenAt, ts);
    customer.name = row.first_name?.trim() || customer.name;
    customer.address = row.alamat?.trim() || customer.address;
    customer.city = row.kota?.trim() || customer.city;
    customer.province = normalizeProvince(row.provinsi) ?? customer.province;

    const stats = customer.byMonth.get(period);
    if (stats) {
      stats.total_transaksi += 1;
      stats.total_belanja += amount;
      stats.first_order_at = Math.min(stats.first_order_at, ts);
      stats.last_order_at = Math.max(stats.last_order_at, ts);
    } else {
      customer.byMonth.set(period, { total_transaksi: 1, total_belanja: amount, first_order_at: ts, last_order_at: ts });
    }
  }

  return { customers: Array.from(customers.values()), monthTotals, agentMonths, loadedAt: Date.now() };
}

// Data di-cache 5 menit, jadi transaksi baru di dataslu muncul paling lambat 5 menit kemudian.
export function getDatasluSnapshot() {
  const cache = global.datasluSnapshotCache;
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
    return cache.promise;
  }

  const promise = loadSnapshot();
  global.datasluSnapshotCache = { loadedAt: Date.now(), promise };
  promise.catch(() => {
    if (global.datasluSnapshotCache?.promise === promise) {
      global.datasluSnapshotCache = undefined;
    }
  });

  return promise;
}

export async function getDatasluCustomers() {
  return (await getDatasluSnapshot()).customers;
}

// Daftar tahun (terbaru dulu) dan kunci periode (tahun * 100 + bulan) untuk filter tahun/bulan.
export function resolvePeriods(year: number, month: number) {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - DATASLU_MIN_YEAR + 1 }, (_, i) => currentYear - i);
  const selectedYears = years.includes(year) ? [year] : years;
  const selectedMonths = month >= 1 && month <= 12 ? [month] : Array.from({ length: 12 }, (_, i) => i + 1);
  const periods = selectedYears.flatMap((y) => selectedMonths.map((m) => y * 100 + m));
  return { years, periods };
}

// Gabungkan statistik customer pada periode terpilih; null jika tidak bertransaksi di periode itu.
export function sumPeriodStats(customer: DatasluCustomer, periods: number[]) {
  let stats: DatasluPeriodStats | null = null;
  for (const period of periods) {
    const periodStats = customer.byMonth.get(period);
    if (!periodStats) continue;
    stats = stats
      ? {
          total_transaksi: stats.total_transaksi + periodStats.total_transaksi,
          total_belanja: stats.total_belanja + periodStats.total_belanja,
          first_order_at: Math.min(stats.first_order_at, periodStats.first_order_at),
          last_order_at: Math.max(stats.last_order_at, periodStats.last_order_at),
        }
      : { ...periodStats };
  }
  return stats;
}

// Filter RO berdasarkan jumlah transaksi: "1" = baru sekali beli, "2"/"5"/"10" = minimal sekian kali.
export const RO_FILTERS = ['1', '2', '5', '10'] as const;
export function matchesRoFilter(transaksi: number, ro: string) {
  if (ro === '1') return transaksi === 1;
  const min = Number(ro);
  return RO_FILTERS.includes(ro as (typeof RO_FILTERS)[number]) ? transaksi >= min : true;
}

// Filter provinsi: "" = semua, "unknown" = provinsi tidak diketahui.
export function matchesProvinceFilter(province: string | null, filter: string) {
  if (!filter) return true;
  if (filter === 'unknown') return province === null;
  return province === filter;
}

// Pencarian nama / nomor WA / kota / alamat / agen. "0812..." dicari sebagai "62812...".
export function createCustomerSearch(rawSearch: string) {
  const search = rawSearch.trim().toLowerCase();
  if (!search) return () => true;
  const searchDigits = /^[+0-9\s-]+$/.test(search) ? search.replace(/[^0-9]/g, '') : '';
  const phoneSearch = searchDigits.startsWith('0') ? normalizePhone(searchDigits) : searchDigits;
  return (customer: DatasluCustomer) =>
    Boolean(
      (phoneSearch && customer.phone.includes(phoneSearch)) ||
        customer.name?.toLowerCase().includes(search) ||
        customer.city?.toLowerCase().includes(search) ||
        customer.address?.toLowerCase().includes(search) ||
        customer.agent?.toLowerCase().includes(search),
    );
}
