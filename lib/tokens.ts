import { randomBytes, createHash } from 'crypto';

export function generateApiToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashApiToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
