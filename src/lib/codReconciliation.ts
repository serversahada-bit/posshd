import * as xlsx from 'xlsx';

// Real courier reconciliation reports (JNE, J&T, Ninja, POS, ...) all use different
// column names and some bury the header a few rows down under a title block — these
// helpers auto-detect both, while the UI still lets the admin override manually.

// Order matters: more specific hints first, so a generic substring (e.g. bare "awb")
// doesn't false-positive against an unrelated column like "NET AWB AMT".
const RESI_HINTS = [
  'noresi', 'nomorresi', 'resi',
  'cnote', 'waybill', 'trackingid', 'tracking',
  'nomorawb', 'noawb', 'awbno', 'airwaybill',
];

const AMOUNT_HINTS = [
  'nominal', 'nominalcod', 'codvalue', 'jumlahcod', 'jumlah', 'totalcod',
  'amount', 'codamt', 'uangcod', 'codditerima', 'nilaicod', 'uangditerima', 'total',
];

// Exact-match fallback for bare single-word headers (e.g. plain "COD") that would
// false-positive against unrelated columns (e.g. "POD Code") if matched as a substring.
const AMOUNT_EXACT_FALLBACK = ['cod'];

const DISBURSED_AT_HINTS = [
  'tanggalcair', 'tglcair', 'tanggalpencairan', 'tglpencairan',
  'tanggaltransfer', 'tgltransfer', 'tanggalsetor', 'tglsetor',
  'disbursementdate', 'disbursedate', 'settlementdate', 'paymentdate',
];

const normalizeHeader = (value: unknown) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

export const guessColumn = (headers: string[], hints: string[], exactFallback: string[] = []): number => {
  const normalized = headers.map(normalizeHeader);
  for (const hint of hints) {
    const index = normalized.findIndex((header) => header.includes(hint));
    if (index !== -1) return index + 1; // 1-indexed, matches spreadsheet column numbers
  }
  for (const hint of exactFallback) {
    const index = normalized.findIndex((header) => header === hint);
    if (index !== -1) return index + 1;
  }
  return 0;
};

export const guessResiColumn = (headers: string[]) => guessColumn(headers, RESI_HINTS);
export const guessAmountColumn = (headers: string[]) => guessColumn(headers, AMOUNT_HINTS, AMOUNT_EXACT_FALLBACK);
export const guessDisbursedAtColumn = (headers: string[]) => guessColumn(headers, DISBURSED_AT_HINTS);

// Finds the column whose header matches a remembered header name (from a previous upload for
// the same courier) — exact match after normalization, so a courier's report keeping the same
// column names (even if reordered) still gets recognized without relying on generic keywords.
export const findColumnByHeaderName = (headers: string[], target: string | null | undefined): number => {
  const normalizedTarget = normalizeHeader(target);
  if (!normalizedTarget) return 0;
  const index = headers.map(normalizeHeader).findIndex((header) => header === normalizedTarget);
  return index === -1 ? 0 : index + 1;
};

export type ParsedSheet = {
  headerRowIndex: number; // 0-indexed, within `rows`
  headers: string[];
  rows: unknown[][]; // all rows including the header row
};

/**
 * Reads the first sheet of an .xlsx/.xls/.csv file and finds the header row.
 * Some courier reports (e.g. Ninja) put a title/period block above the real
 * header, so we scan the first few rows and pick the first one that looks like
 * a real header (several non-empty cells) rather than always assuming row 1.
 */
export function parseWorkbook(buffer: Buffer): ParsedSheet {
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: '', blankrows: false });

  let headerRowIndex = 0;
  for (let i = 0; i < Math.min(rows.length, 10); i += 1) {
    const filledCells = (rows[i] || []).filter((cell) => String(cell ?? '').trim() !== '').length;
    if (filledCells >= 3) {
      headerRowIndex = i;
      break;
    }
  }

  const headers = (rows[headerRowIndex] || []).map((cell, index) => String(cell ?? '').trim() || `Kolom ${index + 1}`);

  return { headerRowIndex, headers, rows };
}

export const normalizeTrackingNumber = (value: unknown): string =>
  String(value ?? '').trim().replace(/^'+/, '').trim();

export const parseAmount = (value: unknown): bigint => {
  const num = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(num)) return BigInt(0);
  return BigInt(Math.round(num));
};

// "Tanggal Cair" columns show up in wildly different shapes across couriers: a real Date
// (rare, since parseWorkbook doesn't request cellDates), an Excel serial number (the common
// case for numeric-looking date cells), or a plain string in DD/MM/YYYY (most local courier
// reports) or ISO-ish form. Best-effort across all three; returns null if nothing parses.
export const parseDisbursedDate = (value: unknown): Date | null => {
  if (value == null || value === '') return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    // Excel serial date: days since 1899-12-30 (accounts for Excel's leap-year bug).
    const excelEpoch = Date.UTC(1899, 11, 30);
    const date = new Date(excelEpoch + value * 24 * 60 * 60 * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const str = String(value).trim();
  if (!str) return null;

  const dmy = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (dmy) {
    const [, d, m, yRaw] = dmy;
    const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    if (!Number.isNaN(date.getTime())) return date;
  }

  const parsed = new Date(str);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

// Formats a parsed date as a plain YYYY-MM-DD string using the process's own local calendar
// fields (this server runs in Asia/Jakarta, matching what parseDisbursedDate intended) — NOT
// date.toISOString(), which would convert through UTC and can shift the date by a day. A bare
// date string handed to a MySQL DATE column is stored as-is with no further timezone reinterpretation,
// unlike passing a JS Date object through the driver (see eventAt's comment in process/route.ts
// for the matching Jakarta-vs-UTC driver quirk this sidesteps).
export const toSqlDateString = (date: Date | null): string | null => {
  if (!date) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
