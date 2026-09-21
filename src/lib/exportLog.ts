import { cookies } from 'next/headers';

import prisma from '@/lib/db';

type LogExportParams = {
  request: Request;
  target: string;
  details?: string;
};

export async function logExportActivity({ request, target, details }: LogExportParams) {
  try {
    const cookieStore = await cookies();
    const userId = Number(cookieStore.get('sahada_user_id')?.value || 0);

    if (!userId) {
      return;
    }

    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || null;

    await prisma.activity_logs.create({
      data: {
        user_id: userId,
        action: 'Export Data',
        target,
        details: details || null,
        ip_address: ipAddress,
      },
    });
  } catch (error) {
    console.error('[logExportActivity]', error);
  }
}

type FilterValue = string | string[] | undefined;

const toList = (value: FilterValue): string[] => {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  return value ? [value] : [];
};

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  processing: 'Processing',
  ready_to_ship: 'Ready To Ship',
  shipped: 'Shipped',
  completed: 'Selesai',
  rts: 'RTS',
  problem: 'Problem',
  cancelled: 'Cancel',
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cod: 'COD',
  bank_transfer: 'Transfer Bank',
  free: 'Gratis',
  no_payment: 'Tanpa Pembayaran',
};

export type OrderExportFilters = {
  startDate?: string;
  endDate?: string;
  status?: FilterValue;
  creatorName?: FilterValue;
  warehouseId?: FilterValue;
  paymentMethod?: FilterValue;
  productId?: FilterValue;
  giftName?: FilterValue;
  itemMatch?: string;
  selectedIds?: string;
};

const EXPORT_LOG_TIME_ZONE = 'Asia/Jakarta';

export function formatDateOnly(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: EXPORT_LOG_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function getDateRangeFromRows<T>(rows: T[], getValue: (row: T) => unknown): { start: Date; end: Date } | null {
  let start: Date | null = null;
  let end: Date | null = null;

  for (const row of rows) {
    const raw = getValue(row);
    if (!raw) {
      continue;
    }

    const date = raw instanceof Date ? raw : new Date(String(raw));
    if (Number.isNaN(date.getTime())) {
      continue;
    }

    if (!start || date < start) {
      start = date;
    }
    if (!end || date > end) {
      end = date;
    }
  }

  return start && end ? { start, end } : null;
}

export async function buildOrderExportFilterSummary(
  filters: OrderExportFilters,
  fallbackDateRange?: { start: Date; end: Date } | null,
): Promise<string> {
  const selectedIds = (filters.selectedIds || '').trim();
  if (selectedIds) {
    const count = selectedIds.split(',').map((token) => token.trim()).filter(Boolean).length;
    return `Pilihan manual: ${count} pesanan`;
  }

  const parts: string[] = [];

  // Mode pencocokan hanya berarti kalau ada lebih dari satu item yang dipilih. Bawaannya "semua" (lihat olahanItemFilter).
  const matchModeLabel = (selectedCount: number) => (selectedCount > 1 ? (filters.itemMatch === 'any' ? ' (salah satu)' : ' (semua)') : '');

  if (filters.startDate || filters.endDate) {
    parts.push(`Periode: ${filters.startDate || '-'} s/d ${filters.endDate || '-'}`);
  } else if (fallbackDateRange) {
    parts.push(`Data aktual: ${formatDateOnly(fallbackDateRange.start)} s/d ${formatDateOnly(fallbackDateRange.end)} (tanpa filter tanggal)`);
  }

  const statusList = toList(filters.status);
  if (statusList.length > 0) {
    parts.push(`Status: ${statusList.map((status) => ORDER_STATUS_LABELS[status] || status).join(', ')}`);
  }

  const creatorNameList = toList(filters.creatorName);
  if (creatorNameList.length > 0) {
    parts.push(`CS: ${creatorNameList.join(', ')}`);
  }

  const warehouseIdList = toList(filters.warehouseId);
  if (warehouseIdList.length > 0) {
    const numericIds = warehouseIdList.map((id) => Number(id)).filter((id) => Number.isFinite(id));
    const warehouses = numericIds.length > 0
      ? await prisma.warehouses.findMany({
          where: { id: { in: numericIds } },
          select: { id: true, warehouse_name: true },
        })
      : [];
    const warehouseNameMap = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse.warehouse_name]));
    parts.push(`Gudang: ${warehouseIdList.map((id) => warehouseNameMap.get(Number(id)) || id).join(', ')}`);
  }

  const paymentMethodList = toList(filters.paymentMethod);
  if (paymentMethodList.length > 0) {
    parts.push(`Metode Bayar: ${paymentMethodList.map((method) => PAYMENT_METHOD_LABELS[method] || method).join(', ')}`);
  }

  const productIdList = toList(filters.productId);
  if (productIdList.length > 0) {
    const numericIds = productIdList.map((id) => Number(id)).filter((id) => Number.isFinite(id));
    const products = numericIds.length > 0
      ? await prisma.products.findMany({
          where: { id: { in: numericIds } },
          select: { id: true, product_name: true },
        })
      : [];
    const productNameMap = new Map(products.map((product) => [product.id, product.product_name]));
    parts.push(`Produk Utama${matchModeLabel(productIdList.length)}: ${productIdList.map((id) => productNameMap.get(Number(id)) || id).join(', ')}`);
  }

  const giftNameList = toList(filters.giftName);
  if (giftNameList.length > 0) {
    parts.push(`Hadiah${matchModeLabel(giftNameList.length)}: ${giftNameList.join(', ')}`);
  }

  return parts.length > 0 ? parts.join(' | ') : 'Tanpa filter (semua data)';
}
