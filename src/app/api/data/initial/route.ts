import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

const jsonSafe = <T>(value: T): T => JSON.parse(JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item)) as T;

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Fetch Products
    const products = await prisma.products.findMany({
      where: { status: 'active' },
      select: {
        id: true,
        product_name: true,
        price: true,
        weight_gram: true,
        image_url: true,
      },
      orderBy: { product_name: 'asc' },
    });

    // 2. Fetch Gifts
    const gifts = await prisma.gifts.findMany({
      where: { status: 'active' },
      select: {
        id: true,
        gift_name: true,
        weight_gram: true,
        image_url: true,
      },
      orderBy: { gift_name: 'asc' },
    });

    // 3. Fetch Warehouses
    const warehouses = await prisma.warehouses.findMany({
      select: {
        id: true,
        warehouse_name: true,
        code: true,
        address: true,
        district: true,
        city: true,
        province: true,
        distance_km: true,
      },
      orderBy: { distance_km: 'asc' },
    });

    // 4. Fetch Payment Methods Data
    const paymentAccounts = await prisma.payment_accounts.findMany({
      orderBy: { bank_name: 'asc' },
    });

    const noPaymentMethods = await prisma.no_payment_methods.findMany({
      where: { is_active: true },
      orderBy: { method_name: 'asc' },
    });

    // 5. Fetch Promos, Advertisers, Ad Sources
    const promos = await prisma.promos.findMany({
      where: { status: 'active' },
      select: {
        id: true,
        promo_name: true,
      },
      orderBy: { promo_name: 'asc' },
    });

    const advertisers = await prisma.advertisers.findMany({
      where: { status: 'active' },
      select: {
        id: true,
        name: true,
      },
      orderBy: { name: 'asc' },
    });

    const adSources = await prisma.ad_sources.findMany({
      where: { status: 'active' },
      select: {
        id: true,
        name: true,
      },
      orderBy: { name: 'asc' },
    });

    // 6. Fetch Shipping & Courier settings
    const ongkirSettings = await prisma.ongkir_settings.findMany();
    const shippingWeightSettings = await prisma.shipping_weight_settings.findFirst();
    const courierRules = await prisma.couriers.findMany();

    // 7. Fetch Warehouse Stocks (Products & Gifts)
    const rawStocks = await prisma.warehouse_stock.findMany();
    const rawGiftStocks = await prisma.warehouse_gift_stock.findMany();

    // Transform stocks into a map: stockData[warehouseId][productId] = stock
    const stockData: Record<number, Record<number, number>> = {};
    const giftStockData: Record<number, Record<number, number>> = {};

    rawStocks.forEach((st) => {
      if (!stockData[st.warehouse_id]) {
        stockData[st.warehouse_id] = {};
      }
      stockData[st.warehouse_id][st.product_id] = st.stock;
    });

    rawGiftStocks.forEach((st) => {
      if (!giftStockData[st.warehouse_id]) {
        giftStockData[st.warehouse_id] = {};
      }
      giftStockData[st.warehouse_id][st.gift_id] = st.stock;
    });

    // Also inject total_stock into products and gifts
    const productsWithStock = products.map((p) => {
      let total = 0;
      for (const w in stockData) {
        if (stockData[w][p.id]) {
          total += stockData[w][p.id];
        }
      }
      return { ...p, total_stock: total };
    });

    const giftsWithStock = gifts.map((g) => {
      let total = 0;
      for (const w in giftStockData) {
        if (giftStockData[w][g.id]) {
          total += giftStockData[w][g.id];
        }
      }
      return { ...g, total_stock: total };
    });

    // Format couriers as dictionary for frontend
    const courierWeightRules: Record<string, any> = {};
    courierRules.forEach((c) => {
      if (c.code) {
        courierWeightRules[c.code.toUpperCase()] = c;
      } else if (c.courier_name) {
        courierWeightRules[c.courier_name.toUpperCase()] = c;
      }
    });

    return NextResponse.json(jsonSafe({
      status: 'success',
      data: {
        products: productsWithStock,
        gifts: giftsWithStock,
        warehouses,
        paymentAccounts,
        noPaymentMethods,
        promos,
        advertisers,
        adSources,
        ongkirSettings,
        shippingWeightSettings: shippingWeightSettings || {
          default_item_weight_gram: 200,
          base_weight_gram: 1000,
          extra_weight_step_gram: 1000,
          rounding_tolerance_gram: 300,
        },
        courierWeightRules,
        stockData,
        giftStockData,
      },
    }));
  } catch (error: any) {
    console.error('Error fetching initial data:', error);
    return NextResponse.json(
      { status: 'error', message: error.message },
      { status: 500 }
    );
  }
}
