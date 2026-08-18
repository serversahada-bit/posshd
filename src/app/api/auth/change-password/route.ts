import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/password';

type PasswordRow = {
  id: number;
  password: string;
};

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const userId = Number(cookieStore.get('sahada_user_id')?.value || 0);

    if (!userId) {
      return NextResponse.json(
        { success: false, message: 'Sesi login tidak ditemukan. Silakan login kembali.' },
        { status: 401 },
      );
    }

    const body = await request.json();
    const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { success: false, message: 'Password saat ini dan password baru wajib diisi' },
        { status: 400 },
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { success: false, message: 'Password baru minimal 6 karakter' },
        { status: 400 },
      );
    }

    const rows = await prisma.$queryRawUnsafe<PasswordRow[]>(
      'SELECT id, password FROM users WHERE id = ? LIMIT 1',
      userId,
    );
    const user = rows[0];

    if (!user) {
      return NextResponse.json(
        { success: false, message: 'Akun tidak ditemukan' },
        { status: 404 },
      );
    }

    const { valid } = await verifyPassword(currentPassword, user.password);
    if (!valid) {
      return NextResponse.json(
        { success: false, message: 'Password saat ini salah' },
        { status: 401 },
      );
    }

    const hashedPassword = await hashPassword(newPassword);
    await prisma.$executeRawUnsafe('UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?', hashedPassword, userId);

    return NextResponse.json({ success: true, message: 'Password berhasil diubah' });
  } catch (error) {
    console.error('[API /auth/change-password]', error);
    return NextResponse.json(
      { success: false, message: 'Gagal mengubah password' },
      { status: 500 },
    );
  }
}
