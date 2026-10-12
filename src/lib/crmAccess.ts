import { cookies } from 'next/headers';

import prisma from '@/lib/db';

// Role yang otomatis boleh membuka menu Dashboard CRM (sama dengan roleMapping 'dashboard_crm' di Sidebar).
const CRM_ROLES = ['admin', 'owner', 'cs_crm'];

type AccessUserRow = {
  role: string | null;
  permissions: string | null;
};

const parsePermissions = (value: string | null): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};

// Mengembalikan Response 401/403 jika user tidak boleh mengakses data CRM (dataslu), atau null jika boleh.
export async function requireCrmAccess(): Promise<Response | null> {
  const cookieStore = await cookies();
  const userId = Number(cookieStore.get('sahada_user_id')?.value || 0);

  if (!userId) {
    return Response.json({ success: false, message: 'Silakan login terlebih dahulu.' }, { status: 401 });
  }

  const rows = await prisma.$queryRawUnsafe<AccessUserRow[]>('SELECT role, permissions FROM users WHERE id = ? LIMIT 1', userId);
  const user = rows[0];

  if (!user) {
    return Response.json({ success: false, message: 'Silakan login terlebih dahulu.' }, { status: 401 });
  }

  if (CRM_ROLES.includes(user.role || 'cs') || parsePermissions(user.permissions).includes('dashboard_crm')) {
    return null;
  }

  return Response.json({ success: false, message: 'Anda tidak memiliki akses ke data CRM.' }, { status: 403 });
}
