import {
  applyFileWarnings,
  applyStockCheck,
  loadImportContext,
  parseOrderImportWorkbook,
  requireOrderImportAccess,
  resolveImportOrder,
} from '@/lib/orderImport';
import { ORDER_IMPORT_MAX_ORDERS } from '@/lib/orderImportShared';

export const dynamic = 'force-dynamic';

// POST /api/orders_import/preview — membaca file Excel, memvalidasi & menghitung setiap pesanan.
// Tidak menyimpan apa pun; penyimpanan dilakukan per pesanan lewat /api/orders_import/commit.
export async function POST(request: Request) {
  try {
    const denied = await requireOrderImportAccess();
    if (denied) return denied;

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) {
      return Response.json({ status: 'error', message: 'File Excel wajib diunggah.' }, { status: 400 });
    }

    const orders = await parseOrderImportWorkbook(await file.arrayBuffer());
    if (orders.length === 0) {
      return Response.json({ status: 'error', message: 'Tidak ada pesanan yang terbaca di file. Pastikan data diisi mulai baris 2 sheet "Pesanan" (1 baris = 1 pesanan).' }, { status: 400 });
    }
    if (orders.length > ORDER_IMPORT_MAX_ORDERS) {
      return Response.json({ status: 'error', message: `Maksimal ${ORDER_IMPORT_MAX_ORDERS} pesanan per file (file ini berisi ${orders.length} baris). Pecah menjadi beberapa file.` }, { status: 400 });
    }

    const context = await loadImportContext(orders);
    const resolved = orders.map((order) => resolveImportOrder(order, context));
    applyStockCheck(resolved, context);
    applyFileWarnings(resolved);

    return Response.json({
      status: 'success',
      data: {
        fileName: file.name,
        orders: resolved.map((order) => order.preview),
      },
    });
  } catch (error: unknown) {
    console.error('[API /orders_import/preview POST]', error);
    return Response.json(
      { status: 'error', message: error instanceof Error ? error.message : 'Gagal membaca file' },
      { status: 500 },
    );
  }
}
