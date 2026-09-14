import { NextResponse } from 'next/server';
import { searchRemoteCustomers } from '@/lib/remote-customer-db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || '';

  try {
    // Local POS database search is disabled here — remote CRM database is the
    // single source for this dropdown, so the same customer no longer shows up twice.
    const results = await searchRemoteCustomers(q);

    return NextResponse.json({ results });
  } catch (error: any) {
    console.error('Error searching customers:', error);
    return NextResponse.json(
      { error: 'Failed to search customers', details: error.message },
      { status: 500 }
    );
  }
}
