import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body as { email: string; password: string };

    if (!email || !password) {
      return Response.json(
        { success: false, message: 'Email dan password wajib diisi' },
        { status: 400 }
      );
    }

    const user = await prisma.users.findUnique({
      where: { email },
    });

    if (!user) {
      return Response.json(
        { success: false, message: 'Email atau password salah!' },
        { status: 401 }
      );
    }

    // Validasi password (plain text seperti POIN)
    if (user.password !== password) {
      return Response.json(
        { success: false, message: 'Email atau password salah!' },
        { status: 401 }
      );
    }

    const sessionUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      permissions: user.permissions ? JSON.parse(user.permissions) : [],
    };

    const response = NextResponse.json({ success: true, data: sessionUser });
    response.cookies.set('sahada_user_id', String(user.id), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });
    return response;
  } catch (error) {
    console.error('[API /auth/login]', error);
    return Response.json(
      { success: false, message: 'Terjadi kesalahan server. Pastikan database db_sahada_order aktif.' },
      { status: 500 }
    );
  }
}
