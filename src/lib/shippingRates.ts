// Konstanta & helper tarif ongkir yang dipakai bersama oleh /api/shipping/rates (form Buat Pesanan)
// dan Import Pesanan, supaya keduanya membaca tarif_pengiriman dengan cara yang sama persis.

export const ORIGINS = ['madiun', 'bekasi', 'jakarta'] as const;
export type ShippingOrigin = (typeof ORIGINS)[number];

export const ORIGIN_TO_WAREHOUSE_IDS: Record<ShippingOrigin, number[]> = {
  madiun: [1, 2, 5],
  bekasi: [3],
  jakarta: [4],
};

export const ORIGIN_CODES: Record<ShippingOrigin, string> = {
  madiun: 'Madiun (39900)',
  bekasi: 'Bekasi (6573)',
  jakarta: 'Jakarta (17665)',
};

export const getOriginByWarehouseId = (warehouseId: number): ShippingOrigin | null =>
  ORIGINS.find((origin) => ORIGIN_TO_WAREHOUSE_IDS[origin].includes(warehouseId)) || null;

export const normalizeCourierKey = (value: unknown) => String(value || '').trim().replace(/\s+/g, ' ').toUpperCase();

const FALLBACK_COURIER_NAMES = ['NINJA', 'JNT', 'JNE', 'POS', 'LION'];

// Nama tampilan kurir (yang disimpan ke shipments.courier_name) + peta alias nama/kode -> nama tampilan.
export function buildCourierAliases(courierRows: Array<{ courier_name: string | null; code: string | null }>) {
  const courierAliasMap = new Map<string, string>();
  const courierDisplayNames: string[] = [];

  courierRows.forEach((courier) => {
    const displayName = String(courier.courier_name || courier.code || '').trim();
    if (!displayName) {
      return;
    }

    if (!courierDisplayNames.includes(displayName)) {
      courierDisplayNames.push(displayName);
    }

    const normalizedDisplayName = normalizeCourierKey(displayName);
    const nameKey = normalizeCourierKey(courier.courier_name);
    const codeKey = normalizeCourierKey(courier.code);
    if (normalizedDisplayName) courierAliasMap.set(normalizedDisplayName, displayName);
    if (nameKey) courierAliasMap.set(nameKey, displayName);
    if (codeKey) courierAliasMap.set(codeKey, displayName);
  });

  FALLBACK_COURIER_NAMES.forEach((name) => {
    if (!courierDisplayNames.includes(name)) {
      courierDisplayNames.push(name);
    }
    courierAliasMap.set(normalizeCourierKey(name), name);
  });

  return { courierAliasMap, courierDisplayNames };
}
