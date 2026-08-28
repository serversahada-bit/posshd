import { NextResponse } from 'next/server';

import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Terjadi kesalahan');

export async function GET() {
  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(`
      SELECT
        a.id,
        a.item_type,
        a.item_id,
        a.stock_type,
        COALESCE(p.product_name, g.gift_name, '-') as item_name,
        a.warehouse_id,
        w.warehouse_name,
        a.quantity_before,
        a.quantity_change,
        a.quantity_after,
        a.reason,
        a.invoice_note,
        a.invoice_proof_url,
        a.created_at,
        COALESCE(NULLIF(u.name, ''), NULLIF(u.email, ''), 'System') as created_by_name
      FROM inventory_adjustments a
      LEFT JOIN products p ON a.item_type = 'product' AND p.id = a.item_id
      LEFT JOIN gifts g ON a.item_type = 'gift' AND g.id = a.item_id
      LEFT JOIN warehouses w ON w.id = a.warehouse_id
      LEFT JOIN users u ON u.id = a.created_by
      ORDER BY a.id DESC
      LIMIT 200
    `);

    return NextResponse.json({ success: true, data: rows });
  } catch (error: unknown) {
    console.error('[API /inventory/history GET]', error);
    return NextResponse.json({ success: false, message: getErrorMessage(error) || 'Gagal mengambil riwayat inventori' }, { status: 500 });
  }
}
