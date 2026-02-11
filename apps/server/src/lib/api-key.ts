import { createHash, randomBytes } from 'crypto';

export const API_KEY_PREFIX = 'nexus_eng_';
export const API_KEY_LENGTH = 74; // 'nexus_eng_' (10) + 64 hex chars

export function computeKeyPrefix(plaintextKey: string): string {
  const hash = createHash('sha256').update(plaintextKey).digest('hex');
  return hash.slice(0, 16);
}

export function generateApiKey(): string {
  return `${API_KEY_PREFIX}${randomBytes(32).toString('hex')}`;
}

export function isValidApiKeyFormat(key: string): boolean {
  return key.startsWith(API_KEY_PREFIX) && key.length === API_KEY_LENGTH;
}
