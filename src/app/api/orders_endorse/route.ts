import { createCrmFamilyOrder, ENDORSE_ORDER_VARIANT } from '@/lib/crmOrderCreate';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return createCrmFamilyOrder(request, ENDORSE_ORDER_VARIANT);
}
