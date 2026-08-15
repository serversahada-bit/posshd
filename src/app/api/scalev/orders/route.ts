import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getScalevBaseUrl, listScalevOrders, type ScalevOrder } from '@/lib/scalev';

export const dynamic = 'force-dynamic';

const JAKARTA_OFFSET = '+07:00';
const MAX_UPSTREAM_PAGES = 8;

function getOrderTimestamp(row: ScalevOrder) {
  const raw = row.draft_time || row.created_at;
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  return Number.isNaN(ms) ? null : ms;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'draft';
    const search = searchParams.get('search') || undefined;
    const startDate = searchParams.get('start_date') || undefined;
    const endDate = searchParams.get('end_date') || undefined;
    const pageSize = Number(searchParams.get('page_size')) || 25;
    let cursor = searchParams.get('cursor') || undefined;

    const scalevSetting = await prisma.scalev.findFirst({
      where: { status: 'active' },
      orderBy: { id: 'desc' }
    });

    if (!scalevSetting || !scalevSetting.api_key) {
      return NextResponse.json({ success: false, message: 'API Key Scalev belum dikonfigurasi atau tidak aktif.' }, { status: 400 });
    }

    const apiKey = scalevSetting.api_key;
    const baseUrl = getScalevBaseUrl(scalevSetting.url);

    // Scalev hanya menyediakan `draft_time_until` (batas akhir) untuk status draft, tidak ada `draft_time_since`.
    // Batas awal difilter manual di sini, sambil mengambil beberapa halaman upstream bila perlu.
    const draftTimeUntil = endDate ? `${endDate}T23:59:59.999${JAKARTA_OFFSET}` : undefined;
    const startBoundaryMs = startDate ? new Date(`${startDate}T00:00:00.000${JAKARTA_OFFSET}`).getTime() : null;

    const collected: ScalevOrder[] = [];
    let finalHasNext = false;
    let finalCursor: string | null = null;

    for (let i = 0; i < MAX_UPSTREAM_PAGES; i++) {
      const result = await listScalevOrders({
        apiKey,
        baseUrl,
        status,
        search,
        cursor,
        pageSize,
        draftTimeUntil,
      });

      if (!result.ok) {
        return NextResponse.json({ success: false, message: result.message, details: result.data }, { status: result.statusCode });
      }

      let stoppedAtBoundary = false;
      for (const row of result.orders) {
        const ts = getOrderTimestamp(row);
        if (startBoundaryMs !== null && ts !== null && ts < startBoundaryMs) {
          stoppedAtBoundary = true;
          break;
        }
        collected.push(row);
      }

      if (stoppedAtBoundary) {
        finalHasNext = false;
        finalCursor = null;
        break;
      }

      if (!result.hasNext) {
        finalHasNext = false;
        finalCursor = null;
        break;
      }

      if (collected.length >= pageSize) {
        finalHasNext = true;
        finalCursor = result.nextCursor;
        break;
      }

      cursor = result.nextCursor || undefined;
      if (!cursor) {
        finalHasNext = false;
        finalCursor = null;
        break;
      }

      // Loop habis (MAX_UPSTREAM_PAGES tercapai) tanpa memenuhi pageSize: tetap tawarkan lanjut dari cursor terakhir.
      if (i === MAX_UPSTREAM_PAGES - 1) {
        finalHasNext = true;
        finalCursor = cursor;
      }
    }

    // `orderlines` (isi produk) sengaja TIDAK diambil di sini supaya list tetap cepat —
    // diambil terpisah oleh frontend lewat /api/scalev/orders/products setelah tabel tampil.
    return NextResponse.json({
      success: true,
      data: collected,
      hasNext: finalHasNext,
      nextCursor: finalCursor,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API /scalev/orders GET]', error);
    return NextResponse.json({ success: false, message: 'Internal Server Error: ' + message }, { status: 500 });
  }
}
