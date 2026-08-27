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
