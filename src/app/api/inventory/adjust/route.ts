import { NextResponse } from 'next/server';
import crypto from 'crypto';

import prisma from '@/lib/db';
import { saveUploadBuffer } from '@/lib/uploadStorage';

export const dynamic = 'force-dynamic';

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Terjadi kesalahan');

type StockType = 'good' | 'bad';

// bad_stock/stock_type are new columns that the generated Prisma client doesn't know about
// yet (client regeneration is blocked by a locked file on this machine), so this whole route
// talks to warehouse_stock/warehouse_gift_stock/inventory_adjustments via raw SQL instead.
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

  if (after < 0) {
    const label = stockType === 'bad' ? 'Stok rusak' : 'Stok';
    throw new Error(`${label} tidak mencukupi. Stok saat ini ${before}, tidak bisa dikurangi ${Math.abs(delta)}.`);
  }

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

  return { before, after };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const itemType = formData.get('item_type') === 'gift' ? 'gift' : formData.get('item_type') === 'product' ? 'product' : null;
    const itemId = Number(formData.get('item_id') || 0);
    const warehouseId = Number(formData.get('warehouse_id') || 0);
    const reason = String(formData.get('reason') || '').trim() || null;
    const invoiceNote = String(formData.get('invoice_note') || '').trim() || null;
    const userId = Number(formData.get('user_id')) || null;
    const occurredAtRaw = formData.get('occurred_at');
    const occurredAtInput = occurredAtRaw ? new Date(String(occurredAtRaw)) : null;
    const occurredAt = occurredAtInput && !Number.isNaN(occurredAtInput.getTime()) ? occurredAtInput : new Date();

    if (!itemType || !itemId || !warehouseId) {
      return NextResponse.json({ success: false, message: 'Item, tipe item, dan gudang wajib diisi.' }, { status: 400 });
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

    // Tambah Inventori sends split quantity_good/quantity_bad; Kurangi Inventori still sends
    // a single quantity_change (always applied to good/sellable stock).
    const hasSplit = formData.has('quantity_good') || formData.has('quantity_bad');
    const quantityGood = Number(formData.get('quantity_good') || 0);
    const quantityBad = Number(formData.get('quantity_bad') || 0);
    const quantityChange = Number(formData.get('quantity_change') || 0);

    if (hasSplit ? (!quantityGood && !quantityBad) : !quantityChange) {
      return NextResponse.json({ success: false, message: 'Jumlah tidak boleh 0.' }, { status: 400 });
    }

    const messages: string[] = [];

    await prisma.$transaction(async (tx) => {
      if (hasSplit) {
        if (quantityGood) {
          const r = await applyStockChange(tx, { itemType, itemId, warehouseId, stockType: 'good', delta: quantityGood, reason, invoiceNote, invoiceProofUrl, userId, occurredAt });
          messages.push(`Stok baik: ${r.before} -> ${r.after}`);
        }
        if (quantityBad) {
          const r = await applyStockChange(tx, { itemType, itemId, warehouseId, stockType: 'bad', delta: quantityBad, reason, invoiceNote, invoiceProofUrl, userId, occurredAt });
          messages.push(`Stok rusak: ${r.before} -> ${r.after}`);
        }
      } else {
        const r = await applyStockChange(tx, { itemType, itemId, warehouseId, stockType: 'good', delta: quantityChange, reason, invoiceNote, invoiceProofUrl, userId, occurredAt });
        messages.push(`Stok berhasil disesuaikan: ${r.before} -> ${r.after}`);
      }
    });

    return NextResponse.json({ success: true, message: messages.join('. ') + '.' });
  } catch (error: unknown) {
    console.error('[API /inventory/adjust POST]', error);
    return NextResponse.json({ success: false, message: getErrorMessage(error) || 'Gagal menyesuaikan stok' }, { status: 400 });
  }
}
