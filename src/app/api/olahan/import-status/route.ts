import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { Prisma, orders_cso_order_status, orders_crm_order_status, orders_order_status } from '@prisma/client';
import { Buffer } from 'node:buffer';

import prisma from '@/lib/db';
import { emitEvent } from '@/lib/socket-server';

export const dynamic = 'force-dynamic';

const statusAliasMap: Record<string, string> = {
  pending: 'pending',
  processing: 'processing',
  'ready_to_ship': 'ready_to_ship',
  'ready to ship': 'ready_to_ship',
  'readytoship': 'ready_to_ship',
  'redy to ship': 'ready_to_ship',
  shipped: 'shipped',
  completed: 'completed',
  rts: 'rts',
  problem: 'problem',
  cancelled: 'cancelled',
  cancel: 'cancelled',
  paid: 'paid',
};

function normalizeStatus(value: string) {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ');
  return statusAliasMap[normalized] || statusAliasMap[normalized.replace(/ /g, '_')] || '';
}

function buildStatusUpdateData<TStatus extends string>(status: TStatus) {
  if (status === 'pending') {
    return {
      order_status: status,
      updated_at: new Date(),
    };
  }

  return {
    order_status: status,
  };
}

async function findOrderByCode(tx: Prisma.TransactionClient, orderCode: string) {
  const regular = await tx.orders.findFirst({ where: { order_code: orderCode }, select: { id: true } });
  if (regular) {
    return { orderId: regular.id, sourceTable: 'orders' as const };
  }

  const cso = await tx.orders_cso.findFirst({ where: { order_code: orderCode }, select: { id: true } });
  if (cso) {
    return { orderId: cso.id, sourceTable: 'orders_cso' as const };
  }

  const crm = await tx.orders_crm.findFirst({ where: { order_code: orderCode }, select: { id: true } });
  if (crm) {
    return { orderId: crm.id, sourceTable: 'orders_crm' as const };
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const userId = Number(formData.get('user_id') || 0);

    if (!(file instanceof File)) {
      return NextResponse.json({ status: 'error', message: 'File wajib diunggah.' }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      return NextResponse.json({ status: 'error', message: 'Format file tidak valid. Harap gunakan format .xlsx' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    const fileBuffer = Buffer.from(bytes) as unknown as Parameters<typeof workbook.xlsx.load>[0];
    await workbook.xlsx.load(fileBuffer);
    const worksheet = workbook.worksheets[0];

    if (!worksheet) {
      return NextResponse.json({ status: 'error', message: 'Worksheet tidak ditemukan dalam file.' }, { status: 400 });
    }

    let successCount = 0;

    await prisma.$transaction(async (tx) => {
      for (let rowIndex = 2; rowIndex <= worksheet.rowCount; rowIndex += 1) {
        const row = worksheet.getRow(rowIndex);
        const kodePesanan = String(row.getCell(1).text || '').trim();
        let statusBaruRaw = String(row.getCell(2).text || '').trim();
        const noResi = String(row.getCell(4).text || '').trim();

        if (!kodePesanan) {
          continue;
        }

        if (!statusBaruRaw && noResi) {
          statusBaruRaw = 'shipped';
        }

        const statusBaru = normalizeStatus(statusBaruRaw);
        if (!statusBaru && !noResi) {
          continue;
        }

        const order = await findOrderByCode(tx, kodePesanan);
        if (!order) {
          continue;
        }

        if (order.sourceTable === 'orders') {
          if (statusBaru) {
            await tx.orders.update({
              where: { id: order.orderId },
              data: buildStatusUpdateData(statusBaru as orders_order_status),
            });
          }

          if (noResi) {
            const shipment = await tx.shipments.findFirst({ where: { order_id: order.orderId }, select: { id: true, shipment_status: true } });
            if (shipment) {
              await tx.shipments.update({
                where: { id: shipment.id },
                data: {
                  tracking_number: noResi,
                  shipment_status: shipment.shipment_status === 'pending' && statusBaru === 'shipped' ? 'shipped' : shipment.shipment_status,
                },
              });
            } else {
              await tx.shipments.create({
                data: {
                  order_id: order.orderId,
                  tracking_number: noResi,
                  shipment_status: statusBaru === 'shipped' ? 'shipped' : 'pending',
                },
              });
            }
          }
        } else if (order.sourceTable === 'orders_cso') {
          if (statusBaru) {
            await tx.orders_cso.update({
              where: { id: order.orderId },
              data: buildStatusUpdateData(statusBaru as orders_cso_order_status),
            });
          }

          if (noResi) {
            const shipment = await tx.shipments_cso.findFirst({ where: { order_id: order.orderId }, select: { id: true, shipment_status: true } });
            if (shipment) {
              await tx.shipments_cso.update({
                where: { id: shipment.id },
                data: {
                  tracking_number: noResi,
                  shipment_status: shipment.shipment_status === 'pending' && statusBaru === 'shipped' ? 'shipped' : shipment.shipment_status,
                },
              });
            } else {
              await tx.shipments_cso.create({
                data: {
                  order_id: order.orderId,
                  tracking_number: noResi,
                  shipment_status: statusBaru === 'shipped' ? 'shipped' : 'pending',
                },
              });
            }
          }
        } else {
          if (statusBaru) {
            await tx.orders_crm.update({
              where: { id: order.orderId },
              data: buildStatusUpdateData(statusBaru as orders_crm_order_status),
            });
          }

          if (noResi) {
            const shipment = await tx.shipments_crm.findFirst({ where: { order_id: order.orderId }, select: { id: true, shipment_status: true } });
            if (shipment) {
              await tx.shipments_crm.update({
                where: { id: shipment.id },
                data: {
                  tracking_number: noResi,
                  shipment_status: shipment.shipment_status === 'pending' && statusBaru === 'shipped' ? 'shipped' : shipment.shipment_status,
                },
              });
            } else {
              await tx.shipments_crm.create({
                data: {
                  order_id: order.orderId,
                  tracking_number: noResi,
                  shipment_status: statusBaru === 'shipped' ? 'shipped' : 'pending',
                },
              });
            }
          }
        }

        successCount += 1;
      }

      if (successCount > 0 && userId > 0) {
        await tx.activity_logs.create({
          data: {
            user_id: userId,
            action: 'Import Status',
            target: 'Pesanan',
            details: `Import update status sebanyak ${successCount} pesanan`,
          },
        });
      }
    });

    await emitEvent('REFRESH_OLAHAN');

    return NextResponse.json({
      status: 'success',
      message: `Berhasil memperbarui ${successCount} data pesanan.`,
    });
  } catch (error: unknown) {
    console.error('[API /olahan/import-status POST]', error);
    return NextResponse.json({ status: 'error', message: error instanceof Error ? error.message : 'Gagal memproses file status' }, { status: 500 });
  }
}
