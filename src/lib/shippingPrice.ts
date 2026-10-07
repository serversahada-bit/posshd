// Harga di tarif_pengiriman disimpan sebagai teks. Hanya bilangan bulat >= 0 yang sah:
// 0 berarti gratis ongkir, sedangkan "-", kosong, angka negatif, atau teks lain berarti tarif tidak tersedia.
// Pemisah ribuan (titik/koma per 3 digit, mis. "10.000" atau "1,250,000") diterima karena rupiah tidak memakai desimal.
const PLAIN_DIGITS_RE = /^\d+$/;
const THOUSANDS_RE = /^\d{1,3}([.,]\d{3})+$/;

export function parseTariffPrice(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 0 ? value : null;
  }

  const text = String(value ?? '').trim();
  if (PLAIN_DIGITS_RE.test(text)) return Number(text);
  if (THOUSANDS_RE.test(text)) return Number(text.replace(/[.,]/g, ''));
  return null;
}

export const TARIFF_PRICE_RULE = 'Harga harus angka 0 ke atas (0 = gratis ongkir), tanpa minus, "Rp", atau desimal.';
