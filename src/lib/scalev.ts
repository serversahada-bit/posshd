const DEFAULT_SCALEV_BASE_URL = 'https://api.scalev.com/v3';

async function parseScalevResponse(response: Response) {
  const rawText = await response.text();

  if (!rawText) {
    return null;
  }

  try {
    return JSON.parse(rawText) as unknown;
  } catch {
    return {
      raw: rawText,
    };
  }
}

export function getScalevBaseUrl(url?: string | null) {
  const candidate = (url || '').trim();

  if (!candidate) {
    return DEFAULT_SCALEV_BASE_URL;
  }

  return candidate.replace(/\/+$/, '');
}

export function getScalevErrorMessage(payload: unknown, fallback: string) {
  if (typeof payload === 'string' && payload.trim()) {
    return payload;
  }

  if (!payload || typeof payload !== 'object') {
    return fallback;
  }

  const error = 'error' in payload && typeof payload.error === 'string' ? payload.error : null;
  const message = 'message' in payload && typeof payload.message === 'string' ? payload.message : null;
  const raw = 'raw' in payload && typeof payload.raw === 'string' ? payload.raw : null;
  const baseErrors =
    'errors' in payload &&
    payload.errors &&
    typeof payload.errors === 'object' &&
    'base' in payload.errors &&
    Array.isArray(payload.errors.base)
      ? payload.errors.base.filter((item): item is string => typeof item === 'string')
      : [];
  const firstBaseError = baseErrors[0] || null;

  return error || message || firstBaseError || raw || fallback;
}

