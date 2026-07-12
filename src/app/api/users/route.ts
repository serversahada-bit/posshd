import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { users_role } from '@prisma/client';

// GET /api/users — setara manajemen_user.php POIN
export async function GET() {
  try {
    const users = await prisma.users.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        permissions: true,
        created_at: true,
        updated_at: true,
      },
      orderBy: {
        id: 'desc',
      },
    });

    return Response.json({
      success: true,
      data: users.map((u) => ({
        ...u,
        permissions: u.permissions ? JSON.parse(u.permissions) : [],
      })),
    });
  } catch (error) {
    console.error('[API /users GET]', error);
    return Response.json({ success: false, message: 'Gagal mengambil data user' }, { status: 500 });
  }
}

// POST /api/users — tambah user baru
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, password, role, permissions } = body as {
      name: string;
      email: string;
      password: string;
      role: users_role;
      permissions?: string[];
    };

    if (!name || !email || !password || !role) {
      return Response.json(
        { success: false, message: 'Nama, email, password, dan role wajib diisi' },
        { status: 400 }
      );
    }

    const existingUser = await prisma.users.count({
      where: { email },
    });

    if (existingUser > 0) {
      return Response.json({ success: false, message: 'Email/Username sudah digunakan.' }, { status: 400 });
    }

    await prisma.users.create({
      data: {
        name,
        email,
        password,
        role,
        permissions: permissions ? JSON.stringify(permissions) : null,
      },
    });

    return Response.json({ success: true, message: 'User berhasil ditambahkan' });
  } catch (error) {
    console.error('[API /users POST]', error);
    return Response.json({ success: false, message: 'Gagal menambah user. Email mungkin sudah terdaftar.' }, { status: 500 });
  }
}

// PUT /api/users — update user
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, email, password, role, permissions } = body as {
      id: number;
      name: string;
      email: string;
      password?: string;
      role: users_role;
      permissions?: string[];
    };

    if (!id || !name || !email || !role) {
      return Response.json({ success: false, message: 'ID, nama, email, dan role wajib diisi' }, { status: 400 });
    }

    const existingUser = await prisma.users.count({
      where: {
        email,
        id: { not: Number(id) },
      },
    });

    if (existingUser > 0) {
      return Response.json({ success: false, message: 'Email/Username sudah digunakan oleh akun lain.' }, { status: 400 });
    }

    await prisma.users.update({
      where: { id: Number(id) },
      data: {
        name,
        email,
        ...(password && { password }),
        role,
        permissions: permissions ? JSON.stringify(permissions) : null,
      },
    });

    return Response.json({ success: true, message: 'User berhasil diperbarui' });
  } catch (error) {
    console.error('[API /users PUT]', error);
    return Response.json({ success: false, message: 'Gagal memperbarui user' }, { status: 500 });
  }
}

// DELETE /api/users — hapus user
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const id = searchParams.get('id');

    if (!id) {
      return Response.json({ success: false, message: 'ID user wajib diisi' }, { status: 400 });
    }

    await prisma.users.delete({
      where: { id: Number(id) },
    });

    return Response.json({ success: true, message: 'User berhasil dihapus' });
  } catch (error) {
    console.error('[API /users DELETE]', error);
    return Response.json({ success: false, message: 'Gagal menghapus user' }, { status: 500 });
  }
}
