import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || '';

  try {
    let customers;
    if (q.trim() === '') {
      customers = await prisma.customers.findMany({
        take: 50,
        orderBy: { id: 'desc' },
        select: {
          id: true,
          name: true,
          whatsapp_number: true,
          email: true,
          address: true,
          subdistrict: true,
        },
      });
    } else {
      customers = await prisma.customers.findMany({
        where: {
          OR: [
            { name: { contains: q } },
            { whatsapp_number: { contains: q } },
          ],
        },
        take: 50,
        orderBy: { id: 'desc' },
        select: {
          id: true,
          name: true,
          whatsapp_number: true,
          email: true,
          address: true,
          subdistrict: true,
        },
      });
    }

    const results = customers.map((c) => ({
      id: c.id,
      text: `${c.name} - ${c.whatsapp_number || 'No WA'}`,
      name: c.name,
      whatsapp_number: c.whatsapp_number,
      email: c.email,
      address: c.address,
      subdistrict: c.subdistrict,
    }));

    return NextResponse.json({ results });
  } catch (error: any) {
    console.error('Error searching customers:', error);
    return NextResponse.json(
      { error: 'Failed to search customers', details: error.message },
      { status: 500 }
    );
  }
}