export async function changeScalevOrderStatus(params: {
  apiKey: string;
  baseUrl: string;
  orderIds: string[];
  status: string;
}) {
  const response = await fetch(`${params.baseUrl}/orders/change-status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      ids: params.orderIds,
      status: params.status,
    }),
  });

  const data = await parseScalevResponse(response);

  return {
    ok: response.ok,
    statusCode: response.status,
    data,
    message: getScalevErrorMessage(data, `Gagal mengubah status di Scalev (HTTP ${response.status})`),
  };
}

// Mapping nama kurir lokal (tabel `couriers`) -> courier_service_id Scalev, diambil dari sheet
// referensi "AIOP DATA PSLU" (kolom courier_service/courier_service_id, dikelompokkan per ekspedisi).
// Beberapa ekspedisi punya lebih dari satu courier_service di Scalev (mis. JNE: REG=1 / CTC (REG)=82,
// Lion Parcel: REGPACK=21 / JAGOPACK=37 / BIGPACK=39, Wahana: Express=84 / Ekonomis=86) — karena POS
// hanya menyimpan nama kurir level ekspedisi (bukan tier layanannya), dipilih salah satu sebagai default.
// Sesuaikan nilainya di sini kalau tier default-nya ternyata salah untuk kurir tertentu.
export const COURIER_SERVICE_ID_MAP: Record<string, number> = {
  NINJA: 6, // Standard (Ninja Xpress)
  JNT: 13, // EZ (J&T Express)
  JNE: 1, // REG (JNE Express)
  'POS REGULER': 12, // Reguler (POS Indonesia)
  LION: 21, // REGPACK (Lion Parcel)
  WAHANA: 84, // Express (Wahana Express)
};

export function getCourierServiceId(courierName?: string | null): number | null {
  if (!courierName) return null;
  return COURIER_SERVICE_ID_MAP[courierName.trim().toUpperCase()] ?? null;
}

// Mapping kode gudang lokal (tabel `warehouses`, kolom `code`) -> warehouse_unique_id Scalev.
// Ini WAJIB diisi di PATCH /orders/{id} sebelum status order bisa keluar dari draft — tanpa ini
// Scalev membalas HTTP 200 tapi diam-diam menolak perubahan status (order tidak punya gudang asal).
// Diverifikasi lewat POST /shipping-costs/search-warehouse; numeric warehouse.id-nya juga cocok
// dengan kolom warehouse_id di sheet referensi "AIOP DATA PSLU".
export const WAREHOUSE_UNIQUE_ID_MAP: Record<string, string> = {
  M: 'warehouse_SNjrIB9yO0o9JeIWs4DpjuUr', // HERBIYON MADIUN (Scalev warehouse id 47292)
  B: 'warehouse_aDBxhauLz6JqWwk8Zrsnu9bD', // HERBIYON JAKARTA / lokal "HERBIYON BEKASI" (Scalev warehouse id 47293)
  J: 'warehouse_mqzhXGUUvEmiwTEBbJ6j2om0', // HERBIYON JAKARTA 4 (Scalev warehouse id 68217)
};

export function getWarehouseUniqueId(warehouseCode?: string | null): string | null {
  if (!warehouseCode) return null;
  return WAREHOUSE_UNIQUE_ID_MAP[warehouseCode.trim().toUpperCase()] ?? null;
}

// PATCH parsial ke /orders/{id} — dipakai baik untuk update courier_service_id saja,
// maupun untuk melengkapi alamat/lokasi sebelum status order bisa diubah keluar dari draft.
export async function patchScalevOrder(params: {
  apiKey: string;
  baseUrl: string;
  orderId: string;
  payload: Record<string, unknown>;
}) {
  const response = await fetch(`${params.baseUrl}/orders/${encodeURIComponent(params.orderId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify(params.payload),
  });

  const data = await parseScalevResponse(response);

  return {
    ok: response.ok,
    statusCode: response.status,
    data,
    message: getScalevErrorMessage(data, `Gagal memperbarui data order di Scalev (HTTP ${response.status})`),
  };
}

export type ScalevLocation = {
  id: number;
  label: string;
  subdistrict?: string | null;
  city?: string | null;
  province?: string | null;
};

// GET /locations — dipakai untuk resolve location_id yang wajib diisi sebelum order bisa
// keluar dari status draft (lihat catatan di patchScalevOrder di atas).
export async function searchScalevLocations(params: {
  apiKey: string;
  baseUrl: string;
  search: string;
  pageSize?: number;
}) {
  const url = new URL(`${params.baseUrl}/locations`);
  url.searchParams.set('search', params.search);
  url.searchParams.set('page_size', String(params.pageSize ?? 15));

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${params.apiKey}` },
  });

  const data = await parseScalevResponse(response);

  if (!response.ok) {
    return {
      ok: false as const,
      statusCode: response.status,
      locations: [] as ScalevLocation[],
      message: getScalevErrorMessage(data, `Gagal mengambil data lokasi Scalev (HTTP ${response.status})`),
    };
  }

  const rows =
    data && typeof data === 'object' && 'data' in data && Array.isArray(data.data) ? data.data : [];

  const locations: ScalevLocation[] = rows.map((row: any) => ({
    id: row.id,
    label: row.display || [row.subdistrict_name, row.city_name, row.province_name].filter(Boolean).join(', '),
    subdistrict: row.subdistrict_name ?? null,
    city: row.city_name ?? null,
    province: row.province_name ?? null,
  }));

  return {
    ok: true as const,
    statusCode: 200,
    locations,
    message: 'Lokasi ditemukan.',
  };
}

// Pilih kandidat lokasi terbaik dari hasil pencarian: cocokkan kota dulu (paling menentukan),
// baru provinsi, supaya tidak asal ambil hasil pertama saat nama kecamatan ambigu (banyak daerah
// punya nama kecamatan yang sama). Fallback ke hasil pertama kalau tidak ada yang cocok sama sekali.
export function pickBestScalevLocation(
  locations: ScalevLocation[],
  hint: { city?: string | null; province?: string | null }
): ScalevLocation | null {
  if (locations.length === 0) return null;

  const normalize = (value?: string | null) => (value || '').trim().toLowerCase().replace(/^(kota|kabupaten)\s+/, '');
  const hintCity = normalize(hint.city);
  const hintProvince = normalize(hint.province);

  if (hintCity) {
    const cityMatch = locations.find((loc) => normalize(loc.city).includes(hintCity) || hintCity.includes(normalize(loc.city)));
    if (cityMatch) return cityMatch;
  }

  if (hintProvince) {
    const provinceMatch = locations.find((loc) => normalize(loc.province) === hintProvince);
    if (provinceMatch) return provinceMatch;
  }

  return locations[0];
}

export type SyncPosOrderToScalevParams = {
  apiKey: string;
  baseUrl: string;
  scalevOrderId: string;
  courierName?: string | null;
  warehouseCode?: string | null;
  province?: string | null;
  city?: string | null;
  district?: string | null;
  address?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  paymentMethod?: string | null;
};

export type SyncPosOrderToScalevResult = {
  ok: boolean;
  message: string;
  finalStatus?: string | null;
};

// Dorong data pesanan yang dibuat di POS balik ke Scalev: lengkapi field wajib (kurir, gudang asal,
// alamat/lokasi tujuan) lalu ubah status draft -> pending, dengan verifikasi ulang di akhir karena
// Scalev bisa membalas HTTP 200 padahal diam-diam menolak perubahan kalau data belum lengkap.
// Dipakai baik oleh alur otomatis (saat pesanan baru dibuat) maupun tombol "Kirim ke Scalev" manual.
export async function syncPosOrderToScalev(params: SyncPosOrderToScalevParams): Promise<SyncPosOrderToScalevResult> {
  const { apiKey, baseUrl, scalevOrderId } = params;
  const patchPayload: Record<string, unknown> = {};

  const courierServiceId = getCourierServiceId(params.courierName);
  if (courierServiceId) {
    patchPayload.courier_service_id = courierServiceId;
  }

  const warehouseUniqueId = getWarehouseUniqueId(params.warehouseCode);
  if (warehouseUniqueId) {
    patchPayload.warehouse_unique_id = warehouseUniqueId;
  }

  const scalevPaymentMethod =
    params.paymentMethod === 'cod' || params.paymentMethod === 'bank_transfer' ? params.paymentMethod : null;

  if (params.address && params.customerPhone && scalevPaymentMethod) {
    const locationSearchTerm = params.district || params.city || params.province || '';

    if (locationSearchTerm) {
      const locationResult = await searchScalevLocations({ apiKey, baseUrl, search: locationSearchTerm });
      const bestLocation = locationResult.ok
        ? pickBestScalevLocation(locationResult.locations, { city: params.city, province: params.province })
        : null;

      if (bestLocation) {
        patchPayload.location_id = bestLocation.id;
        patchPayload.address = params.address;
        patchPayload.customer_name = params.customerName;
        patchPayload.customer_phone = params.customerPhone;
        patchPayload.payment_method = scalevPaymentMethod;
      }
    }
  }

  if (Object.keys(patchPayload).length > 0) {
    const patchResult = await patchScalevOrder({ apiKey, baseUrl, orderId: scalevOrderId, payload: patchPayload });
    if (!patchResult.ok) {
      return { ok: false, message: `Gagal melengkapi data order di Scalev: ${patchResult.message}` };
    }
  }

  const statusResult = await changeScalevOrderStatus({ apiKey, baseUrl, orderIds: [scalevOrderId], status: 'pending' });
  if (!statusResult.ok) {
    return { ok: false, message: statusResult.message };
  }

  const verification = await getScalevOrderStatus({ apiKey, baseUrl, orderId: scalevOrderId });
  if (!verification.ok || verification.orderStatus !== 'pending') {
    return {
      ok: false,
      finalStatus: verification.orderStatus,
      message: `Scalev membalas OK tetapi status order belum berubah ke pending (status saat ini: ${verification.orderStatus ?? 'tidak diketahui'}). Kemungkinan order belum punya alamat/lokasi tujuan lengkap di Scalev.`,
    };
  }

  return { ok: true, finalStatus: verification.orderStatus, message: 'Order berhasil dikirim & diubah ke pending di Scalev.' };
}

export type ScalevOrderLine = {
  id?: string;
  product_name?: string;
  product_price?: string | number | null;
  variant_sku?: string | null;
  quantity?: number | null;
  variant_price?: string | number | null;
  variant_option1_value?: string | null;
  variant_option2_value?: string | null;
  variant_option3_value?: string | null;
  discount?: string | number | null;
};

export type ScalevOrder = {
  id: string;
  order_id: string;
  status: string;
  payment_status: string;
  payment_method?: string | null;
  customer?: { id?: number; name?: string; email?: string; phone?: string } | null;
  store?: { id?: number; name?: string; unique_id?: string } | null;
  handler?: { id?: number; fullname?: string; email?: string; phone?: string } | null;
  advertiser?: { id?: number; fullname?: string; email?: string; phone?: string } | null;
  channel_name?: string | null;
  utm_source?: string | null;
  platform?: string | null;
  gross_revenue?: string | number | null;
  product_price?: string | number | null;
  shipping_cost?: string | number | null;
  product_discount?: string | number | null;
  shipping_discount?: string | number | null;
  total_weight?: string | number | null;
  courier_service?: { id?: number; name?: string; code?: string } | null;
  destination_address?: {
    name?: string;
    phone?: string;
    address?: string;
    city?: string;
    province?: string;
    postal_code?: string;
  } | null;
  is_dropshipping?: boolean | null;
  is_repeat?: boolean | null;
  is_probably_spam?: boolean | null;
  tags?: { id?: number; name?: string }[] | null;
  orderlines?: ScalevOrderLine[] | null;
  notes?: string | null;
  created_at?: string | null;
  draft_time?: string | null;
};

// Field yang tidak diminta lewat `columns` tidak selalu ikut di respons default Scalev
// (mis. `handler` dan `payment_method` kosong kalau tidak diminta eksplisit).
export const SCALEV_ORDER_COLUMNS = [
  'order_id',
  'status',
  'payment_status',
  'payment_method',
  'customer',
  'store',
  'handler',
  'advertiser',
  'channel_name',
  'utm_source',
  'platform',
  'gross_revenue',
  'product_price',
  'shipping_cost',
  'product_discount',
  'shipping_discount',
  'total_weight',
  'courier_service',
  'destination_address',
  'is_dropshipping',
  'is_repeat',
  'tags',
  'notes',
  'draft_time',
].join(',');

export async function listScalevOrders(params: {
  apiKey: string;
  baseUrl: string;
  status?: string;
  search?: string;
  searchField?: string;
  pageSize?: number;
  cursor?: string;
  draftTimeUntil?: string;
  columns?: string;
}) {
  const url = new URL(`${params.baseUrl}/orders`);
  if (params.status) url.searchParams.set('status', params.status);
  if (params.search) {
    url.searchParams.set('search', params.search);
    url.searchParams.set('search_field', params.searchField || 'order_id');
  }
  url.searchParams.set('page_size', String(params.pageSize ?? 25));
  if (params.cursor) url.searchParams.set('next_cursor', params.cursor);
  if (params.draftTimeUntil) url.searchParams.set('draft_time_until', params.draftTimeUntil);
  url.searchParams.set('columns', params.columns || SCALEV_ORDER_COLUMNS);

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
    },
  });

  const data = await parseScalevResponse(response);

  if (!response.ok) {
    return {
      ok: false as const,
      statusCode: response.status,
      data,
      orders: [] as ScalevOrder[],
      hasNext: false,
      nextCursor: null as string | null,
      message: getScalevErrorMessage(data, `Gagal mengambil data order Scalev (HTTP ${response.status})`),
    };
  }

  const orders =
    data && typeof data === 'object' && 'data' in data && Array.isArray(data.data)
      ? (data.data as ScalevOrder[])
      : [];
  const hasNext = Boolean(data && typeof data === 'object' && 'has_next' in data && data.has_next);
  const nextCursor =
    data && typeof data === 'object' && 'next_cursor' in data && typeof data.next_cursor === 'string'
      ? data.next_cursor
      : null;

  return {
    ok: true as const,
    statusCode: response.status,
    data,
    orders,
    hasNext,
    nextCursor,
    message: 'Data order Scalev berhasil diambil.',
  };
}

// GET /orders/{id} menerima UUID internal MAUPUN order_id (kode 13 karakter) secara langsung,
// dan mengembalikan objek order penuh (termasuk `orderlines`) — field ini TIDAK tersedia lewat
// endpoint list (GET /orders) walaupun `orderlines` terdaftar sebagai salah satu nilai `columns`.
export async function getScalevOrderDetail(params: {
  apiKey: string;
  baseUrl: string;
  orderId: string;
  timeoutMs?: number;
}) {
  let response: Response;
  try {
    response = await fetch(`${params.baseUrl}/orders/${encodeURIComponent(params.orderId)}`, {
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
      },
      signal: AbortSignal.timeout(params.timeoutMs ?? 8000),
    });
  } catch (error) {
    return {
      ok: false as const,
      statusCode: 0,
      order: null as ScalevOrder | null,
      message: error instanceof Error && error.name === 'TimeoutError'
        ? 'Timeout saat mengambil detail order Scalev.'
        : `Gagal menghubungi Scalev: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }

  const data = await parseScalevResponse(response);

  if (!response.ok) {
    return {
      ok: false as const,
      statusCode: response.status,
      order: null as ScalevOrder | null,
      message: getScalevErrorMessage(data, `Gagal mengambil detail order Scalev (HTTP ${response.status})`),
    };
  }

  const order = (data && typeof data === 'object' ? (data as ScalevOrder) : null);

  return {
    ok: true as const,
    statusCode: response.status,
    order,
    message: order ? 'Order ditemukan.' : 'Order tidak ditemukan di Scalev.',
  };
}

