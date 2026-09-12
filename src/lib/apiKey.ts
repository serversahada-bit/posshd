import crypto from 'crypto';
import { NextRequest } from 'next/server';
import prisma from '@/lib/db';

const SETTING_KEY = 'external_api_key';

export async function getApiKey(): Promise<string | null> {
  const row = await prisma.global_settings.findUnique({ where: { key: SETTING_KEY } });
  return row?.value ?? null;
}

export async function generateApiKey(): Promise<string> {
  const key = `posshd_${crypto.randomBytes(24).toString('hex')}`;
  await prisma.global_settings.upsert({
    where: { key: SETTING_KEY },
    update: { value: key },
    create: { key: SETTING_KEY, value: key },
  });
  return key;
}

function readProvidedKey(request: NextRequest): string | null {
  const headerKey = request.headers.get('x-api-key');
  if (headerKey) return headerKey;

  const authHeader = request.headers.get('authorization');
  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }

  return null;
}

export async function isValidApiKeyRequest(request: NextRequest): Promise<boolean> {
  const provided = readProvidedKey(request);
  if (!provided) return false;

  const stored = await getApiKey();
  if (!stored) return false;

  const providedBuf = Buffer.from(provided);
  const storedBuf = Buffer.from(stored);
  if (providedBuf.length !== storedBuf.length) return false;

  return crypto.timingSafeEqual(providedBuf, storedBuf);
}
