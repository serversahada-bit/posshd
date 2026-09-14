const PROVINCE_NAMES = [
  'ACEH', 'SUMATERA UTARA', 'SUMATERA BARAT', 'RIAU', 'KEPULAUAN RIAU', 'JAMBI', 'SUMATERA SELATAN',
  'KEPULAUAN BANGKA BELITUNG', 'BENGKULU', 'LAMPUNG', 'DKI JAKARTA', 'JAWA BARAT', 'JAWA TENGAH',
  'DI YOGYAKARTA', 'JAWA TIMUR', 'BANTEN', 'BALI', 'NUSA TENGGARA BARAT', 'NUSA TENGGARA TIMUR',
  'KALIMANTAN BARAT', 'KALIMANTAN TENGAH', 'KALIMANTAN SELATAN', 'KALIMANTAN TIMUR', 'KALIMANTAN UTARA',
  'SULAWESI UTARA', 'SULAWESI TENGAH', 'SULAWESI SELATAN', 'SULAWESI TENGGARA', 'GORONTALO', 'SULAWESI BARAT',
  'MALUKU', 'MALUKU UTARA', 'PAPUA', 'PAPUA BARAT', 'PAPUA TENGAH', 'PAPUA PEGUNUNGAN', 'PAPUA SELATAN', 'PAPUA BARAT DAYA',
];

const PROVINCE_ALIASES: Record<string, string> = {
  DKI: 'DKI JAKARTA',
  JAKARTA: 'DKI JAKARTA',
  DIY: 'DI YOGYAKARTA',
  YOGYAKARTA: 'DI YOGYAKARTA',
  JOGJA: 'DI YOGYAKARTA',
  NTB: 'NUSA TENGGARA BARAT',
  NTT: 'NUSA TENGGARA TIMUR',
  BABEL: 'KEPULAUAN BANGKA BELITUNG',
  'BANGKA BELITUNG': 'KEPULAUAN BANGKA BELITUNG',
  KEPRI: 'KEPULAUAN RIAU',
};

const normalizeProvincePart = (value: string): string =>
  value
    .replace(/\([^)]*\)/g, '') // drop trailing abbreviation, e.g. "(NTB)"
    .toUpperCase()
    .replace(/^PROV(INSI)?\.?\s+/, '')
    .trim();

// Exact match only — a substring check would false-positive on e.g. "Kabupaten Aceh Selatan"
// containing "Aceh", so a part must equal a province name (or alias) outright.
const isProvinceName = (value: string): boolean => {
  const normalized = normalizeProvincePart(value);
  if (!normalized) return false;
  return PROVINCE_NAMES.includes(normalized) || Boolean(PROVINCE_ALIASES[normalized]);
};

const CITY_PREFIX_RE = /^(kota|kabupaten|kab\.?)\s+/i;

export type RegionParts = {
  district: string;
  city: string;
  province: string;
};

/**
 * Splits a free-text "Kecamatan, Kota, Provinsi" combo field into its parts.
 * The combo string isn't reliably ordered — new destination picks are
 * "Provinsi, Kota, Kecamatan" while older/legacy customer records are often
 * "Kecamatan, Kota, Provinsi" — so this locates the province by name instead
 * of assuming a fixed position.
 */
export function splitRegionParts(raw: string | null | undefined): RegionParts {
  const parts = String(raw || '').split(',').map((part) => part.trim()).filter(Boolean);

  if (parts.length < 3) {
    return { district: parts[0] || '', city: parts[1] || '', province: '' };
  }

  const provinceIndex = parts.findIndex(isProvinceName);

  if (provinceIndex === -1) {
    // No recognizable province name — default to the legacy "Kecamatan, Kota, Provinsi" convention.
    return { district: parts[0] || '', city: parts[1] || '', province: parts[2] || '' };
  }

  const province = parts[provinceIndex];
  const [a, b] = parts.filter((_, index) => index !== provinceIndex);
  const aIsCity = CITY_PREFIX_RE.test(a);
  const bIsCity = CITY_PREFIX_RE.test(b);

  if (aIsCity && !bIsCity) {
    return { city: a, district: b || '', province };
  }
  if (bIsCity && !aIsCity) {
    return { city: b, district: a || '', province };
  }
  // No "Kota/Kabupaten" prefix to disambiguate — fall back to position:
  // province leads ("Provinsi, Kota, Kecamatan") or trails ("Kecamatan, Kota, Provinsi").
  return provinceIndex === 0
    ? { city: a, district: b || '', province }
    : { district: a || '', city: b, province };
}
