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
    const status = searchParams.get('status') || '';
    const creatorName = searchParams.get('creator_name') || '';
    const warehouseId = searchParams.get('warehouse_id') || '';
    const sort = searchParams.get('sort') || 'created_at';
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

    const params: string[] = [];
    let conditionQuery = '';

    if (startDate) {
      conditionQuery += ` AND DATE(created_at) >= ?`;
      params.push(startDate);
    }
    if (endDate) {
      conditionQuery += ` AND DATE(created_at) <= ?`;
      params.push(endDate);
    }
    if (status) {
      conditionQuery += ` AND order_status = ?`;
      params.push(status);
    }
    if (creatorName) {
      conditionQuery += ` AND creator_name = ?`;
      params.push(creatorName);
    }
    if (warehouseId) {
      conditionQuery += ` AND warehouse_id = ?`;
      params.push(warehouseId);
    }
    if (sort === 'processing_at') {
      conditionQuery += ` AND processing_at IS NOT NULL`;
    }

    const rawQuery = `
      SELECT * FROM (
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
            c.name as customer_name,
            c.whatsapp_number,
            c.desa,
            oi.product_names,
            s.courier_name,
            s.courier_service,
            s.tracking_number as resi,
            p.fat_proof_url as id_reff,
            CASE
                WHEN cu.role = 'admin' THEN NULL
                ELSE COALESCE(NULLIF(cu.name, ''), NULLIF(cu.email, ''))
            END as creator_name,
            'CSO' as source_table,
            CASE 
                WHEN o.notes LIKE '[RESEND]%' THEN 'RESEND'
                ELSE 'CSO AKUISISI'
            END as source_label
        FROM orders o
        LEFT JOIN warehouses w ON w.id = o.warehouse_id
        LEFT JOIN customers c ON o.customer_id = c.id
        LEFT JOIN (
          SELECT order_id, GROUP_CONCAT(product_name SEPARATOR ', ') as product_names
          FROM order_items
          GROUP BY order_id
        ) oi ON o.id = oi.order_id
        LEFT JOIN payments p ON o.id = p.order_id
        LEFT JOIN shipments s ON o.id = s.order_id
        LEFT JOIN users cu ON cu.id = o.created_by_user_id
        WHERE (p.payment_method IS NULL OR p.payment_method != 'bank_transfer' OR p.payment_status = 'paid')
        
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
            c.name as customer_name,
            c.whatsapp_number,
            c.desa,
            oi.product_names,
            s.courier_name,
            s.courier_service,
            s.tracking_number as resi,
            p.fat_proof_url as id_reff,
            CASE
                WHEN cu.role = 'admin' THEN NULL
                ELSE COALESCE(NULLIF(cu.name, ''), NULLIF(cu.email, ''))
            END as creator_name,
            'CSO_AUTO' as source_table,
            'CSO' as source_label
        FROM orders_cso o
        LEFT JOIN warehouses w ON w.id = o.warehouse_id
        LEFT JOIN customers c ON o.customer_id = c.id
        LEFT JOIN (
          SELECT order_id, GROUP_CONCAT(product_name SEPARATOR ', ') as product_names
          FROM order_items_cso
          GROUP BY order_id
        ) oi ON o.id = oi.order_id
        LEFT JOIN payments_cso p ON o.id = p.order_id
        LEFT JOIN shipments_cso s ON o.id = s.order_id
        LEFT JOIN users cu ON cu.id = o.created_by_user_id
        WHERE (p.payment_method IS NULL OR p.payment_method != 'bank_transfer' OR p.payment_status = 'paid')
        
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
            c.name as customer_name,
            c.whatsapp_number,
            c.desa,
            oi.product_names,
            s.courier_name,
            s.courier_service,
            s.tracking_number as resi,
            p.fat_proof_url as id_reff,
            CASE
                WHEN cu.role = 'admin' THEN NULL
                ELSE COALESCE(NULLIF(cu.name, ''), NULLIF(cu.email, ''))
            END as creator_name,
            'CRM' as source_table,
            'CRM' as source_label
        FROM orders_crm o
        LEFT JOIN warehouses w ON w.id = o.warehouse_id
        LEFT JOIN customers c ON o.customer_id = c.id
        LEFT JOIN (
          SELECT order_id, GROUP_CONCAT(product_name SEPARATOR ', ') as product_names
          FROM order_items_crm
          GROUP BY order_id
        ) oi ON o.id = oi.order_id
        LEFT JOIN payments_crm p ON o.id = p.order_id
        LEFT JOIN shipments_crm s ON o.id = s.order_id
        LEFT JOIN users cu ON cu.id = o.created_by_user_id
        WHERE (p.payment_method IS NULL OR p.payment_method != 'bank_transfer' OR p.payment_status = 'paid')
      ) as combined_orders
      WHERE 1=1 ${conditionQuery}
      ORDER BY ${orderByColumn} DESC, created_at DESC
    `;

    const orders = await prisma.$queryRawUnsafe(rawQuery, ...params);

    return NextResponse.json(jsonSafe({ status: 'success', data: orders }));
  } catch (error: unknown) {
    console.error('Error fetching olahan data:', error);
    return NextResponse.json({ status: 'error', message: error instanceof Error ? error.message : 'Gagal mengambil data olahan' }, { status: 500 });
  }
}


