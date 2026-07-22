import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { emitEvent } from '@/lib/socket-server';

type UnvalidatedOrder = {
  order_id: bigint | number;
  order_code: string;
  created_at: Date | string;
  total_payment: bigint | number;
  customer_name: string | null;
  payment_id: bigint | number;
  payment_status: string;
  payment_proof_url: string | null;
  bank_name: string | null;
  account_name: string | null;
  account_number: string | null;
  reject_reason: string | null;
  source_table: 'CSO' | 'CSO_AUTO' | 'CRM';
};

const jsonSafe = <T>(value: T): T =>
  JSON.parse(
    JSON.stringify(value, (_key, item) =>
      typeof item === 'bigint' ? item.toString() : item
    )
  ) as T;

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // We use Prisma's $queryRaw to mimic the UNION ALL query exactly as in POIN.
    const unvalidatedOrders = await prisma.$queryRaw<UnvalidatedOrder[]>`
      SELECT * FROM (
          SELECT 
              o.id as order_id,
              o.order_code,
              o.created_at,
              o.total_payment,
              c.name as customer_name,
              p.id as payment_id,
              p.payment_status,
              p.payment_proof_url,
              p.bank_name,
              p.account_name,
              p.account_number,
              p.reject_reason,
              'CSO' as source_table
          FROM orders o
          LEFT JOIN customers c ON o.customer_id = c.id
          INNER JOIN payments p ON o.id = p.order_id
          WHERE p.payment_method = 'bank_transfer' AND p.payment_status != 'paid'

          UNION ALL

          SELECT 
              o.id as order_id,
              o.order_code,
              o.created_at,
              o.total_payment,
              c.name as customer_name,
              p.id as payment_id,
              p.payment_status,
              p.payment_proof_url,
              p.bank_name,
              p.account_name,
              p.account_number,
              p.reject_reason,
              'CSO_AUTO' as source_table
          FROM orders_cso o
          LEFT JOIN customers c ON o.customer_id = c.id
          INNER JOIN payments_cso p ON o.id = p.order_id
          WHERE p.payment_method = 'bank_transfer' AND p.payment_status != 'paid'

          UNION ALL

          SELECT 
              o.id as order_id,
              o.order_code,
              o.created_at,
              o.total_payment,
              c.name as customer_name,
              p.id as payment_id,
              p.payment_status,
              p.payment_proof_url,
              p.bank_name,
              p.account_name,
              p.account_number,
              p.reject_reason,
              'CRM' as source_table
          FROM orders_crm o
          LEFT JOIN customers c ON o.customer_id = c.id
          INNER JOIN payments_crm p ON o.id = p.order_id
          WHERE p.payment_method = 'bank_transfer' AND p.payment_status != 'paid'
      ) as combined_unvalidated
      ORDER BY created_at DESC
    `;

    return NextResponse.json(jsonSafe({ status: 'success', data: unvalidatedOrders }));
  } catch (error: unknown) {
    console.error('Error fetching unvalidated orders:', error);
    return NextResponse.json(
      { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, payment_id, source_table, id_reff } = body;

    if (!payment_id || !source_table || !action) {
      return NextResponse.json({ status: 'error', message: 'Missing required parameters' }, { status: 400 });
    }

    const pid = Number(payment_id);

    if (action === 'approve') {
      if (!id_reff) {
        return NextResponse.json({ status: 'error', message: 'ID Reff wajib diisi' }, { status: 400 });
      }

      if (source_table === 'CRM') {
        await prisma.payments_crm.update({
          where: { id: pid },
          data: { payment_status: 'paid', paid_at: new Date(), fat_proof_url: id_reff }
        });
      } else if (source_table === 'CSO_AUTO') {
        await prisma.payments_cso.update({
          where: { id: pid },
          data: { payment_status: 'paid', paid_at: new Date(), fat_proof_url: id_reff }
        });
      } else {
        await prisma.payments.update({
          where: { id: pid },
          data: { payment_status: 'paid', paid_at: new Date(), fat_proof_url: id_reff }
        });
      }

      // Log activity
      await prisma.activity_logs.create({
        data: {
          user_id: 1,
          action: 'Approve FAT',
          target: 'Validasi Pembayaran',
          details: `Approve pembayaran ID: ${pid} (ID Reff: ${id_reff})`
        }
      });

      await emitEvent('NEW_OLAHAN');

      return NextResponse.json({ status: 'success', message: 'Pembayaran berhasil divalidasi FAT.' });
    }

    if (action === 'reject') {
      const { reject_reason } = body;
      
      if (source_table === 'CRM') {
        const payment = await prisma.payments_crm.update({
          where: { id: pid },
          data: { payment_status: 'rejected', reject_reason }
        });
        await prisma.orders_crm.update({
          where: { id: payment.order_id },
          data: { order_status: 'problem' }
        });
      } else if (source_table === 'CSO_AUTO') {
        const payment = await prisma.payments_cso.update({
          where: { id: pid },
          data: { payment_status: 'rejected', reject_reason }
        });
        await prisma.orders_cso.update({
          where: { id: payment.order_id },
          data: { order_status: 'problem' }
        });
      } else {
        const payment = await prisma.payments.update({
          where: { id: pid },
          data: { payment_status: 'rejected', reject_reason }
        });
        await prisma.orders.update({
          where: { id: payment.order_id },
          data: { order_status: 'problem' }
        });
      }

      // Log activity
      await prisma.activity_logs.create({
        data: {
          user_id: 1,
          action: 'Reject FAT',
          target: 'Validasi Pembayaran',
          details: `Tolak pembayaran ID: ${pid}${reject_reason ? ` - Alasan: ${reject_reason}` : ''}`
        }
      });

      await emitEvent('NEW_OLAHAN');

      return NextResponse.json({ status: 'success', message: 'Pembayaran ditolak.' });
    }

    return NextResponse.json({ status: 'error', message: 'Invalid action' }, { status: 400 });
  } catch (error: unknown) {
    console.error('Error handling validasi pembayaran:', error);
    return NextResponse.json(
      { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
