import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

type Source = 'CSO' | 'CSO_AUTO' | 'CRM';
type ItemInput = { product_id: number; product_name?: string; qty: number; price: number; discount: number; is_gift: boolean; is_bundle: boolean };

const tableMap = {
  CSO: { orders: 'orders', items: 'order_items', payments: 'payments', shipments: 'shipments' },
  CSO_AUTO: { orders: 'orders_cso', items: 'order_items_cso', payments: 'payments_cso', shipments: 'shipments_cso' },
  CRM: { orders: 'orders_crm', items: 'order_items_crm', payments: 'payments_crm', shipments: 'shipments_crm' },
} as const;

function sourceOf(value: string | null): Source | null {
  return value === 'CSO' || value === 'CSO_AUTO' || value === 'CRM' ? value : null;
}

function safeJson(data: unknown) {
  return JSON.parse(JSON.stringify(data, (_, value) => typeof value === 'bigint' ? Number(value) : value));
}

async function hasColumn(tableName: string, columnName: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ Field: string }>>(
    `SHOW COLUMNS FROM ${tableName} LIKE ?`,
    columnName,
  );
  return rows.length > 0;
}

async function resolveOrder(id: string, source: Source) {
  const t = tableMap[source];
  let rows = await prisma.$queryRawUnsafe<any[]>(`SELECT id, order_code FROM ${t.orders} WHERE order_code = ? LIMIT 1`, id);
  if (!rows.length && /^\d+$/.test(id)) rows = await prisma.$queryRawUnsafe<any[]>(`SELECT id, order_code FROM ${t.orders} WHERE id = ? LIMIT 1`, Number(id));
  return rows[0] || null;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const source = sourceOf(url.searchParams.get('source'));
    const identifier = url.searchParams.get('id')?.trim();
    if (!source || !identifier) return NextResponse.json({ status: 'error', message: 'ID atau sumber pesanan tidak valid' }, { status: 400 });

    const resolved = await resolveOrder(identifier, source);
    if (!resolved) return NextResponse.json({ status: 'error', message: 'Pesanan tidak ditemukan' }, { status: 404 });
    const t = tableMap[source];
    const orderId = Number(resolved.id);

    const hasNoShippingCost = await hasColumn('no_payment_methods', 'no_shipping_cost');

    const [orders, items, payments, shipments, products, gifts, bundles, warehouses, couriers, promos, advertisers, adSources, paymentAccounts, noPaymentMethods, productStocks, giftStocks] = await Promise.all([
      prisma.$queryRawUnsafe<any[]>(`SELECT o.*, c.name customer_name, c.whatsapp_number, c.email, c.address, c.province, c.city, c.subdistrict, c.desa, c.age, c.complaint FROM ${t.orders} o LEFT JOIN customers c ON c.id=o.customer_id WHERE o.id=? LIMIT 1`, orderId),
      prisma.$queryRawUnsafe<any[]>(`SELECT oi.*, COALESCE(pb.image_url,p.image_url,g.image_url) image_url FROM ${t.items} oi LEFT JOIN products p ON p.id=oi.product_id AND COALESCE(oi.is_gift,0)=0 AND COALESCE(oi.is_bundle,0)=0 LEFT JOIN gifts g ON g.id=oi.product_id AND oi.is_gift=1 LEFT JOIN product_bundles pb ON pb.id=oi.product_id AND oi.is_bundle=1 WHERE oi.order_id=?`, orderId),
      prisma.$queryRawUnsafe<any[]>(`SELECT * FROM ${t.payments} WHERE order_id=? LIMIT 1`, orderId),
      prisma.$queryRawUnsafe<any[]>(`SELECT * FROM ${t.shipments} WHERE order_id=? LIMIT 1`, orderId),
      prisma.$queryRawUnsafe<any[]>(`SELECT p.id,p.product_name,p.price,p.weight_gram,p.image_url,COALESCE(SUM(ws.stock),0) total_stock FROM products p LEFT JOIN warehouse_stock ws ON ws.product_id=p.id WHERE p.status='active' GROUP BY p.id ORDER BY p.product_name`),
      prisma.$queryRawUnsafe<any[]>(`SELECT g.id,g.gift_name product_name,0 price,g.weight_gram,g.image_url,COALESCE(SUM(ws.stock),0) total_stock FROM gifts g LEFT JOIN warehouse_gift_stock ws ON ws.gift_id=g.id WHERE g.status='active' GROUP BY g.id ORDER BY g.gift_name`),
      prisma.$queryRawUnsafe<any[]>(`SELECT id,bundle_name product_name,price,image_url FROM product_bundles WHERE status='active' ORDER BY bundle_name`),
      prisma.warehouses.findMany({ orderBy: { warehouse_name: 'asc' } }),
      prisma.couriers.findMany({ orderBy: { courier_name: 'asc' } }),
      prisma.promos.findMany({ where: { status: 'active' }, orderBy: { promo_name: 'asc' } }),
      prisma.advertisers.findMany({ where: { status: 'active' }, orderBy: { name: 'asc' } }),
      prisma.ad_sources.findMany({ where: { status: 'active' }, orderBy: { name: 'asc' } }),
      prisma.payment_accounts.findMany({ orderBy: { id: 'asc' } }),
      prisma.$queryRawUnsafe<any[]>(
        hasNoShippingCost
          ? 'SELECT id, method_name, description, is_active, no_shipping_cost FROM no_payment_methods WHERE is_active = 1 ORDER BY method_name ASC'
          : 'SELECT id, method_name, description, is_active, 0 AS no_shipping_cost FROM no_payment_methods WHERE is_active = 1 ORDER BY method_name ASC'
      ),
      prisma.warehouse_stock.findMany(),
      prisma.warehouse_gift_stock.findMany(),
    ]);
    const order = orders[0];
    if (!order) return NextResponse.json({ status: 'error', message: 'Pesanan tidak ditemukan' }, { status: 404 });
    if (!order.warehouse_id && shipments[0]?.warehouse_id) order.warehouse_id = shipments[0].warehouse_id;
    if (!order.courier_id && shipments[0]?.courier_name) order.courier_name = shipments[0].courier_name;

    const normalizedNoPaymentMethods = noPaymentMethods.map((item: any) => ({
      ...item,
      is_active: Boolean(item.is_active),
      no_shipping_cost: Boolean(item.no_shipping_cost),
    }));

    return NextResponse.json(safeJson({ status: 'success', data: { source, order, items, payment: payments[0] || null, shipment: shipments[0] || null, products, gifts, bundles, warehouses, couriers, promos, advertisers, adSources, paymentAccounts, noPaymentMethods: normalizedNoPaymentMethods, productStocks, giftStocks } }));
  } catch (error: any) {
    console.error('GET olahan edit:', error);
    return NextResponse.json({ status: 'error', message: error.message || 'Gagal memuat pesanan' }, { status: 500 });
  }
}

