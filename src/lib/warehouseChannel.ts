// Gudang diaktifkan per jenis pesanan (kolom warehouses.order_channels, dipisah koma). Gudang hanya
// muncul di form Buat Pesanan yang jenisnya tercantum. Kolom order_channels & shipping_origin dibaca
// lewat raw SQL supaya tidak bergantung pada Prisma client yang sudah di-generate ulang.
import { ORIGINS, getOriginByWarehouseId, type ShippingOrigin } from '@/lib/shippingRates';

export const ORDER_CHANNELS = ['akuisisi', 'cso', 'crm', 'resend', 'endorse'] as const;
export type OrderChannel = (typeof ORDER_CHANNELS)[number];

export const ORDER_CHANNEL_LABELS: Record<OrderChannel, string> = {
  akuisisi: 'Akuisisi',
  cso: 'CSO',
  crm: 'CRM',
  resend: 'Resend',
  endorse: 'Endorse',
};

// Default gudang baru = sama dengan default kolom di database.
export const DEFAULT_ORDER_CHANNELS: OrderChannel[] = ['akuisisi', 'cso', 'crm', 'resend'];

export const parseOrderChannel = (value: unknown): OrderChannel | null => {
  const normalized = String(value || '').trim().toLowerCase();
  return (ORDER_CHANNELS as readonly string[]).includes(normalized) ? (normalized as OrderChannel) : null;
};

export const parseOrderChannels = (value: unknown): OrderChannel[] => {
  const parsed = String(value || '').split(',').map(parseOrderChannel);
  return ORDER_CHANNELS.filter((channel) => parsed.includes(channel));
};

export const parseShippingOrigin = (value: unknown): ShippingOrigin | null => {
  const normalized = String(value || '').trim().toLowerCase();
  return (ORIGINS as readonly string[]).includes(normalized) ? (normalized as ShippingOrigin) : null;
};

// Jenis pesanan dari data pesanan yang sudah tersimpan (dipakai Edit Pesanan):
// - orders      → Akuisisi, atau Resend bila notes diawali "[RESEND]" (lihat orders_resend/route.ts)
// - orders_cso  → CSO
// - orders_crm  → CRM, atau Endorse bila order_source 'Endorse' (lihat crmOrderCreate.ts)
export const channelForStoredOrder = (
  source: 'CSO' | 'CSO_AUTO' | 'CRM',
  order: { notes?: string | null; order_source?: string | null },
): OrderChannel => {
  if (source === 'CSO_AUTO') return 'cso';
  if (source === 'CRM') return String(order.order_source || '').trim().toLowerCase() === 'endorse' ? 'endorse' : 'crm';
  return String(order.notes || '').startsWith('[RESEND]') ? 'resend' : 'akuisisi';
};

type RawDb = {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
};

export type WarehouseMeta = {
  id: number;
  order_channels: OrderChannel[];
  shipping_origin: ShippingOrigin | null;
};

// Asal ongkir gudang: pakai kolom shipping_origin, fallback ke pemetaan lama per ID.
export async function loadWarehouseMeta(db: RawDb): Promise<WarehouseMeta[]> {
  const rows = await db.$queryRawUnsafe<Array<{ id: number; order_channels: string | null; shipping_origin: string | null }>>(
    'SELECT id, order_channels, shipping_origin FROM warehouses ORDER BY id ASC',
  );
  return rows.map((row) => {
    const id = Number(row.id);
    return {
      id,
      order_channels: parseOrderChannels(row.order_channels),
      shipping_origin: parseShippingOrigin(row.shipping_origin) || getOriginByWarehouseId(id),
    };
  });
}

export async function getWarehouseIdsForChannel(db: RawDb, channel: OrderChannel): Promise<number[]> {
  const meta = await loadWarehouseMeta(db);
  return meta.filter((row) => row.order_channels.includes(channel)).map((row) => row.id);
}

// Pengaman sisi server: tolak pesanan yang memakai gudang yang tidak aktif untuk jenis pesanannya.
export async function assertWarehouseChannel(db: RawDb, warehouseId: number | null | undefined, channel: OrderChannel) {
  if (!warehouseId || !Number.isFinite(warehouseId)) return;
  const rows = await db.$queryRawUnsafe<Array<{ warehouse_name: string; order_channels: string | null }>>(
    'SELECT warehouse_name, order_channels FROM warehouses WHERE id = ? LIMIT 1',
    warehouseId,
  );
  const row = rows[0];
  if (!row) throw new Error('Gudang tidak ditemukan.');
  if (!parseOrderChannels(row.order_channels).includes(channel)) {
    throw new Error(`Gudang "${row.warehouse_name}" tidak aktif untuk pesanan ${ORDER_CHANNEL_LABELS[channel]}.`);
  }
}
