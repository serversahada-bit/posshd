import { NextResponse } from 'next/server';

import prisma from '@/lib/db';
import { hasColumn } from '@/lib/orderTimestamps';

const jsonSafe = <T>(value: T): T => JSON.parse(JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item)) as T;

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start_date') || '';
    const endDate = searchParams.get('end_date') || '';
    const statusList = searchParams.getAll('status').filter(Boolean);
    const creatorNameList = searchParams.getAll('creator_name').filter(Boolean);
    const warehouseIdList = searchParams.getAll('warehouse_id').filter(Boolean);
    const paymentMethodList = searchParams.getAll('payment_method').filter(Boolean);
    const search = searchParams.get('search') || '';
    const sort = searchParams.get('sort') || 'created_at';
    const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 20, 1), 100);
    const offset = Math.max(Number(searchParams.get('offset')) || 0, 0);

    const sortColumnMap: Record<string, string> = {
      created_at: 'created_at',
      processing_at: 'processing_at',
      last_update: 'last_update',
    };
    const orderByColumn = sortColumnMap[sort] ?? 'created_at';

    const [
      ordersHasPendingAt,
      ordersHasProcessingAt,
      ordersHasLastUpdate,
      ordersCsoHasAdvertiser,
      ordersCsoHasAdSource,
      ordersCsoHasPendingAt,
      ordersCsoHasProcessingAt,
      ordersCsoHasLastUpdate,
      ordersCrmHasAdvertiser,
      ordersCrmHasAdSource,
      ordersCrmHasPendingAt,
      ordersCrmHasProcessingAt,
      ordersCrmHasLastUpdate,
    ] = await Promise.all([
      hasColumn(prisma, 'orders', 'pending_at'),
      hasColumn(prisma, 'orders', 'processing_at'),
      hasColumn(prisma, 'orders', 'last_update'),
      hasColumn(prisma, 'orders_cso', 'advertiser_name'),
      hasColumn(prisma, 'orders_cso', 'ad_source'),
      hasColumn(prisma, 'orders_cso', 'pending_at'),
      hasColumn(prisma, 'orders_cso', 'processing_at'),
      hasColumn(prisma, 'orders_cso', 'last_update'),
      hasColumn(prisma, 'orders_crm', 'advertiser_name'),
      hasColumn(prisma, 'orders_crm', 'ad_source'),
      hasColumn(prisma, 'orders_crm', 'pending_at'),
      hasColumn(prisma, 'orders_crm', 'processing_at'),
      hasColumn(prisma, 'orders_crm', 'last_update'),
    ]);

    const pendingFallback = `CASE
                WHEN o.order_status = 'pending'
                THEN COALESCE(o.updated_at, o.created_at)
                ELSE o.created_at
            END`;

    const processingFallback = `CASE
                WHEN o.order_status IN ('processing', 'ready_to_ship', 'shipped', 'completed', 'rts', 'problem')
                THEN COALESCE(o.updated_at, o.created_at)
                ELSE NULL
            END`;

    const ordersPendingAtSelect = ordersHasPendingAt ? 'COALESCE(o.pending_at, o.created_at)' : pendingFallback;
    const ordersProcessingAtSelect = ordersHasProcessingAt ? 'o.processing_at' : processingFallback;
    const ordersLastUpdateSelect = ordersHasLastUpdate ? 'COALESCE(o.last_update, o.updated_at, o.created_at)' : 'COALESCE(o.updated_at, o.created_at)';
    const ordersCsoAdvertiserSelect = ordersCsoHasAdvertiser ? 'o.advertiser_name' : 'NULL';
    const ordersCsoPendingAtSelect = ordersCsoHasPendingAt ? 'COALESCE(o.pending_at, o.created_at)' : pendingFallback;
    const ordersCsoAdSourceSelect = ordersCsoHasAdSource ? 'o.ad_source' : 'NULL';
    const ordersCsoProcessingAtSelect = ordersCsoHasProcessingAt ? 'o.processing_at' : processingFallback;
    const ordersCsoLastUpdateSelect = ordersCsoHasLastUpdate ? 'COALESCE(o.last_update, o.updated_at, o.created_at)' : 'COALESCE(o.updated_at, o.created_at)';
    const ordersCrmAdvertiserSelect = ordersCrmHasAdvertiser ? 'o.advertiser_name' : 'NULL';
    const ordersCrmPendingAtSelect = ordersCrmHasPendingAt ? 'COALESCE(o.pending_at, o.created_at)' : pendingFallback;
    const ordersCrmAdSourceSelect = ordersCrmHasAdSource ? 'o.ad_source' : 'NULL';
    const ordersCrmProcessingAtSelect = ordersCrmHasProcessingAt ? 'o.processing_at' : processingFallback;
    const ordersCrmLastUpdateSelect = ordersCrmHasLastUpdate ? 'COALESCE(o.last_update, o.updated_at, o.created_at)' : 'COALESCE(o.updated_at, o.created_at)';

    const params: (string | number)[] = [];
    let conditionQuery = '';

    if (search) {
      conditionQuery += ` AND (order_code LIKE ? OR customer_name LIKE ? OR whatsapp_number LIKE ?)`;
      const wildcard = `%${search}%`;
      params.push(wildcard, wildcard, wildcard);
    }

    // Filter tanggal mengikuti kolom yang sedang jadi "Tampilan" (created_at/processing_at/last_update),
    // bukan selalu created_at, supaya pencarian tanggal cocok dengan data yang sedang dilihat.
    if (startDate) {
      conditionQuery += ` AND DATE(${orderByColumn}) >= ?`;
      params.push(startDate);
    }
    if (endDate) {
      conditionQuery += ` AND DATE(${orderByColumn}) <= ?`;
      params.push(endDate);
    }
    if (statusList.length > 0) {
      conditionQuery += ` AND order_status IN (${statusList.map(() => '?').join(',')})`;
      params.push(...statusList);
    }

    if (creatorNameList.length > 0) {
      conditionQuery += ` AND creator_name IN (${creatorNameList.map(() => '?').join(',')})`;
      params.push(...creatorNameList);
    }
    if (warehouseIdList.length > 0) {
      conditionQuery += ` AND warehouse_id IN (${warehouseIdList.map(() => '?').join(',')})`;
      params.push(...warehouseIdList);
    }
    if (paymentMethodList.length > 0) {
      conditionQuery += ` AND payment_method IN (${paymentMethodList.map(() => '?').join(',')})`;
      params.push(...paymentMethodList);
    }
    if (sort === 'processing_at') {
      conditionQuery += ` AND processing_at IS NOT NULL`;
    }

    const combinedOrdersSql = `
        SELECT
            o.id as order_id,
            o.order_code,
            o.order_status,
            ${ordersPendingAtSelect} as created_at,
            ${ordersProcessingAtSelect} as processing_at,
            ${ordersLastUpdateSelect} as last_update,
            o.advertiser_name,
            o.ad_source,
            o.notes,
            o.warehouse_id,
            w.warehouse_name,
            COALESCE(ca.receiver_name, c.name) as customer_name,
            COALESCE(ca.whatsapp_number, c.whatsapp_number) as whatsapp_number,
            c.desa,
            oi.product_names,
            s.courier_name,
            s.courier_service,
            s.tracking_number as resi,
            p.fat_proof_url as id_reff,
            p.payment_method,
            p.payment_status,
            p.reject_reason,
            CASE
                WHEN cu.role = 'admin' THEN NULL
                ELSE COALESCE(NULLIF(cu.name, ''), NULLIF(cu.email, ''))
            END as creator_name,
            'CSO' as source_table,
            CASE
                WHEN o.notes LIKE '[RESEND]%' AND (o.advertiser_name IS NULL OR o.advertiser_name = '') THEN 'RESEND CRM'
                WHEN o.notes LIKE '[RESEND]%' THEN 'RESEND'
                ELSE 'CSO AKUISISI'
            END as source_label
        FROM orders o
        LEFT JOIN warehouses w ON w.id = o.warehouse_id
        LEFT JOIN customers c ON o.customer_id = c.id
        LEFT JOIN customer_addresses ca ON ca.id = o.customer_address_id
        LEFT JOIN (
          SELECT order_id, GROUP_CONCAT(product_name SEPARATOR ', ') as product_names
          FROM (
            SELECT order_id, product_name FROM order_items
            UNION ALL
            SELECT order_id, product_name FROM order_items_resend
          ) combined_order_items
          GROUP BY order_id
        ) oi ON o.id = oi.order_id
        LEFT JOIN payments p ON o.id = p.order_id
        LEFT JOIN shipments s ON o.id = s.order_id
        LEFT JOIN users cu ON cu.id = o.created_by_user_id
        WHERE (p.payment_method IS NULL OR p.payment_method NOT IN ('bank_transfer', 'free') OR p.payment_status IN ('paid', 'rejected'))

        UNION ALL

        SELECT
            o.id as order_id,
            o.order_code,
            o.order_status,
            ${ordersCsoPendingAtSelect} as created_at,
            ${ordersCsoProcessingAtSelect} as processing_at,
            ${ordersCsoLastUpdateSelect} as last_update,
            ${ordersCsoAdvertiserSelect} as advertiser_name,
            ${ordersCsoAdSourceSelect} as ad_source,
            o.notes,
            o.warehouse_id,
            w.warehouse_name,
            COALESCE(ca.receiver_name, c.name) as customer_name,
            COALESCE(ca.whatsapp_number, c.whatsapp_number) as whatsapp_number,
            c.desa,
            oi.product_names,
            s.courier_name,
            s.courier_service,
            s.tracking_number as resi,
            p.fat_proof_url as id_reff,
            p.payment_method,
            p.payment_status,
            p.reject_reason,
            CASE
                WHEN cu.role = 'admin' THEN NULL
                ELSE COALESCE(NULLIF(cu.name, ''), NULLIF(cu.email, ''))
            END as creator_name,
            'CSO_AUTO' as source_table,
            'CSO' as source_label
        FROM orders_cso o
        LEFT JOIN warehouses w ON w.id = o.warehouse_id
        LEFT JOIN customers c ON o.customer_id = c.id
        LEFT JOIN customer_addresses ca ON ca.id = o.customer_address_id
        LEFT JOIN (
          SELECT order_id, GROUP_CONCAT(product_name SEPARATOR ', ') as product_names
          FROM order_items_cso
          GROUP BY order_id
        ) oi ON o.id = oi.order_id
        LEFT JOIN payments_cso p ON o.id = p.order_id
        LEFT JOIN shipments_cso s ON o.id = s.order_id
        LEFT JOIN users cu ON cu.id = o.created_by_user_id
        WHERE (p.payment_method IS NULL OR p.payment_method NOT IN ('bank_transfer', 'free') OR p.payment_status IN ('paid', 'rejected'))

        UNION ALL

        SELECT
            o.id as order_id,
            o.order_code,
            o.order_status,
            ${ordersCrmPendingAtSelect} as created_at,
            ${ordersCrmProcessingAtSelect} as processing_at,
            ${ordersCrmLastUpdateSelect} as last_update,
            ${ordersCrmAdvertiserSelect} as advertiser_name,
            ${ordersCrmAdSourceSelect} as ad_source,
            o.notes,
            o.warehouse_id,
            w.warehouse_name,
            COALESCE(ca.receiver_name, c.name) as customer_name,
            COALESCE(ca.whatsapp_number, c.whatsapp_number) as whatsapp_number,
            c.desa,
            oi.product_names,
            s.courier_name,
            s.courier_service,
            s.tracking_number as resi,
            p.fat_proof_url as id_reff,
            p.payment_method,
            p.payment_status,
            p.reject_reason,
            CASE
                WHEN cu.role = 'admin' THEN NULL
                ELSE COALESCE(NULLIF(cu.name, ''), NULLIF(cu.email, ''))
            END as creator_name,
            'CRM' as source_table,
            'CRM' as source_label
        FROM orders_crm o
        LEFT JOIN warehouses w ON w.id = o.warehouse_id
        LEFT JOIN customers c ON o.customer_id = c.id
        LEFT JOIN customer_addresses ca ON ca.id = o.customer_address_id
        LEFT JOIN (
          SELECT order_id, GROUP_CONCAT(product_name SEPARATOR ', ') as product_names
          FROM order_items_crm
          GROUP BY order_id
        ) oi ON o.id = oi.order_id
        LEFT JOIN payments_crm p ON o.id = p.order_id
        LEFT JOIN shipments_crm s ON o.id = s.order_id
        LEFT JOIN users cu ON cu.id = o.created_by_user_id
        WHERE (p.payment_method IS NULL OR p.payment_method NOT IN ('bank_transfer', 'free') OR p.payment_status IN ('paid', 'rejected'))
    `;

    const rawQuery = `
      SELECT * FROM (${combinedOrdersSql}) as combined_orders
      WHERE 1=1 ${conditionQuery}
      ORDER BY ${orderByColumn} DESC, created_at DESC
      LIMIT ? OFFSET ?
    `;

    const orders = await prisma.$queryRawUnsafe<unknown[]>(rawQuery, ...params, limit + 1, offset);
    const hasMore = orders.length > limit;
    const pageOrders = hasMore ? orders.slice(0, limit) : orders;

    let total: number | undefined;
    if (offset === 0) {
      const countQuery = `SELECT COUNT(*) as total FROM (${combinedOrdersSql}) as combined_orders WHERE 1=1 ${conditionQuery}`;
      const countResult = await prisma.$queryRawUnsafe<Array<{ total: bigint | number }>>(countQuery, ...params);
      total = Number(countResult[0]?.total ?? 0);
    }

    return NextResponse.json(jsonSafe({ status: 'success', data: pageOrders, hasMore, total }));
  } catch (error: unknown) {
    console.error('Error fetching olahan data:', error);
    return NextResponse.json({ status: 'error', message: error instanceof Error ? error.message : 'Gagal mengambil data olahan' }, { status: 500 });
  }
}
