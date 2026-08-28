import { NextResponse } from 'next/server';
import crypto from 'crypto';

import prisma from '@/lib/db';
import { saveUploadBuffer } from '@/lib/uploadStorage';
import { syncOrderTimestampColumns } from '@/lib/orderTimestamps';
import { logOrderStatusChange } from '@/lib/orderStatusLog';
import { emitEvent } from '@/lib/socket-server';

export const dynamic = 'force-dynamic';

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Terjadi kesalahan');

type Source = 'CSO' | 'CSO_AUTO' | 'CRM';

const SOURCE_CONFIG: Record<Source, { orders: string }> = {
  CSO: { orders: 'orders' },
  CSO_AUTO: { orders: 'orders_cso' },
  CRM: { orders: 'orders_crm' },
};

type StockType = 'good' | 'bad';

async function applyStockChange(
  tx: any,
  params: {
    itemType: 'product' | 'gift';
    itemId: number;
    warehouseId: number;
    stockType: StockType;
    delta: number;
    reason: string | null;
    invoiceNote: string | null;
    invoiceProofUrl: string | null;
    userId: number | null;
    occurredAt: Date;
  },
) {
  const { itemType, itemId, warehouseId, stockType, delta, reason, invoiceNote, invoiceProofUrl, userId, occurredAt } = params;
  const table = itemType === 'product' ? 'warehouse_stock' : 'warehouse_gift_stock';
  const idColumn = itemType === 'product' ? 'product_id' : 'gift_id';
  const column = stockType === 'bad' ? 'bad_stock' : 'stock';

  const existingRows: Array<{ stock: number; bad_stock: number }> = await tx.$queryRawUnsafe(
    `SELECT stock, bad_stock FROM ${table} WHERE ${idColumn} = ? AND warehouse_id = ?`,
    itemId,
    warehouseId,
  );
  const existing = existingRows[0];
  const before = existing ? Number(existing[column as 'stock' | 'bad_stock']) : 0;
  const after = before + delta;

  if (existing) {
    await tx.$executeRawUnsafe(`UPDATE ${table} SET ${column} = ? WHERE ${idColumn} = ? AND warehouse_id = ?`, after, itemId, warehouseId);
  } else {
    const otherColumn = column === 'stock' ? 'bad_stock' : 'stock';
    await tx.$executeRawUnsafe(
      `INSERT INTO ${table} (${idColumn}, warehouse_id, ${column}, ${otherColumn}) VALUES (?, ?, ?, 0)`,
      itemId,
      warehouseId,
      after,
    );
  }

  await tx.$executeRawUnsafe(
    `INSERT INTO inventory_adjustments (item_type, item_id, stock_type, warehouse_id, quantity_before, quantity_change, quantity_after, reason, invoice_note, invoice_proof_url, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    itemType,
    itemId,
    stockType,
    warehouseId,
    before,
    delta,
    after,
    reason,
    invoiceNote,
    invoiceProofUrl,
    userId,
    occurredAt,
  );
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const source = formData.get('source') as Source | null;
    const orderId = Number(formData.get('order_id') || 0);
    const itemsRaw = String(formData.get('items') || '[]');
    const reason = String(formData.get('reason') || '').trim() || null;
    const invoiceNote = String(formData.get('invoice_note') || '').trim() || null;
    const userId = Number(formData.get('user_id')) || null;
    const occurredAtRaw = formData.get('occurred_at');
    const occurredAtInput = occurredAtRaw ? new Date(String(occurredAtRaw)) : null;
    const occurredAt = occurredAtInput && !Number.isNaN(occurredAtInput.getTime()) ? occurredAtInput : new Date();

    if (!source || !SOURCE_CONFIG[source] || !orderId) {
      return NextResponse.json({ success: false, message: 'Source dan order_id wajib diisi.' }, { status: 400 });
    }

    let items: Array<{ product_id: number; is_gift: boolean; qty: number; quantity_good: number; quantity_bad: number }>;
    try {
      items = JSON.parse(itemsRaw);
    } catch {
      return NextResponse.json({ success: false, message: 'Data item retur tidak valid.' }, { status: 400 });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, message: 'Item retur tidak boleh kosong.' }, { status: 400 });
    }

    for (const item of items) {
      const good = Number(item.quantity_good) || 0;
      const bad = Number(item.quantity_bad) || 0;
      if (good < 0 || bad < 0 || good + bad !== Number(item.qty)) {
        return NextResponse.json({ success: false, message: `Total Baik + Rusak untuk "${(item as any).product_name || 'item'}" harus sama dengan jumlah yang dibeli (${item.qty}).` }, { status: 400 });
      }
    }

    let invoiceProofUrl: string | null = null;
    const invoiceProofFile = formData.get('invoice_proof') as File | null;
    if (invoiceProofFile && invoiceProofFile.size > 0) {
      const bytes = await invoiceProofFile.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const ext = invoiceProofFile.name.split('.').pop() || 'jpg';
      const filename = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
      const stored = await saveUploadBuffer(['inventory'], filename, buffer);
      invoiceProofUrl = stored.url;
    }

    const { orders } = SOURCE_CONFIG[source];
    const messages: string[] = [];

    await prisma.$transaction(async (tx) => {
      const orderRows: any[] = await tx.$queryRawUnsafe(
        `SELECT id, order_code, order_status, warehouse_id FROM ${orders} WHERE id = ? LIMIT 1`,
        orderId,
      );
      const order = orderRows[0];
      if (!order) {
        throw new Error('Order tidak ditemukan.');
      }
      if (order.order_status !== 'shipped') {
        throw new Error(`Order ${order.order_code} sudah bukan status Shipped (sekarang: ${order.order_status}), tidak bisa diretur.`);
      }
      const warehouseId = Number(order.warehouse_id) || 0;
      if (!warehouseId) {
        throw new Error(`Order ${order.order_code} tidak punya gudang terpasang.`);
      }

      const orderReason = reason ? `Retur order ${order.order_code}: ${reason}` : `Retur order ${order.order_code}`;

      for (const item of items) {
        const itemType: 'product' | 'gift' = item.is_gift ? 'gift' : 'product';
        const good = Number(item.quantity_good) || 0;
        const bad = Number(item.quantity_bad) || 0;

        if (good > 0) {
          await applyStockChange(tx, {
            itemType,
            itemId: Number(item.product_id),
            warehouseId,
            stockType: 'good',
            delta: good,
            reason: orderReason,
            invoiceNote,
            invoiceProofUrl,
            userId,
            occurredAt,
          });
        }
        if (bad > 0) {
          await applyStockChange(tx, {
            itemType,
            itemId: Number(item.product_id),
            warehouseId,
            stockType: 'bad',
            delta: bad,
            reason: orderReason,
            invoiceNote,
            invoiceProofUrl,
            userId,
            occurredAt,
          });
        }
      }

      const updated = await tx.$executeRawUnsafe(
        `UPDATE ${orders} SET order_status = 'rts', updated_at = ? WHERE id = ? AND order_status = 'shipped'`,
        occurredAt,
        orderId,
      );
      if (!updated) {
        throw new Error(`Order ${order.order_code} sudah diubah statusnya oleh proses lain, silakan coba lagi.`);
      }

      await syncOrderTimestampColumns(tx, orders, orderId, 'rts', occurredAt);
      await logOrderStatusChange(tx, {
        userId,
        orderCode: order.order_code,
        source,
        fromStatus: order.order_status,
        toStatus: 'rts',
        reason: reason ? `Input Retur: ${reason}` : 'Input Retur',
      });

      messages.push(`Order ${order.order_code} berhasil diretur (status: Retur/RTS).`);
    });

    await emitEvent('REFRESH_OLAHAN');

    return NextResponse.json({ success: true, message: messages.join(' ') });
  } catch (error: unknown) {
    console.error('[API /inventory/retur/confirm POST]', error);
    return NextResponse.json({ success: false, message: getErrorMessage(error) || 'Gagal memproses retur' }, { status: 400 });
  }
}
