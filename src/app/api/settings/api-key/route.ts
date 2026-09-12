import { NextResponse } from 'next/server';
import { getApiKey, generateApiKey } from '@/lib/apiKey';

export async function GET() {
  try {
    const key = await getApiKey();
    return NextResponse.json({ success: true, data: { api_key: key } });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const key = await generateApiKey();
    return NextResponse.json({ success: true, data: { api_key: key } });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
