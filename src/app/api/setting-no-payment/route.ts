import { NextRequest, NextResponse } from 'next/server';

import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Terjadi kesalahan');

export async function GET() {
  try {
    const data = await prisma.no_payment_methods.findMany({
      orderBy: { method_name: 'asc' },
    });

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    console.error('[API /setting-no-payment GET]', error);
    return NextResponse.json({ success: false, message: getErrorMessage(error) || 'Gagal mengambil data metode no payment' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const method_name = String(body?.method_name || '').trim();
    const description = String(body?.description || '').trim();
    const is_active = Boolean(body?.is_active);

    if (!method_name) {
      return NextResponse.json({ success: false, message: 'Nama metode wajib diisi.' }, { status: 400 });
    }

    await prisma.no_payment_methods.create({
      data: {
        method_name,
        description: description || null,
        is_active,
      },
    });

    return NextResponse.json({ success: true, message: 'Metode No Payment baru berhasil ditambahkan.' });
  } catch (error: unknown) {
    console.error('[API /setting-no-payment POST]', error);
    return NextResponse.json({ success: false, message: getErrorMessage(error) || 'Gagal menambah metode no payment' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const id = Number(body?.id || 0);
    const method_name = String(body?.method_name || '').trim();
    const description = String(body?.description || '').trim();
    const is_active = Boolean(body?.is_active);

    if (!id || !method_name) {
      return NextResponse.json({ success: false, message: 'ID dan nama metode wajib diisi.' }, { status: 400 });
    }

    await prisma.no_payment_methods.update({
      where: { id },
      data: {
        method_name,
        description: description || null,
        is_active,
      },
    });

    return NextResponse.json({ success: true, message: 'Metode No Payment berhasil diperbarui.' });
  } catch (error: unknown) {
    console.error('[API /setting-no-payment PUT]', error);
    return NextResponse.json({ success: false, message: getErrorMessage(error) || 'Gagal memperbarui metode no payment' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const id = Number(searchParams.get('id') || 0);

    if (!id) {
      return NextResponse.json({ success: false, message: 'ID metode wajib diisi.' }, { status: 400 });
    }

    await prisma.no_payment_methods.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: 'Metode No Payment berhasil dihapus.' });
  } catch (error: unknown) {
    console.error('[API /setting-no-payment DELETE]', error);
    return NextResponse.json({ success: false, message: getErrorMessage(error) || 'Gagal menghapus metode no payment' }, { status: 500 });
  }
}