async function saveProof(file: File | null) {
  if (!file || !file.size) return null;
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type)) throw new Error('Bukti pembayaran harus berupa JPG, PNG, atau WEBP');
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const dir = join(process.cwd(), 'public', 'uploads', 'payments');
  await mkdir(dir, { recursive: true });
  const name = `proof_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
  await writeFile(join(dir, name), Buffer.from(await file.arrayBuffer()));
  return `/uploads/payments/${name}`;
}

export async function PUT(request: Request) {
  try {
    const form = await request.formData();
    const payload = JSON.parse(String(form.get('payload') || '{}'));
    const source = sourceOf(payload.source);
    const identifier = String(payload.id || '').trim();
    if (!source || !identifier) return NextResponse.json({ status: 'error', message: 'ID atau sumber pesanan tidak valid' }, { status: 400 });
    const resolved = await resolveOrder(identifier, source);
    if (!resolved) return NextResponse.json({ status: 'error', message: 'Pesanan tidak ditemukan' }, { status: 404 });
    const proofUrl = await saveProof(form.get('payment_proof') as File | null);
    const updatedAt = new Date();
    const t = tableMap[source];
    const orderId = Number(resolved.id);
    const items = (payload.items || []) as ItemInput[];
    if (!items.length) return NextResponse.json({ status: 'error', message: 'Pesanan harus memiliki minimal satu produk atau hadiah' }, { status: 400 });

    await prisma.$transaction(async (tx) => {
      const oldOrders = await tx.$queryRawUnsafe<any[]>(`SELECT warehouse_id,customer_id FROM ${t.orders} WHERE id=? FOR UPDATE`, orderId);
      const old = oldOrders[0];
      if (!old) throw new Error('Pesanan tidak ditemukan');
      const oldItems = await tx.$queryRawUnsafe<any[]>(`SELECT product_id,qty,is_gift,is_bundle FROM ${t.items} WHERE order_id=?`, orderId);
      if (old.warehouse_id) {
        for (const item of oldItems) {
          if (Number(item.is_bundle)) {
            const parts = await tx.$queryRawUnsafe<any[]>(`SELECT product_id,qty FROM product_bundle_items WHERE bundle_id=?`, item.product_id);
            for (const part of parts) await tx.$executeRawUnsafe(`UPDATE warehouse_stock SET stock=stock+? WHERE product_id=? AND warehouse_id=?`, Number(part.qty) * Number(item.qty), part.product_id, old.warehouse_id);
          } else if (Number(item.is_gift)) {
            await tx.$executeRawUnsafe(`UPDATE warehouse_gift_stock SET stock=stock+? WHERE gift_id=? AND warehouse_id=?`, Number(item.qty), item.product_id, old.warehouse_id);
          } else {
            await tx.$executeRawUnsafe(`UPDATE warehouse_stock SET stock=stock+? WHERE product_id=? AND warehouse_id=?`, Number(item.qty), item.product_id, old.warehouse_id);
          }
        }
      }

      const region = String(payload.subdistrict || '');
      const regionParts = region.split(',').map((x: string) => x.trim());
      await tx.$executeRawUnsafe(`UPDATE customers SET name=?,whatsapp_number=?,email=?,address=?,province=?,city=?,subdistrict=?,desa=?,age=?,complaint=?,updated_at=? WHERE id=?`, payload.customer_name, payload.whatsapp_number, payload.email || null, payload.address, regionParts[2] || '', regionParts[1] || '', region, payload.desa || null, payload.age === '' ? null : Number(payload.age), payload.complaint || null, updatedAt, old.customer_id);

      let courierId: number | null = payload.courier_id ? Number(payload.courier_id) : null;
      let courier: any = null;
      if (courierId) courier = (await tx.$queryRawUnsafe<any[]>(`SELECT * FROM couriers WHERE id=?`, courierId))[0];
      const warehouseId = payload.warehouse_id ? Number(payload.warehouse_id) : null;
      const roCount = Number(payload.ro_count || 0);
      const nextOrderStatus = 'pending';
      if (source === 'CSO') {
        await tx.$executeRawUnsafe(`UPDATE ${t.orders} SET order_status=?,total_product_price=?,product_discount=?,shipping_cost=?,additional_shipping_cost=?,shipping_discount=?,other_fee=?,total_payment=?,notes=?,warehouse_id=?,courier_id=?,promo_id=?,advertiser_name=?,ad_source=?,updated_at=? WHERE id=?`, nextOrderStatus, Number(payload.total_product_price), Number(payload.product_discount), Number(payload.shipping_cost), Number(payload.manual_fee_cod), Number(payload.shipping_discount || 0), Number(payload.other_fee), Number(payload.total_payment), payload.notes || null, warehouseId, courierId, payload.promo_id || null, payload.advertiser_name || null, payload.ad_source || null, updatedAt, orderId);
      } else {
        await tx.$executeRawUnsafe(`UPDATE ${t.orders} SET order_status=?,total_product_price=?,product_discount=?,shipping_cost=?,additional_shipping_cost=?,shipping_discount=?,other_fee=?,total_payment=?,notes=?,warehouse_id=?,courier_id=?,is_ro=?,ro_count=?,promo_id=?,updated_at=? WHERE id=?`, nextOrderStatus, Number(payload.total_product_price), Number(payload.product_discount), Number(payload.shipping_cost), Number(payload.manual_fee_cod), Number(payload.shipping_discount || 0), Number(payload.other_fee), Number(payload.total_payment), payload.notes || null, warehouseId, courierId, roCount > 0 ? 1 : 0, roCount, payload.promo_id || null, updatedAt, orderId);
      }

      if (courier) {
        const ship = await tx.$queryRawUnsafe<any[]>(`SELECT id FROM ${t.shipments} WHERE order_id=?`, orderId);
        if (ship.length) await tx.$executeRawUnsafe(`UPDATE ${t.shipments} SET courier_name=?,courier_service=?,warehouse_id=?,shipping_cost=? WHERE order_id=?`, courier.courier_name, courier.service_type || 'Reguler', warehouseId, Number(payload.shipping_cost), orderId);
        else await tx.$executeRawUnsafe(`INSERT INTO ${t.shipments}(order_id,warehouse_id,courier_name,courier_service,shipping_cost) VALUES(?,?,?,?,?)`, orderId, warehouseId, courier.courier_name, courier.service_type || 'Reguler', Number(payload.shipping_cost));
      }

      let bankName = null, accountName = null, accountNumber = null;
      if (payload.payment_method === 'bank_transfer' && payload.payment_account_id) {
        const account = (await tx.$queryRawUnsafe<any[]>(`SELECT * FROM payment_accounts WHERE id=?`, Number(payload.payment_account_id)))[0];
        if (account) { bankName = account.bank_name; accountName = account.account_name; accountNumber = account.account_number; }
      } else if (payload.payment_method === 'free' && payload.no_payment_method_id) {
        const method = (await tx.$queryRawUnsafe<any[]>(`SELECT * FROM no_payment_methods WHERE id=?`, Number(payload.no_payment_method_id)))[0];
        if (method) { bankName = method.method_name; accountName = 'No Payment'; accountNumber = '-'; }
      }
      const pay = await tx.$queryRawUnsafe<any[]>(`SELECT id FROM ${t.payments} WHERE order_id=?`, orderId);
      if (pay.length) {
        if (proofUrl) await tx.$executeRawUnsafe(`UPDATE ${t.payments} SET payment_status=?,payment_method=?,payment_proof_url=?,bank_name=?,account_name=?,account_number=?,fat_proof_url=? WHERE order_id=?`, payload.payment_status, payload.payment_method, proofUrl, bankName, accountName, accountNumber, payload.id_reff || null, orderId);
        else await tx.$executeRawUnsafe(`UPDATE ${t.payments} SET payment_status=?,payment_method=?,bank_name=?,account_name=?,account_number=?,fat_proof_url=? WHERE order_id=?`, payload.payment_status, payload.payment_method, bankName, accountName, accountNumber, payload.id_reff || null, orderId);
      } else await tx.$executeRawUnsafe(`INSERT INTO ${t.payments}(order_id,payment_method,payment_status,payment_proof_url,bank_name,account_name,account_number,fat_proof_url) VALUES(?,?,?,?,?,?,?,?)`, orderId, payload.payment_method, payload.payment_status, proofUrl, bankName, accountName, accountNumber, payload.id_reff || null);

      await tx.$executeRawUnsafe(`DELETE FROM ${t.items} WHERE order_id=?`, orderId);
      for (const raw of items) {
        const item = { ...raw, product_id: Number(raw.product_id), qty: Number(raw.qty), price: Number(raw.price), discount: Number(raw.discount || 0) };
        if (item.qty < 1) throw new Error('Jumlah item minimal 1');
        const nameTable = item.is_gift ? ['gifts', 'gift_name'] : item.is_bundle ? ['product_bundles', 'bundle_name'] : ['products', 'product_name'];
        const found = (await tx.$queryRawUnsafe<any[]>(`SELECT ${nameTable[1]} name FROM ${nameTable[0]} WHERE id=?`, item.product_id))[0];
        if (!found) throw new Error('Produk atau hadiah tidak ditemukan');
        await tx.$executeRawUnsafe(`INSERT INTO ${t.items}(order_id,product_id,product_name,qty,price,discount,subtotal,is_gift,is_bundle) VALUES(?,?,?,?,?,?,?,?,?)`, orderId, item.product_id, found.name, item.qty, item.price, item.discount, (item.price - item.discount) * item.qty, item.is_gift ? 1 : 0, item.is_bundle ? 1 : 0);
        if (warehouseId) {
          if (item.is_bundle) {
            const parts = await tx.$queryRawUnsafe<any[]>(`SELECT product_id,qty FROM product_bundle_items WHERE bundle_id=?`, item.product_id);
            for (const part of parts) {
              const need = Number(part.qty) * item.qty;
              const stock = (await tx.$queryRawUnsafe<any[]>(`SELECT stock FROM warehouse_stock WHERE product_id=? AND warehouse_id=? FOR UPDATE`, part.product_id, warehouseId))[0]?.stock ?? 0;
              if (Number(stock) < need) throw new Error(`Stok komponen bundling ${found.name} tidak mencukupi`);
              await tx.$executeRawUnsafe(`UPDATE warehouse_stock SET stock=stock-? WHERE product_id=? AND warehouse_id=?`, need, part.product_id, warehouseId);
            }
          } else {
            const stockTable = item.is_gift ? 'warehouse_gift_stock' : 'warehouse_stock';
            const idColumn = item.is_gift ? 'gift_id' : 'product_id';
            const stock = (await tx.$queryRawUnsafe<any[]>(`SELECT stock FROM ${stockTable} WHERE ${idColumn}=? AND warehouse_id=? FOR UPDATE`, item.product_id, warehouseId))[0]?.stock ?? 0;
            if (Number(stock) < item.qty) throw new Error(`Stok ${item.is_gift ? 'hadiah' : 'produk'} ${found.name} tidak mencukupi (tersedia ${stock})`);
            await tx.$executeRawUnsafe(`UPDATE ${stockTable} SET stock=stock-? WHERE ${idColumn}=? AND warehouse_id=?`, item.qty, item.product_id, warehouseId);
          }
        }
      }
    }, { timeout: 30000 });

    return NextResponse.json({ status: 'success', message: 'Semua perubahan pesanan berhasil disimpan' });
  } catch (error: any) {
    console.error('PUT olahan edit:', error);
    return NextResponse.json({ status: 'error', message: error.message || 'Gagal menyimpan perubahan' }, { status: 500 });
  }
}







