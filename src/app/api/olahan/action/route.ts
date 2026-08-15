import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { emitEvent } from '@/lib/socket-server';
import { syncOrderTimestampColumns } from '@/lib/orderTimestamps';
import { logOrderStatusChange } from '@/lib/orderStatusLog';

export const dynamic = 'force-dynamic';

type Source = 'CSO' | 'CSO_AUTO' | 'CRM';
type OrderRow = {
  id: number;
  order_code: string;
  order_status: string;
  warehouse_id: number | null;
};

type OrderItemRow = {
  product_id: number | null;
  product_name: string | null;
  qty: number;
  is_gift: boolean | number | null;
  is_bundle: boolean | number | null;
};

function buildStatusUpdateQuery(tableName: string, ids: number[]) {
  const placeholders = ids.map(() => '?').join(', ');
  return `UPDATE ${tableName} SET order_status = ?, updated_at = ? WHERE id IN (${placeholders})`;
}

function buildStatusUpdateParams(status: string, ids: number[], eventAt: Date) {
  return [status, eventAt, ...ids];
}

function getTablesForSource(source: Source) {
  if (source === 'CRM') {
    return { orders: 'orders_crm', items: 'order_items_crm' };
  }

  if (source === 'CSO_AUTO') {
    return { orders: 'orders_cso', items: 'order_items_cso' };
  }

  return { orders: 'orders', items: 'order_items' };
}

async function adjustBundleOrProductStock(tx: any, warehouseId: number, item: OrderItemRow, direction: 1 | -1) {
  const productId = Number(item.product_id) || 0;
  const qty = Number(item.qty) || 0;
  if (!productId || !qty) {
    return;
  }

  const productName = String(item.product_name || '').trim();
  let treatAsExpandedComponent = false;

  if (productName) {
    const productMatch: Array<{ id: number }> = await tx.$queryRawUnsafe(
      'SELECT id FROM products WHERE id = ? AND product_name = ? LIMIT 1',
      productId,
      productName,
    );
    treatAsExpandedComponent = productMatch.length > 0;
  } else {
    const productMatch: Array<{ id: number }> = await tx.$queryRawUnsafe(
      'SELECT id FROM products WHERE id = ? LIMIT 1',
      productId,
    );
    treatAsExpandedComponent = productMatch.length > 0;
  }

  if (treatAsExpandedComponent) {
    await tx.$executeRawUnsafe(
      'UPDATE warehouse_stock SET stock = stock + ? WHERE product_id = ? AND warehouse_id = ?',
      direction * qty,
      productId,
      warehouseId,
    );
    return;
  }

  const bundleItems: Array<{ product_id: number; qty: number }> = await tx.$queryRawUnsafe(
    'SELECT product_id, qty FROM product_bundle_items WHERE bundle_id = ?',
    productId,
  );

  if (bundleItems.length > 0) {
    for (const bundleItem of bundleItems) {
      const componentProductId = Number(bundleItem.product_id) || 0;
      const componentQty = (Number(bundleItem.qty) || 0) * qty;
      if (!componentProductId || !componentQty) {
        continue;
      }

      await tx.$executeRawUnsafe(
        'UPDATE warehouse_stock SET stock = stock + ? WHERE product_id = ? AND warehouse_id = ?',
        direction * componentQty,
        componentProductId,
        warehouseId,
      );
    }
    return;
  }

  await tx.$executeRawUnsafe(
    'UPDATE warehouse_stock SET stock = stock + ? WHERE product_id = ? AND warehouse_id = ?',
    direction * qty,
    productId,
    warehouseId,
  );
}

async function adjustOrderStock(tx: any, source: Source, orderId: number, warehouseId: number | null, direction: 1 | -1) {
  if (!warehouseId) {
    return;
  }

  const { items } = getTablesForSource(source);
  const itemQuery = source === 'CSO'
    ? `SELECT product_id, product_name, qty, is_gift, is_bundle FROM ${items} WHERE order_id = ? UNION ALL SELECT product_id, product_name, qty, is_gift, is_bundle FROM order_items_resend WHERE order_id = ?`
    : `SELECT product_id, product_name, qty, is_gift, is_bundle FROM ${items} WHERE order_id = ?`;
  const orderItems: OrderItemRow[] = await tx.$queryRawUnsafe(
    itemQuery,
    ...(source === 'CSO' ? [orderId, orderId] : [orderId]),
  );

  for (const item of orderItems) {
    const qty = Number(item.qty) || 0;
    const productId = Number(item.product_id) || 0;
    if (!qty || !productId) {
      continue;
    }

    if (Boolean(item.is_gift)) {
      await tx.$executeRawUnsafe(
        'UPDATE warehouse_gift_stock SET stock = stock + ? WHERE gift_id = ? AND warehouse_id = ?',
        direction * qty,
        productId,
        warehouseId,
      );
      continue;
    }

    if (Boolean(item.is_bundle)) {
      await adjustBundleOrProductStock(tx, warehouseId, item, direction);
      continue;
    }

    await tx.$executeRawUnsafe(
      'UPDATE warehouse_stock SET stock = stock + ? WHERE product_id = ? AND warehouse_id = ?',
      direction * qty,
      productId,
      warehouseId,
    );
  }
}

