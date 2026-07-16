import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

const jsonSafe = <T>(value: T): T => JSON.parse(JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item)) as T;

export const dynamic = 'force-dynamic';

async function hasColumn(tableName: string, columnName: string) {
  const rows = await prisma.$queryRaw<Array<{ total: bigint | number }>>`
    SELECT COUNT(*) AS total
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ${tableName}
      AND COLUMN_NAME = ${columnName}
  `;

  return Number(rows[0]?.total || 0) > 0;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start_date') || '';
    const endDate = searchParams.get('end_date') || '';
    const status = searchParams.get('status') || '';
    const creatorName = searchParams.get('creator_name') || '';
    const warehouseId = searchParams.get('warehouse_id') || '';

    const [ordersCsoHasAdvertiser, ordersCsoHasAdSource, ordersCrmHasAdvertiser, ordersCrmHasAdSource] = await Promise.all([
      hasColumn('orders_cso', 'advertiser_name'),
      hasColumn('orders_cso', 'ad_source'),
      hasColumn('orders_crm', 'advertiser_name'),
      hasColumn('orders_crm', 'ad_source'),
    ]);

    const ordersCsoAdvertiserSelect = ordersCsoHasAdvertiser ? 'o.advertiser_name' : 'NULL';
    const ordersCsoAdSourceSelect = ordersCsoHasAdSource ? 'o.ad_source' : 'NULL';
    const ordersCrmAdvertiserSelect = ordersCrmHasAdvertiser ? 'o.advertiser_name' : 'NULL';
    const ordersCrmAdSourceSelect = ordersCrmHasAdSource ? 'o.ad_source' : 'NULL';

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

    const rawQuery = `
      SELECT * FROM (
        SELECT 
            o.id as order_id,
            o.order_code,
            o.order_status,
            COALESCE(o.updated_at, o.created_at) as created_at,
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
            COALESCE(o.updated_at, o.created_at) as created_at,
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
            COALESCE(o.updated_at, o.created_at) as created_at,
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
      ORDER BY created_at DESC
    `;

    const orders = await prisma.$queryRawUnsafe(rawQuery, ...params);

    return NextResponse.json(jsonSafe({ status: 'success', data: orders }));
  } catch (error: unknown) {
    console.error('Error fetching olahan data:', error);
    return NextResponse.json({ status: 'error', message: error instanceof Error ? error.message : 'Gagal mengambil data olahan' }, { status: 500 });
  }
}
