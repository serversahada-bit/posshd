import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { users_role } from '@prisma/client';

type UserPayload = {
  id?: number;
  name: string;
  email: string;
  password?: string;
  role: users_role;
  permissions?: string[];
};

type UserRow = {
  id: number;
  name: string;
  email: string;
  role: users_role | null;
  permissions: string | null;
  created_at: Date;
  updated_at: Date;
};

const parsePermissions = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
      return [];
    }
  }

  return [];
};

const serializeUser = (user: UserRow) => ({
  ...user,
  role: (user.role ?? 'admin') as users_role,
  permissions: user.permissions ? JSON.parse(user.permissions) : [],
  photo_url: null,
});

const parseRequestBody = async (request: NextRequest): Promise<UserPayload> => {
  if (request.headers.get('content-type')?.includes('multipart/form-data')) {
    const formData = await request.formData();
    return {
      id: formData.get('id') ? Number(formData.get('id')) : undefined,
      name: String(formData.get('name') || '').trim(),
      email: String(formData.get('email') || '').trim(),
      password: String(formData.get('password') || ''),
      role: String(formData.get('role') || 'cs') as users_role,
      permissions: parsePermissions(formData.get('permissions')),
    };
  }

  const json = await request.json() as UserPayload;
  return {
    ...json,
    id: json.id ? Number(json.id) : undefined,
    name: String(json.name || '').trim(),
    email: String(json.email || '').trim(),
    password: String(json.password || ''),
    permissions: parsePermissions(json.permissions),
  };
};

const findUserByEmail = async (email: string) => {
  const rows = await prisma.$queryRawUnsafe<UserRow[]>(
    'SELECT id, name, email, role, permissions, created_at, updated_at FROM users WHERE email = ? LIMIT 1',
    email,
  );
  return rows[0] || null;
};

const findUserById = async (id: number) => {
  const rows = await prisma.$queryRawUnsafe<UserRow[]>(
    'SELECT id, name, email, role, permissions, created_at, updated_at FROM users WHERE id = ? LIMIT 1',
    id,
  );
  return rows[0] || null;
};

export async function GET() {
  try {
    const users = await prisma.$queryRawUnsafe<UserRow[]>(
      'SELECT id, name, email, role, permissions, created_at, updated_at FROM users ORDER BY id DESC'
    );

    return Response.json({
      success: true,
      data: users.map(serializeUser),
    });
  } catch (error) {
    console.error('[API /users GET]', error);
    return Response.json({ success: false, message: 'Gagal mengambil data user' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await parseRequestBody(request);
    const { name, email, password, role, permissions } = body;

    if (!name || !email || !password || !role) {
      return Response.json({ success: false, message: 'Nama, email, password, dan role wajib diisi' }, { status: 400 });
    }

    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      return Response.json({ success: false, message: 'Email/Username sudah digunakan.' }, { status: 400 });
    }

    await prisma.$executeRawUnsafe(
      'INSERT INTO users (name, email, password, role, permissions, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())',
      name,
      email,
      password,
      role,
      permissions?.length ? JSON.stringify(permissions) : null,
    );

    const createdUser = await findUserByEmail(email);
    return Response.json({ success: true, message: 'User berhasil ditambahkan', data: createdUser ? serializeUser(createdUser) : null });
  } catch (error) {
    console.error('[API /users POST]', error);
    return Response.json({ success: false, message: error instanceof Error ? error.message : 'Gagal menambah user.' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await parseRequestBody(request);
    const { id, name, email, password, role, permissions } = body;

    if (!id || !name || !email || !role) {
      return Response.json({ success: false, message: 'ID, nama, email, dan role wajib diisi' }, { status: 400 });
    }

    const duplicate = await prisma.$queryRawUnsafe<Array<{ total: number }>>(
      'SELECT COUNT(*) AS total FROM users WHERE email = ? AND id != ?',
      email,
      Number(id),
    );

    if (Number(duplicate[0]?.total || 0) > 0) {
      return Response.json({ success: false, message: 'Email/Username sudah digunakan oleh akun lain.' }, { status: 400 });
    }

    const nextPassword = password ? password : null;
    await prisma.$executeRawUnsafe(
      'UPDATE users SET name = ?, email = ?, password = COALESCE(?, password), role = ?, permissions = ?, updated_at = NOW() WHERE id = ?',
      name,
      email,
      nextPassword,
      role,
      permissions?.length ? JSON.stringify(permissions) : null,
      Number(id),
    );

    const updatedUser = await findUserById(Number(id));
    return Response.json({ success: true, message: 'User berhasil diperbarui', data: updatedUser ? serializeUser(updatedUser) : null });
  } catch (error) {
    console.error('[API /users PUT]', error);
    return Response.json({ success: false, message: error instanceof Error ? error.message : 'Gagal memperbarui user' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const id = searchParams.get('id');

    if (!id) {
      return Response.json({ success: false, message: 'ID user wajib diisi' }, { status: 400 });
    }

    await prisma.$executeRawUnsafe('DELETE FROM users WHERE id = ?', Number(id));

    return Response.json({ success: true, message: 'User berhasil dihapus' });
  } catch (error) {
    console.error('[API /users DELETE]', error);
    return Response.json({ success: false, message: 'Gagal menghapus user' }, { status: 500 });
  }
}
