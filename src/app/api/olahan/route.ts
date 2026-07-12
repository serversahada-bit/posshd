import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

const jsonSafe = <T>(value: T): T => JSON.parse(JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item)) as T;

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start_date') || '';
    const endDate = searchParams.get('end_date') || '';
    const status = searchParams.get('status') || '';

    // Parameters for raw query
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

    const rawQuery = `
      SELECT * FROM (
        SELECT 
            o.id as order_id,
            o.order_code,
            o.order_status,
            o.created_at,
            o.advertiser_name,
            o.ad_source,
            o.notes,
            c.name as customer_name,
            c.whatsapp_number,
            c.desa,
            oi.product_names,
            s.courier_name,
            s.courier_service,
            s.tracking_number as resi,
            p.fat_proof_url as id_reff,
            'CSO' as source_table,
            CASE 
                WHEN o.notes LIKE '[RESEND]%' THEN 'RESEND'
                ELSE 'CSO AKUISISI'
            END as source_label
        FROM orders o
        LEFT JOIN customers c ON o.customer_id = c.id
        LEFT JOIN (
          SELECT order_id, GROUP_CONCAT(product_name SEPARATOR ', ') as product_names
          FROM order_items
          GROUP BY order_id
        ) oi ON o.id = oi.order_id
        LEFT JOIN payments p ON o.id = p.order_id
        LEFT JOIN shipments s ON o.id = s.order_id
        WHERE (p.payment_method IS NULL OR p.payment_method != 'bank_transfer' OR p.payment_status = 'paid')
        
        UNION ALL

        SELECT 
            o.id as order_id,
            o.order_code,
            o.order_status,
            o.created_at,
            NULL as advertiser_name,
            NULL as ad_source,
            o.notes,
            c.name as customer_name,
            c.whatsapp_number,
            c.desa,
            oi.product_names,
            s.courier_name,
            s.courier_service,
            s.tracking_number as resi,
            p.fat_proof_url as id_reff,
            'CSO_AUTO' as source_table,
            'CSO' as source_label
        FROM orders_cso o
        LEFT JOIN customers c ON o.customer_id = c.id
        LEFT JOIN (
          SELECT order_id, GROUP_CONCAT(product_name SEPARATOR ', ') as product_names
          FROM order_items_cso
          GROUP BY order_id
        ) oi ON o.id = oi.order_id
        LEFT JOIN payments_cso p ON o.id = p.order_id
        LEFT JOIN shipments_cso s ON o.id = s.order_id
        WHERE (p.payment_method IS NULL OR p.payment_method != 'bank_transfer' OR p.payment_status = 'paid')
        
        UNION ALL
        
        SELECT 
            o.id as order_id,
            o.order_code,
            o.order_status,
            o.created_at,
            NULL as advertiser_name,
            NULL as ad_source,
            o.notes,
            c.name as customer_name,
            c.whatsapp_number,
            c.desa,
            oi.product_names,
            s.courier_name,
            s.courier_service,
            s.tracking_number as resi,
            p.fat_proof_url as id_reff,
            'CRM' as source_table,
            'CRM' as source_label
        FROM orders_crm o
        LEFT JOIN customers c ON o.customer_id = c.id
        LEFT JOIN (
          SELECT order_id, GROUP_CONCAT(product_name SEPARATOR ', ') as product_names
          FROM order_items_crm
          GROUP BY order_id
        ) oi ON o.id = oi.order_id
        LEFT JOIN payments_crm p ON o.id = p.order_id
        LEFT JOIN shipments_crm s ON o.id = s.order_id
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