export type ScalevSalesPerson = {
  id: number;
  fullname: string;
  email?: string | null;
};

// Order.handler.id yang dikembalikan GET /orders adalah id user (business_user.user.id),
// bukan id assignment sales-people itu sendiri — dipakai untuk mencocokkan filter CS di UI.
export async function listScalevSalesPeople(params: {
  apiKey: string;
  baseUrl: string;
}) {
  const orderResult = await listScalevOrders({
    apiKey: params.apiKey,
    baseUrl: params.baseUrl,
    status: 'draft',
    pageSize: 1,
    columns: 'store',
  });

  const storeId = orderResult.orders[0]?.store?.id;
  if (!storeId) {
    return {
      ok: false as const,
      statusCode: 404,
      people: [] as ScalevSalesPerson[],
      message: 'Store ID Scalev tidak ditemukan (belum ada order untuk mendeteksi store).',
    };
  }

  const people = new Map<number, ScalevSalesPerson>();
  let cursor: string | undefined;
  const MAX_PAGES = 10;

  for (let i = 0; i < MAX_PAGES; i++) {
    const url = new URL(`${params.baseUrl}/stores/${storeId}/sales-people`);
    url.searchParams.set('page_size', '100');
    if (cursor) url.searchParams.set('next_cursor', cursor);

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${params.apiKey}` },
    });
    const data = await parseScalevResponse(response);

    if (!response.ok) {
      return {
        ok: false as const,
        statusCode: response.status,
        people: [] as ScalevSalesPerson[],
        message: getScalevErrorMessage(data, `Gagal mengambil daftar sales people Scalev (HTTP ${response.status})`),
      };
    }

    const rows =
      data && typeof data === 'object' && 'data' in data && Array.isArray(data.data) ? data.data : [];

    for (const row of rows) {
      const user = row?.business_user?.user;
      if (user?.id && user?.fullname) {
        people.set(user.id, { id: user.id, fullname: user.fullname, email: user.email ?? null });
      }
    }

    const hasNext = Boolean(data && typeof data === 'object' && 'has_next' in data && data.has_next);
    const nextCursor =
      data && typeof data === 'object' && 'next_cursor' in data && typeof data.next_cursor === 'string'
        ? data.next_cursor
        : null;

    if (!hasNext || !nextCursor) break;
    cursor = nextCursor;
  }

  return {
    ok: true as const,
    statusCode: 200,
    people: Array.from(people.values()).sort((a, b) => a.fullname.localeCompare(b.fullname)),
    message: 'Daftar sales people Scalev berhasil diambil.',
  };
}

export async function getScalevOrderStatus(params: {
  apiKey: string;
  baseUrl: string;
  orderId: string;
}) {
  const url = new URL(`${params.baseUrl}/orders`);
  url.searchParams.set('order_id', params.orderId);
  url.searchParams.set('columns', 'order_id,status');
  url.searchParams.set('page_size', '1');

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
    },
  });

  const data = await parseScalevResponse(response);

  if (!response.ok) {
    return {
      ok: false,
      statusCode: response.status,
      data,
      orderStatus: null as string | null,
      message: getScalevErrorMessage(data, `Gagal mengambil status order Scalev (HTTP ${response.status})`),
    };
  }

  const rows =
    data && typeof data === 'object' && 'data' in data && Array.isArray(data.data)
      ? data.data
      : [];

  const firstRow = rows[0];
  const orderStatus =
    firstRow && typeof firstRow === 'object' && 'status' in firstRow && typeof firstRow.status === 'string'
      ? firstRow.status
      : null;

  return {
    ok: true,
    statusCode: response.status,
    data,
    orderStatus,
    message: orderStatus ? 'Status order berhasil diambil.' : 'Order ditemukan, tetapi status tidak tersedia.',
  };
}
