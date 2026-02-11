import { createMiddleware } from 'hono/factory';
import * as argon2 from 'argon2';
import { db } from '../db/connection';
import { apiKeys, engineers } from '../db/schema';
import { eq } from 'drizzle-orm';
import { UnauthorizedError } from '../lib/errors';
import { ErrorCodes } from '@nexus/shared';
import type { Engineer } from '../db/schema';
import { computeKeyPrefix, isValidApiKeyFormat, API_KEY_PREFIX } from '../lib/api-key';

declare module 'hono' {
  interface ContextVariableMap {
    engineer: Engineer;
  }
}

export function extractApiKey(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  if (authHeader.startsWith('Bearer ')) return authHeader.slice(7);
  if (authHeader.startsWith(API_KEY_PREFIX)) return authHeader;
  return null;
}

export async function verifyApiKey(providedKey: string): Promise<Engineer | null> {
  const prefix = computeKeyPrefix(providedKey);

  const keys = await db
    .select({ apiKey: apiKeys, engineer: engineers })
    .from(apiKeys)
    .innerJoin(engineers, eq(apiKeys.engineerId, engineers.id))
    .where(eq(apiKeys.keyPrefix, prefix));

  for (const { apiKey, engineer } of keys) {
    try {
      const isValid = await argon2.verify(apiKey.keyHash, providedKey);
      if (isValid) {
        db.update(apiKeys)
          .set({ lastUsedAt: new Date() })
          .where(eq(apiKeys.id, apiKey.id))
          .execute()
          .catch(() => {});
        return engineer;
      }
    } catch {
      continue;
    }
  }

  return null;
}

export const authMiddleware = createMiddleware(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  const apiKey = extractApiKey(authHeader);

  if (!apiKey) {
    throw new UnauthorizedError('API key required', ErrorCodes.UNAUTHORIZED);
  }

  if (!isValidApiKeyFormat(apiKey)) {
    throw new UnauthorizedError('Invalid API key format', ErrorCodes.INVALID_API_KEY);
  }

  const engineer = await verifyApiKey(apiKey);

  if (!engineer) {
    throw new UnauthorizedError('Invalid API key', ErrorCodes.INVALID_API_KEY);
  }

  c.set('engineer', engineer);
  await next();
});
