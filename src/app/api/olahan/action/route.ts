import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { emitEvent } from '@/lib/socket-server';
import { syncOrderTimestampColumns } from '@/lib/orderTimestamps';
import { logOrderStatusChange } from '@/lib/orderStatusLog';

export const dynamic = 'force-dynamic';

function buildStatusUpdateQuery(tableName: string, ids: number[]) {
  const placeholders = ids.map(() => '?').join(', ');
  return `UPDATE ${tableName} SET order_status = ?, updated_at = ? WHERE id IN (${placeholders})`;
}

function buildStatusUpdateParams(status: string, ids: number[], eventAt: Date) {
  return [status, eventAt, ...ids];
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
        const csoRows = csoIdArray.length > 0 ? await tx.$queryRawUnsafe<any[]>(`SELECT id, order_code, order_status FROM orders WHERE id IN (${csoIdArray.map(() => '?').join(', ')})`, ...csoIdArray) : [];
        const csoAutoRows = csoAutoIdArray.length > 0 ? await tx.$queryRawUnsafe<any[]>(`SELECT id, order_code, order_status FROM orders_cso WHERE id IN (${csoAutoIdArray.map(() => '?').join(', ')})`, ...csoAutoIdArray) : [];
        const crmRows = crmIdArray.length > 0 ? await tx.$queryRawUnsafe<any[]>(`SELECT id, order_code, order_status FROM orders_crm WHERE id IN (${crmIdArray.map(() => '?').join(', ')})`, ...crmIdArray) : [];

        if (csoIdArray.length > 0) {
          await tx.$executeRawUnsafe(
            buildStatusUpdateQuery('orders', csoIdArray),
            ...buildStatusUpdateParams(bulk_status, csoIdArray, eventAt),
          );
          for (const id of csoIdArray) {
            await syncOrderTimestampColumns(tx, 'orders', id, bulk_status, eventAt);
            const row = csoRows.find((item) => Number(item.id) === id);
            if (row && row.order_status !== bulk_status) {
              await logOrderStatusChange(tx, { userId, orderCode: row.order_code, source: 'CSO', fromStatus: row.order_status, toStatus: bulk_status, reason: 'Bulk update status' });
            }
          }
          count += csoIdArray.length;
        }

        if (csoAutoIdArray.length > 0) {
          await tx.$executeRawUnsafe(
            buildStatusUpdateQuery('orders_cso', csoAutoIdArray),
            ...buildStatusUpdateParams(bulk_status, csoAutoIdArray, eventAt),
          );
          for (const id of csoAutoIdArray) {
            await syncOrderTimestampColumns(tx, 'orders_cso', id, bulk_status, eventAt);
            const row = csoAutoRows.find((item) => Number(item.id) === id);
            if (row && row.order_status !== bulk_status) {
              await logOrderStatusChange(tx, { userId, orderCode: row.order_code, source: 'CSO_AUTO', fromStatus: row.order_status, toStatus: bulk_status, reason: 'Bulk update status' });
            }
          }
          count += csoAutoIdArray.length;
        }

        if (crmIdArray.length > 0) {
          await tx.$executeRawUnsafe(
            buildStatusUpdateQuery('orders_crm', crmIdArray),
            ...buildStatusUpdateParams(bulk_status, crmIdArray, eventAt),
          );
          for (const id of crmIdArray) {
            await syncOrderTimestampColumns(tx, 'orders_crm', id, bulk_status, eventAt);
            const row = crmRows.find((item) => Number(item.id) === id);
            if (row && row.order_status !== bulk_status) {
              await logOrderStatusChange(tx, { userId, orderCode: row.order_code, source: 'CRM', fromStatus: row.order_status, toStatus: bulk_status, reason: 'Bulk update status' });
            }
          }
          count += crmIdArray.length;
        }

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
      const processDelete = async (tx: any, ids: number[], source: string) => {
        if (ids.length === 0) return;

        let tOrders = '';
        let tItems = '';

        if (source === 'CRM') {
          tOrders = 'orders_crm';
          tItems = 'order_items_crm';
        } else if (source === 'CSO_AUTO') {
          tOrders = 'orders_cso';
          tItems = 'order_items_cso';
        } else {
          tOrders = 'orders';
          tItems = 'order_items';
        }

        for (const deleteId of ids) {
          const whResult: any[] = await tx.$queryRawUnsafe(`SELECT warehouse_id FROM ${tOrders} WHERE id = ?`, deleteId);
          const whId = whResult[0]?.warehouse_id;

          if (whId) {
            const items: any[] = await tx.$queryRawUnsafe(`SELECT product_id, qty, is_gift, is_bundle FROM ${tItems} WHERE order_id = ?`, deleteId);

            for (const item of items) {
              const isGiftItem = item.is_gift ? 1 : 0;
              const isBundleItem = item.is_bundle ? 1 : 0;
              const qty = Number(item.qty) || 0;
              const pid = Number(item.product_id) || 0;

              if (isBundleItem === 1) {
                const bItems: any[] = await tx.$queryRawUnsafe(`SELECT product_id, qty FROM product_bundle_items WHERE bundle_id = ?`, pid);
                for (const bItem of bItems) {
                  const compPid = Number(bItem.product_id) || 0;
                  const reqQty = Number(bItem.qty) * qty;
                  await tx.$queryRawUnsafe(`UPDATE warehouse_stock SET stock = stock + ? WHERE product_id = ? AND warehouse_id = ?`, reqQty, compPid, whId);
                }
              } else if (isGiftItem === 1) {
                await tx.$queryRawUnsafe(`UPDATE warehouse_gift_stock SET stock = stock + ? WHERE gift_id = ? AND warehouse_id = ?`, qty, pid, whId);
              } else {
                await tx.$queryRawUnsafe(`UPDATE warehouse_stock SET stock = stock + ? WHERE product_id = ? AND warehouse_id = ?`, qty, pid, whId);
              }
            }
          }

          await tx.$queryRawUnsafe(`DELETE FROM ${tOrders} WHERE id = ?`, deleteId);
          count++;
        }
      };

      await prisma.$transaction(async (tx) => {
        await processDelete(tx, csoIdArray, 'CSO');
        await processDelete(tx, csoAutoIdArray, 'CSO_AUTO');
        await processDelete(tx, crmIdArray, 'CRM');

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

