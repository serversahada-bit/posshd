import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { emitEvent } from '@/lib/socket-server';


export async function GET(request: NextRequest) {
  try {
    // We use Prisma's $queryRaw to mimic the UNION ALL query exactly as in POIN.
    const unvalidatedOrders: any[] = await prisma.$queryRaw`
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
              'CRM' as source_table
          FROM orders_crm o
          LEFT JOIN customers c ON o.customer_id = c.id
          INNER JOIN payments_crm p ON o.id = p.order_id
          WHERE p.payment_method = 'bank_transfer' AND p.payment_status != 'paid'
      ) as combined_unvalidated
      ORDER BY created_at DESC
    `;

    return NextResponse.json({ status: 'success', data: unvalidatedOrders });
  } catch (error: any) {
    console.error('Error fetching unvalidated orders:', error);
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
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
    } else if (action === 'reject') {
      if (source_table === 'CRM') {
        await prisma.payments_crm.update({
          where: { id: pid },
          data: { payment_status: 'rejected' }
        });
      } else if (source_table === 'CSO_AUTO') {
        await prisma.payments_cso.update({
          where: { id: pid },
          data: { payment_status: 'rejected' }
        });
      } else {
        await prisma.payments.update({
          where: { id: pid },
          data: { payment_status: 'rejected' }
        });
      }

      // Log activity
      await prisma.activity_logs.create({
        data: {
          user_id: 1,
          action: 'Reject FAT',
          target: 'Validasi Pembayaran',
          details: `Tolak pembayaran ID: ${pid}`
        }
      });

      return NextResponse.json({ status: 'success', message: 'Pembayaran ditolak.' });
    } else {
      return NextResponse.json({ status: 'error', message: 'Invalid action' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('Error handling validasi pembayaran:', error);
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}

