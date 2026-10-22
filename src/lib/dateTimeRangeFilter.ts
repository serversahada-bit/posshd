// Filter rentang tanggal + jam (opsional) untuk halaman pesanan.
// Input pengguna dalam WIB, sedangkan nilai timestamp pesanan yang terbaca di sesi SQL
// adalah jam UTC (ditulis dari Date Node via Prisma), jadi batasnya digeser -7 jam.

export type DateTimeRange = {
  startDate?: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
};

// Kolom waktu yang dipakai filter tanggal, mengikuti "Tampilan" (?sort=) di halaman pesanan.
export type OrderViewColumn = 'created_at' | 'processing_at' | 'last_update';

export const ORDER_VIEW_COLUMN_LABELS: Record<OrderViewColumn, string> = {
  created_at: 'Create Order',
  processing_at: 'Processing At',
  last_update: 'Last Update',
};

export const resolveOrderViewColumn = (value: unknown): OrderViewColumn =>
  value === 'processing_at' || value === 'last_update' ? value : 'created_at';

const DATE_PATTERN =/^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const cleanDate = (value: unknown) => (typeof value === 'string' && DATE_PATTERN.test(value) ? value : '');
const cleanTime = (value: unknown) => (typeof value === 'string' && TIME_PATTERN.test(value) ? value : '');

const pad = (value: number) => String(value).padStart(2, '0');

const WIB_OFFSET_MINUTES = 7 * 60;

// Ubah "YYYY-MM-DD HH:MM" WIB (+ geseran menit) menjadi string waktu UTC untuk dibandingkan di SQL.
// Dihitung dengan Date.UTC supaya tidak terpengaruh zona waktu server Node.
const shiftMinutes = (date: string, time: string, minutes: number) => {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day, hour, minute + minutes - WIB_OFFSET_MINUTES));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())} ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:00`;
};

/**
 * Batas bawah inklusif dan batas atas eksklusif:
 * - jam mulai kosong  -> 00:00 di tanggal mulai
 * - jam akhir kosong  -> sampai akhir hari tanggal akhir
 * - jam akhir diisi   -> sampai akhir menit tersebut (17:30 mencakup 17:30:59)
 * Jam diabaikan kalau tanggalnya kosong.
 */
export function buildDateTimeRangeCondition(column: string, range: DateTimeRange) {
  const startDate = cleanDate(range.startDate);
  const endDate = cleanDate(range.endDate);
  let conditionQuery = '';
  const params: string[] = [];

  if (startDate) {
    conditionQuery += ` AND ${column} >= ?`;
    params.push(shiftMinutes(startDate, cleanTime(range.startTime) || '00:00', 0));
  }
  if (endDate) {
    const endTime = cleanTime(range.endTime);
    conditionQuery += ` AND ${column} < ?`;
    params.push(endTime ? shiftMinutes(endDate, endTime, 1) : shiftMinutes(endDate, '00:00', 24 * 60));
  }

  return { conditionQuery, params };
}

export function formatDateTimeRangeLabel(range: DateTimeRange) {
  const startDate = cleanDate(range.startDate);
  const endDate = cleanDate(range.endDate);
  const startTime = cleanTime(range.startTime);
  const endTime = cleanTime(range.endTime);
  const start = startDate ? `${startDate}${startTime ? ` ${startTime}` : ''}` : '-';
  const end = endDate ? `${endDate}${endTime ? ` ${endTime}` : ''}` : '-';
  return `${start} s/d ${end}`;
}
