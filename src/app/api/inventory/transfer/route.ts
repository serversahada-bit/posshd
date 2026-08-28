import { NextResponse } from 'next/server';

import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Terjadi kesalahan');

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const itemType = body?.item_type === 'gift' ? 'gift' : body?.item_type === 'product' ? 'product' : null;
    const itemId = Number(body?.item_id || 0);
    const fromWarehouseId = Number(body?.from_warehouse_id || 0);
    const toWarehouseId = Number(body?.to_warehouse_id || 0);
    const quantity = Math.abs(Number(body?.quantity || 0));
    const reason = String(body?.reason || '').trim();
    const userId = Number(body?.user_id) || null;
    const occurredAtInput = body?.occurred_at ? new Date(body.occurred_at) : null;
    const occurredAt = occurredAtInput && !Number.isNaN(occurredAtInput.getTime()) ? occurredAtInput : new Date();

    if (!itemType || !itemId || !fromWarehouseId || !toWarehouseId) {
      return NextResponse.json({ success: false, message: 'Item, gudang asal, dan gudang tujuan wajib diisi.' }, { status: 400 });
    }
    if (fromWarehouseId === toWarehouseId) {
      return NextResponse.json({ success: false, message: 'Gudang asal dan tujuan tidak boleh sama.' }, { status: 400 });
    }
    if (!quantity) {
      return NextResponse.json({ success: false, message: 'Jumlah transfer tidak boleh 0.' }, { status: 400 });
    }

    const [fromWarehouse, toWarehouse] = await Promise.all([
      prisma.warehouses.findUnique({ where: { id: fromWarehouseId }, select: { warehouse_name: true } }),
      prisma.warehouses.findUnique({ where: { id: toWarehouseId }, select: { warehouse_name: true } }),
    ]);

    const reasonFrom = [`Transfer ke ${toWarehouse?.warehouse_name || 'gudang lain'}`, reason].filter(Boolean).join(' - ');
    const reasonTo = [`Transfer dari ${fromWarehouse?.warehouse_name || 'gudang lain'}`, reason].filter(Boolean).join(' - ');

    const stockModel = itemType === 'product' ? prisma.warehouse_stock : prisma.warehouse_gift_stock;
    const whereKey = itemType === 'product' ? 'product_id_warehouse_id' : 'gift_id_warehouse_id';
    const idField = itemType === 'product' ? 'product_id' : 'gift_id';

    await prisma.$transaction(async (tx) => {
      const stockTx = itemType === 'product' ? tx.warehouse_stock : tx.warehouse_gift_stock;

      const existingFrom = await (stockTx as any).findUnique({
        where: { [whereKey]: { [idField]: itemId, warehouse_id: fromWarehouseId } },
        select: { stock: true },
      });
      const fromBefore = existingFrom?.stock ?? 0;
      if (fromBefore < quantity) {
        throw new Error(`Stok di gudang asal tidak mencukupi. Stok saat ini ${fromBefore}, tidak bisa transfer ${quantity}.`);
      }
      const fromAfter = fromBefore - quantity;

      const existingTo = await (stockTx as any).findUnique({
        where: { [whereKey]: { [idField]: itemId, warehouse_id: toWarehouseId } },
        select: { stock: true },
      });
      const toBefore = existingTo?.stock ?? 0;
      const toAfter = toBefore + quantity;

      await (stockTx as any).upsert({
        where: { [whereKey]: { [idField]: itemId, warehouse_id: fromWarehouseId } },
        create: { [idField]: itemId, warehouse_id: fromWarehouseId, stock: fromAfter },
        update: { stock: fromAfter },
      });
      await (stockTx as any).upsert({
        where: { [whereKey]: { [idField]: itemId, warehouse_id: toWarehouseId } },
        create: { [idField]: itemId, warehouse_id: toWarehouseId, stock: toAfter },
        update: { stock: toAfter },
      });

      await tx.$executeRawUnsafe(
        `INSERT INTO inventory_adjustments (item_type, item_id, warehouse_id, quantity_before, quantity_change, quantity_after, reason, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        itemType, itemId, fromWarehouseId, fromBefore, -quantity, fromAfter, reasonFrom, userId, occurredAt,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO inventory_adjustments (item_type, item_id, warehouse_id, quantity_before, quantity_change, quantity_after, reason, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        itemType, itemId, toWarehouseId, toBefore, quantity, toAfter, reasonTo, userId, occurredAt,
      );
    });

    return NextResponse.json({
      success: true,
      message: `Berhasil memindahkan ${quantity} stok dari ${fromWarehouse?.warehouse_name || 'gudang asal'} ke ${toWarehouse?.warehouse_name || 'gudang tujuan'}.`,
    });
  } catch (error: unknown) {
    console.error('[API /inventory/transfer POST]', error);
    return NextResponse.json({ success: false, message: getErrorMessage(error) || 'Gagal memindahkan stok' }, { status: 400 });
  }
}
