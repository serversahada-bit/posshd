import { NextResponse } from 'next/server';
import { searchRemoteCustomers } from '@/lib/remote-customer-db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || '';

  try {
    let results = await searchRemoteCustomers(q);

    // Also search local POS database for customer name/WA or order_code
    if (q.trim().length >= 2) {
      const { PrismaClient } = await import('@prisma/client');
      // @ts-ignore
      const prisma = global.prisma || new PrismaClient();
      
      const [localOrders, localCusts] = await Promise.all([
        prisma.orders.findMany({
          where: { order_code: { contains: q.trim() } },
          include: { customers: true },
          take: 5
        }),
        prisma.customers.findMany({
          where: {
            OR: [
              { name: { contains: q.trim() } },
              { whatsapp_number: { contains: q.trim() } }
            ]
          },
          take: 5
        })
      ]);
      
      const localResults: any[] = [];
      const seenIds = new Set();

      const addLocalResult = (c: any, extraText: string) => {
        if (!c || seenIds.has(c.id)) return;
        seenIds.add(c.id);
        localResults.push({
          id: c.id,
          text: `${c.name || 'Tanpa Nama'} - ${c.whatsapp_number || 'No WA'} (Local${extraText ? ': ' + extraText : ''})`,
          name: c.name || '',
          whatsapp_number: c.whatsapp_number || '',
          email: c.email || '',
          address: c.address || '',
          subdistrict: c.subdistrict || '',
          desa: c.desa || '',
          city: c.city || '',
          province: c.province || '',
          registered_at: c.created_at,
        });
      };

      localOrders.forEach((o: any) => addLocalResult(o.customers, o.order_code));
      localCusts.forEach((c: any) => addLocalResult(c, ''));

      if (localResults.length > 0) {
        results = [...localResults, ...results];
      }
    }

    return NextResponse.json({ results });
  } catch (error: any) {
    console.error('Error searching customers:', error);
    return NextResponse.json(
      { error: 'Failed to search customers', details: error.message },
      { status: 500 }
    );
  }
}