async function fetchRowsForIds(tx: any, source: Source, ids: number[]) {
  if (ids.length === 0) {
    return [] as OrderRow[];
  }

  const { orders } = getTablesForSource(source);
  return await tx.$queryRawUnsafe(
    `SELECT id, order_code, order_status, warehouse_id FROM ${orders} WHERE id IN (${ids.map(() => '?').join(', ')})`,
    ...ids,
  ) as OrderRow[];
}

async function processStatusUpdateForSource(
  tx: any,
  source: Source,
  ids: number[],
  bulkStatus: string,
  eventAt: Date,
  userId: number | null | undefined,
) {
  if (ids.length === 0) {
    return 0;
  }

  const { orders } = getTablesForSource(source);
  const rows = await fetchRowsForIds(tx, source, ids);

  for (const row of rows) {
    if (row.order_status !== 'cancelled' && bulkStatus === 'cancelled') {
      await adjustOrderStock(tx, source, Number(row.id), Number(row.warehouse_id || 0), 1);
    } else if (row.order_status === 'cancelled' && bulkStatus !== 'cancelled') {
      await adjustOrderStock(tx, source, Number(row.id), Number(row.warehouse_id || 0), -1);
    }
  }

  await tx.$executeRawUnsafe(
    buildStatusUpdateQuery(orders, ids),
    ...buildStatusUpdateParams(bulkStatus, ids, eventAt),
  );

  for (const id of ids) {
    await syncOrderTimestampColumns(tx, orders, id, bulkStatus, eventAt);
    const row = rows.find((item) => Number(item.id) === id);
    if (row && row.order_status !== bulkStatus) {
      await logOrderStatusChange(tx, {
        userId,
        orderCode: row.order_code,
        source,
        fromStatus: row.order_status,
        toStatus: bulkStatus,
        reason: 'Bulk update status',
      });
    }
  }

  return ids.length;
}

async function processDeleteForSource(tx: any, source: Source, ids: number[]) {
  if (ids.length === 0) {
    return 0;
  }

  const { orders } = getTablesForSource(source);
  const rows = await fetchRowsForIds(tx, source, ids);

  for (const row of rows) {
    if (row.order_status !== 'cancelled') {
      await adjustOrderStock(tx, source, Number(row.id), Number(row.warehouse_id || 0), 1);
    }

    if (source === 'CSO') {
      await tx.$executeRawUnsafe('DELETE FROM order_items_resend WHERE order_id = ?', Number(row.id));
    }

    await tx.$queryRawUnsafe(`DELETE FROM ${orders} WHERE id = ?`, Number(row.id));
  }

  return rows.length;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, csoIds, csoAutoIds, crmIds, bulk_status, userId } = body;

    let count = 0;

    const csoIdArray = csoIds ? csoIds.split(',').map(Number).filter(Boolean) : [];
    const csoAutoIdArray = csoAutoIds ? csoAutoIds.split(',').map(Number).filter(Boolean) : [];
    const crmIdArray = crmIds ? crmIds.split(',').map(Number).filter(Boolean) : [];

    if (action === 'bulk_update_status') {
      const validStatuses = ['pending', 'processing', 'ready_to_ship', 'shipped', 'completed', 'rts', 'problem', 'cancelled'];
      if (!validStatuses.includes(bulk_status)) {
        return NextResponse.json({ status: 'error', message: 'Status tidak valid.' }, { status: 400 });
      }

      const eventAt = new Date();

      await prisma.$transaction(async (tx) => {
        count += await processStatusUpdateForSource(tx, 'CSO', csoIdArray, bulk_status, eventAt, userId);
        count += await processStatusUpdateForSource(tx, 'CSO_AUTO', csoAutoIdArray, bulk_status, eventAt, userId);
        count += await processStatusUpdateForSource(tx, 'CRM', crmIdArray, bulk_status, eventAt, userId);

        if (count > 0 && userId) {
          await tx.activity_logs.create({
            data: {
              user_id: userId,
              action: 'Bulk Update Status',
              target: 'Pesanan',
              details: `Mengubah ${count} pesanan menjadi status: ${bulk_status}`,
            },
          });
        }
      });

      await emitEvent('REFRESH_OLAHAN');

      return NextResponse.json({ status: 'success', message: `Berhasil update status ${count} pesanan.` });
    }

    if (action === 'bulk_delete') {
      await prisma.$transaction(async (tx) => {
        count += await processDeleteForSource(tx, 'CSO', csoIdArray);
        count += await processDeleteForSource(tx, 'CSO_AUTO', csoAutoIdArray);
        count += await processDeleteForSource(tx, 'CRM', crmIdArray);

        if (count > 0 && userId) {
          await tx.activity_logs.create({
            data: {
              user_id: userId,
              action: 'Bulk Delete',
              target: 'Pesanan',
              details: `Menghapus ${count} pesanan massal`,
            },
          });
        }
      });

      await emitEvent('REFRESH_OLAHAN');

      return NextResponse.json({ status: 'success', message: `Berhasil menghapus ${count} pesanan.` });
    }

    return NextResponse.json({ status: 'error', message: 'Action tidak dikenal.' }, { status: 400 });
  } catch (error: any) {
    console.error('Error action olahan:', error);
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}
