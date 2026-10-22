import { createCrmFamilyOrder, CRM_ORDER_VARIANT } from '@/lib/crmOrderCreate';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return createCrmFamilyOrder(request, CRM_ORDER_VARIANT);
}
