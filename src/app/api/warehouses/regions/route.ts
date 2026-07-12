import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';

type RegionOption = {
  id: string;
  text: string;
};

let cachedRegions: RegionOption[] | null = null;

async function getRegions() {
  if (cachedRegions) {
    return cachedRegions;
  }

  const filepath = path.join(process.cwd(), 'POIN', 'data', 'subdistricts.json');
  const file = await readFile(filepath, 'utf8');
  cachedRegions = JSON.parse(file) as RegionOption[];
  return cachedRegions;
}

export async function GET(request: NextRequest) {
  try {
    const q = (request.nextUrl.searchParams.get('q') || '').trim().toLowerCase();
    const regions = await getRegions();

    const results = (q
      ? regions.filter((item) => item.text.toLowerCase().includes(q)).slice(0, 50)
      : regions.slice(0, 50)
    ).map((item) => ({
      id: item.id,
      text: item.text,
    }));

    return NextResponse.json(results);
  } catch (error) {
    console.error('[API /warehouses/regions GET]', error);
    return NextResponse.json({ success: false, message: 'Gagal mengambil daftar wilayah' }, { status: 500 });
  }
}
