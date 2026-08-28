import { NextRequest, NextResponse } from 'next/server';

import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Terjadi kesalahan');

export async function GET() {
  try {
    const [warehouses, products, stockRows] = await Promise.all([
      prisma.warehouses.findMany({
        select: {
          id: true,
          warehouse_name: true,
        },
        orderBy: { warehouse_name: 'asc' },
      }),
      prisma.products.findMany({
        where: { status: 'active' },
        select: {
          id: true,
          product_name: true,
          sku: true,
          price: true,
          image_url: true,
        },
        orderBy: { product_name: 'asc' },
      }),
      // bad_stock is a new column the generated Prisma client doesn't know about yet
      // (client regeneration is blocked by a locked file on this machine), so read it raw.
      prisma.$queryRawUnsafe<Array<{ product_id: number; warehouse_id: number; stock: number; bad_stock: number }>>(
        'SELECT product_id, warehouse_id, stock, bad_stock FROM warehouse_stock',
      ),
    ]);

    const stockMap: Record<number, Record<number, number>> = {};
    const badStockMap: Record<number, Record<number, number>> = {};
    stockRows.forEach((row) => {
      if (!stockMap[row.product_id]) stockMap[row.product_id] = {};
      if (!badStockMap[row.product_id]) badStockMap[row.product_id] = {};
      stockMap[row.product_id][row.warehouse_id] = row.stock;
      badStockMap[row.product_id][row.warehouse_id] = row.bad_stock;
    });

    const data = products.map((product) => {
      const warehouse_stocks = stockMap[product.id] || {};
      const warehouse_bad_stocks = badStockMap[product.id] || {};
      const total_stock = Object.values(warehouse_stocks).reduce((sum, value) => sum + value, 0);
      const total_bad_stock = Object.values(warehouse_bad_stocks).reduce((sum, value) => sum + value, 0);

      return {
        id: product.id,
        product_name: product.product_name,
        sku: product.sku,
        price: Number(product.price || 0),
        image_url: product.image_url,
        total_stock,
        total_bad_stock,
        warehouse_stocks: Object.fromEntries(
          Object.entries(warehouse_stocks).map(([warehouseId, stock]) => [String(warehouseId), stock])
        ),
        warehouse_bad_stocks: Object.fromEntries(
          Object.entries(warehouse_bad_stocks).map(([warehouseId, stock]) => [String(warehouseId), stock])
        ),
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        warehouses,
        products: data,
      },
    });
  } catch (error: unknown) {
    console.error('[API /stock/products GET]', error);
    return NextResponse.json({ success: false, message: getErrorMessage(error) || 'Gagal mengambil data stok produk' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = String(body?.action || '');

    if (action !== 'update_stock') {
      return NextResponse.json({ success: false, message: 'Action tidak valid' }, { status: 400 });
    }

    const productId = Number(body?.id || 0);
    const stocks = body?.warehouse_stocks && typeof body.warehouse_stocks === 'object' ? body.warehouse_stocks : {};
    const badStocks = body?.warehouse_bad_stocks && typeof body.warehouse_bad_stocks === 'object' ? body.warehouse_bad_stocks : {};

    if (!productId) {
      return NextResponse.json({ success: false, message: 'ID produk wajib diisi.' }, { status: 400 });
    }

    const warehouseIds = new Set<number>([
      ...Object.keys(stocks).map(Number),
      ...Object.keys(badStocks).map(Number),
    ]);

    await prisma.$transaction(
      Array.from(warehouseIds)
        .filter((warehouseId) => warehouseId > 0)
        .map((warehouseId) => {
          const stock = Math.max(0, Number(stocks[warehouseId]) || 0);
          const badStock = Math.max(0, Number(badStocks[warehouseId]) || 0);
          return prisma.$executeRawUnsafe(
            `INSERT INTO warehouse_stock (product_id, warehouse_id, stock, bad_stock)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE stock = VALUES(stock), bad_stock = VALUES(bad_stock)`,
            productId,
            warehouseId,
            stock,
            badStock,
          );
        })
    );

    return NextResponse.json({ success: true, message: 'Stok produk di semua gudang berhasil diperbarui.' });
  } catch (error: unknown) {
    console.error('[API /stock/products POST]', error);
    return NextResponse.json({ success: false, message: getErrorMessage(error) || 'Gagal memperbarui stok produk' }, { status: 500 });
  }
}
