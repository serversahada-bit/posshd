import { cookies } from 'next/headers';

import prisma from '@/lib/db';
import { applyStockCheck, buildOrderFormData, loadImportContext, requireOrderImportAccess, resolveImportOrder } from '@/lib/orderImport';
import { ORDER_FIELD_KEYS, PAYMENT_PROOF_MAX_BYTES, type ImportOrderInput, type OrderFieldKey, type OrderImportType } from '@/lib/orderImportShared';
import { POST as createAkuisisiOrder } from '@/app/api/orders/cso/route';
import { POST as createCsoOrder } from '@/app/api/orders_cso/route';
import { POST as createCrmOrder } from '@/app/api/orders_crm/route';
import { POST as createResendOrder } from '@/app/api/orders_resend/route';
import { POST as createEndorseOrder } from '@/app/api/orders_endorse/route';

export const dynamic = 'force-dynamic';

// Pesanan dibuat lewat route yang sama dengan form Buat Pesanan, supaya kode order, potong stok,
// shipment, payment & log status-nya identik dengan input manual.
const CREATE_ORDER_HANDLERS: Record<OrderImportType, (request: Request) => Promise<Response>> = {
  Akuisisi: createAkuisisiOrder,
  CSO: createCsoOrder,
  CRM: createCrmOrder,
  Resend: createResendOrder,
  Endorse: createEndorseOrder,
};

const toText = (value: unknown) => (typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '');

// Data dari browser dibangun ulang field per field; harga, ongkir & total selalu dihitung ulang di server.
function parseOrderInput(raw: unknown): ImportOrderInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  const fields = (source.fields && typeof source.fields === 'object' ? source.fields : {}) as Record<string, unknown>;
  const items = Array.isArray(source.items) ? source.items : [];
  const row = Number(source.row);
  if (!Number.isInteger(row) || row < 1) return null;

  return {
    row,
    fields: Object.fromEntries(ORDER_FIELD_KEYS.map((key) => [key, toText(fields[key])])) as Record<OrderFieldKey, string>,
    items: items.map((item) => {
      const value = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      return {
        slot: Number(value.slot) || 1,
        item_type: toText(value.item_type),
        item_name: toText(value.item_name),
        qty: toText(value.qty),
        item_discount: toText(value.item_discount),
      };
    }),
  };
}

// POST /api/orders_import/commit — menyimpan SATU pesanan hasil preview (dipanggil berurutan oleh halaman).
export async function POST(request: Request) {
  try {
    const denied = await requireOrderImportAccess();
    if (denied) return denied;

    const formData = await request.formData();
    let rawOrder: unknown = null;
    try {
      rawOrder = JSON.parse(String(formData.get('order') || ''));
    } catch {
      rawOrder = null;
    }
    const input = parseOrderInput(rawOrder);
    if (!input) {
      return Response.json({ status: 'error', message: 'Data pesanan tidak valid.' }, { status: 400 });
    }

    const proof = formData.get('payment_proof');
    const paymentProof = proof instanceof File && proof.size > 0 ? proof : null;
    if (paymentProof && !paymentProof.type.startsWith('image/')) {
      return Response.json({ status: 'error', message: 'Bukti pembayaran harus berupa gambar.' }, { status: 400 });
    }
    if (paymentProof && paymentProof.size > PAYMENT_PROOF_MAX_BYTES) {
      return Response.json({ status: 'error', message: 'Ukuran bukti pembayaran maksimal 5 MB.' }, { status: 400 });
    }

    const context = await loadImportContext([input]);
    const resolved = resolveImportOrder(input, context);
    applyStockCheck([resolved], context);

    if (!resolved.form) {
      return Response.json({ status: 'error', message: resolved.preview.errors.join(' ') || 'Pesanan tidak valid.' }, { status: 400 });
    }
    if (resolved.preview.needsProof && !paymentProof) {
      const label = resolved.form.payment_method === 'free' ? 'Bukti approval' : 'Bukti transfer';
      return Response.json({ status: 'error', message: `${label} wajib dilampirkan.` }, { status: 400 });
    }

    const cookieStore = await cookies();
    const userId = Number(cookieStore.get('sahada_user_id')?.value || 0);
    const forwardedHeaders = new Headers();
    ['x-forwarded-for', 'x-real-ip', 'cookie'].forEach((name) => {
      const value = request.headers.get(name);
      if (value) forwardedHeaders.set(name, value);
    });

    const createRequest = new Request(request.url, {
      method: 'POST',
      headers: forwardedHeaders,
      body: buildOrderFormData(resolved.form, userId, paymentProof),
    });
    const createResponse = await CREATE_ORDER_HANDLERS[resolved.form.jenis](createRequest);
    const result = (await createResponse.json()) as { status?: string; message?: string; order_code?: string };

    if (result.status !== 'success') {
      return Response.json({ status: 'error', message: result.message || 'Gagal menyimpan pesanan.' }, { status: 400 });
    }

    try {
      const fileName = toText(formData.get('file_name'));
      await prisma.activity_logs.create({
        data: {
          user_id: userId,
          action: 'Import Pesanan',
          target: result.order_code || null,
          details: `${resolved.form.jenis} · Baris ${input.row}${fileName ? ` · File ${fileName}` : ''}`,
          ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || null,
        },
      });
    } catch (logError: unknown) {
      console.error('[API /orders_import/commit] Gagal mencatat log aktivitas:', logError);
    }

    return Response.json({ status: 'success', order_code: result.order_code, total_payment: resolved.form.total_payment });
  } catch (error: unknown) {
    console.error('[API /orders_import/commit POST]', error);
    return Response.json(
      { status: 'error', message: error instanceof Error ? error.message : 'Gagal menyimpan pesanan' },
      { status: 500 },
    );
  }
}
