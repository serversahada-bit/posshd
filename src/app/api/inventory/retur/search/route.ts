import { NextResponse } from 'next/server';

import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Terjadi kesalahan');

const jsonSafe = <T>(value: T): T => JSON.parse(JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item)) as T;

type Source = 'CSO' | 'CSO_AUTO' | 'CRM';

const SOURCE_CONFIG: Record<Source, { orders: string; shipments: string; label: string }> = {
  CSO: { orders: 'orders', shipments: 'shipments', label: 'CSO' },
  CSO_AUTO: { orders: 'orders_cso', shipments: 'shipments_cso', label: 'CSO Otomatis' },
  CRM: { orders: 'orders_crm', shipments: 'shipments_crm', label: 'CRM' },
};

function buildSearchSql(source: Source) {
  const { orders, shipments, label } = SOURCE_CONFIG[source];
  return `
    SELECT
      '${source}' as source,
      '${label}' as source_label,
      o.id as order_id,
      o.order_code,
      o.order_status,
      o.warehouse_id,
      w.warehouse_name,
      COALESCE(ca.receiver_name, c.name) as customer_name,
      s.tracking_number as resi,
      o.created_at
    FROM ${orders} o
    LEFT JOIN warehouses w ON w.id = o.warehouse_id
    LEFT JOIN customers c ON o.customer_id = c.id
    LEFT JOIN customer_addresses ca ON ca.id = o.customer_address_id
    LEFT JOIN ${shipments} s ON s.order_id = o.id
    WHERE o.order_status = 'shipped'
    ${'{{SEARCH}}'}
    ORDER BY o.created_at DESC
    LIMIT 20
  `;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').trim();

    const params: string[] = [];
    let searchClause = '';
    if (q) {
      searchClause = 'AND (o.order_code LIKE ? OR s.tracking_number LIKE ?)';
      const wildcard = `%${q}%`;
      params.push(wildcard, wildcard);
    }

    const sources: Source[] = ['CSO', 'CSO_AUTO', 'CRM'];
    const results = await Promise.all(
      sources.map((source) =>
        prisma.$queryRawUnsafe<unknown[]>(buildSearchSql(source).replace('{{SEARCH}}', searchClause), ...params),
      ),
    );

    const combined = results.flat().sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 20);

    return NextResponse.json(jsonSafe({ success: true, data: combined }));
  } catch (error: unknown) {
    console.error('[API /inventory/retur/search GET]', error);
    return NextResponse.json({ success: false, message: getErrorMessage(error) || 'Gagal mencari order' }, { status: 500 });
  }
}
