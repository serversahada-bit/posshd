import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const checkIdReff = searchParams.get('check_id_reff');

    if (!checkIdReff) {
      return NextResponse.json({ exists: false });
    }

    // Check in all 3 tables
    const exists1 = await prisma.payments.findFirst({
      where: { fat_proof_url: checkIdReff },
      select: { id: true }
    });
    
    if (exists1) return NextResponse.json({ exists: true });

    const exists2 = await prisma.payments_cso.findFirst({
      where: { fat_proof_url: checkIdReff },
      select: { id: true }
    });

    if (exists2) return NextResponse.json({ exists: true });

    const exists3 = await prisma.payments_crm.findFirst({
      where: { fat_proof_url: checkIdReff },
      select: { id: true }
    });

    if (exists3) return NextResponse.json({ exists: true });

    return NextResponse.json({ exists: false });
  } catch (error: any) {
    console.error('Error checking id_reff:', error);
    return NextResponse.json({ exists: false, error: error.message }, { status: 500 });
  }
}
