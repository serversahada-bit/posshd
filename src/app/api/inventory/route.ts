import { NextResponse } from 'next/server';

import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Terjadi kesalahan');

export async function GET() {
  try {
    const [warehouses, products, gifts, productStockRows, giftStockRows] = await Promise.all([
      prisma.warehouses.findMany({
        select: { id: true, warehouse_name: true },
        orderBy: { warehouse_name: 'asc' },
      }),
      prisma.products.findMany({
        where: { status: 'active' },
        select: { id: true, product_name: true, sku: true, price: true, image_url: true },
        orderBy: { product_name: 'asc' },
      }),
      prisma.gifts.findMany({
        where: { status: 'active' },
        select: { id: true, gift_name: true, sku: true, price: true, image_url: true },
        orderBy: { gift_name: 'asc' },
      }),
      prisma.warehouse_stock.findMany({ select: { product_id: true, warehouse_id: true, stock: true } }),
      prisma.warehouse_gift_stock.findMany({ select: { gift_id: true, warehouse_id: true, stock: true } }),
    ]);

    const buildStockMap = <T extends Record<string, number>>(rows: T[], idKey: keyof T) => {
      const map: Record<number, Record<number, number>> = {};
      rows.forEach((row) => {
        const id = row[idKey];
        if (!map[id]) map[id] = {};
        map[id][row.warehouse_id] = row.stock;
      });
      return map;
    };

    const productStockMap = buildStockMap(productStockRows, 'product_id');
    const giftStockMap = buildStockMap(giftStockRows, 'gift_id');

    const items = [
      ...products.map((product) => {
        const warehouse_stocks = productStockMap[product.id] || {};
        return {
          item_type: 'product' as const,
          id: product.id,
          name: product.product_name,
          sku: product.sku,
          price: Number(product.price || 0),
          image_url: product.image_url,
          total_stock: Object.values(warehouse_stocks).reduce((sum, v) => sum + v, 0),
          warehouse_stocks,
        };
      }),
      ...gifts.map((gift) => {
        const warehouse_stocks = giftStockMap[gift.id] || {};
        return {
          item_type: 'gift' as const,
          id: gift.id,
          name: gift.gift_name,
          sku: gift.sku,
          price: Number(gift.price || 0),
          image_url: gift.image_url,
          total_stock: Object.values(warehouse_stocks).reduce((sum, v) => sum + v, 0),
          warehouse_stocks,
        };
      }),
    ];

    return NextResponse.json({ success: true, data: { warehouses, items } });
  } catch (error: unknown) {
    console.error('[API /inventory GET]', error);
    return NextResponse.json({ success: false, message: getErrorMessage(error) || 'Gagal mengambil data inventori' }, { status: 500 });
  }
}
