import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rawUsername = body?.username ?? body?.email;
    const rawPassword = body?.password;

    const username = typeof rawUsername === 'string' ? rawUsername.trim() : '';
    const password = typeof rawPassword === 'string' ? rawPassword : '';

    if (!username || !password) {
      return NextResponse.json(
        { success: false, message: 'Username dan password wajib diisi' },
        { status: 400 }
      );
    }

    const rows = await prisma.$queryRawUnsafe<Array<{
      id: number;
      name: string;
      email: string;
      password: string;
      role: string | null;
      permissions: string | null;
      photo_url: string | null;
    }>>(
      'SELECT id, name, email, password, role, permissions, photo_url FROM users WHERE email = ? LIMIT 1',
      username,
    );

    const user = rows[0];

    if (!user || user.password !== password) {
      return NextResponse.json(
        { success: false, message: 'Username atau password salah!' },
        { status: 401 }
      );
    }

    const sessionUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      permissions: user.permissions ? JSON.parse(user.permissions) : [],
      photo_url: user.photo_url,
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
    return NextResponse.json(
      { success: false, message: 'Terjadi kesalahan server. Pastikan database db_sahada_order aktif.' },
      { status: 500 }
    );
  }
}
