import { NextRequest, NextResponse } from 'next/server';
import { isValidApiKeyRequest } from '@/lib/apiKey';
import * as productsRoute from '@/app/api/products/route';
import * as ordersRoute from '@/app/api/orders/route';
import * as customersRoute from '@/app/api/customers/route';
import * as bundlingRoute from '@/app/api/bundling/route';
import * as giftsRoute from '@/app/api/gifts/route';
import * as warehousesRoute from '@/app/api/warehouses/route';
import * as promoRoute from '@/app/api/promo/route';

export const dynamic = 'force-dynamic';

type Handler = (request: NextRequest) => Promise<Response>;

// Website eksternal memakai API key ini (header x-api-key) untuk mengakses data POS,
// diteruskan ke handler internal yang sama dipakai dashboard — tanpa menduplikasi logikanya.
const REGISTRY: Record<string, Partial<Record<'GET' | 'POST' | 'PATCH', Handler>>> = {
  products: { GET: productsRoute.GET, POST: productsRoute.POST },
  orders: { GET: ordersRoute.GET, POST: ordersRoute.POST, PATCH: ordersRoute.PATCH },
  customers: { GET: customersRoute.GET, POST: customersRoute.POST },
  bundling: { GET: bundlingRoute.GET, POST: bundlingRoute.POST },
  gifts: { GET: giftsRoute.GET, POST: giftsRoute.POST },
  warehouses: { GET: warehousesRoute.GET as Handler, POST: warehousesRoute.POST },
  promo: { GET: promoRoute.GET, POST: promoRoute.POST },
};

async function handle(request: NextRequest, method: 'GET' | 'POST' | 'PATCH', path: string[]): Promise<Response> {
  const authorized = await isValidApiKeyRequest(request);
  if (!authorized) {
    return NextResponse.json({ success: false, message: 'API key tidak valid atau tidak ditemukan.' }, { status: 401 });
  }

  const [resource] = path;
  const handler = REGISTRY[resource]?.[method];
  if (!handler) {
    return NextResponse.json({ success: false, message: 'Resource tidak ditemukan.' }, { status: 404 });
  }

  return handler(request);
}

type RouteContext = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return handle(request, 'GET', path);
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return handle(request, 'POST', path);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return handle(request, 'PATCH', path);
}
