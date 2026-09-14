import bcrypt from 'bcryptjs';

const BCRYPT_PREFIX = /^\$2[aby]?\$/;

export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, 10);
}

export function isHashedPassword(password: string): boolean {
  return BCRYPT_PREFIX.test(password);
}

/**
 * Verifies a password against a stored value that may still be legacy plain text
 * (pre-hashing accounts). `needsRehash` is true when the match succeeded against
 * a plain-text value, so the caller can upgrade it to a bcrypt hash.
 */
export async function verifyPassword(
  plainPassword: string,
  storedPassword: string,
): Promise<{ valid: boolean; needsRehash: boolean }> {
  if (isHashedPassword(storedPassword)) {
    const valid = await bcrypt.compare(plainPassword, storedPassword);
    return { valid, needsRehash: false };
  }

  const valid = plainPassword === storedPassword;
  return { valid, needsRehash: valid };
}
