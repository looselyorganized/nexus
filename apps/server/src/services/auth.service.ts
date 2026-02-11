import { db } from '../db/connection';
import { engineers, apiKeys } from '../db/schema';
import { eq } from 'drizzle-orm';
import * as argon2 from 'argon2';
import { generateApiKey, computeKeyPrefix } from '../lib/api-key';
import { ConflictError } from '../lib/errors';
import type { RegisterEngineerInput, RegisterEngineerResult } from '@nexus/shared';

async function generateApiKeyCredentials() {
  const plaintextKey = generateApiKey();
  const keyHash = await argon2.hash(plaintextKey);
  const keyPrefix = computeKeyPrefix(plaintextKey);
  return { plaintextKey, keyHash, keyPrefix };
}

export async function registerEngineer(input: RegisterEngineerInput): Promise<RegisterEngineerResult> {
  const normalizedEmail = input.email.toLowerCase();

  const existing = await db
    .select({ id: engineers.id })
    .from(engineers)
    .where(eq(engineers.email, normalizedEmail))
    .limit(1);

  if (existing.length > 0) {
    throw new ConflictError('An engineer with this email already exists');
  }

  const { plaintextKey, keyHash, keyPrefix } = await generateApiKeyCredentials();

  const result = await db.transaction(async (tx) => {
    const [engineer] = await tx
      .insert(engineers)
      .values({
        name: input.name,
        email: normalizedEmail,
        role: 'engineer',
      })
      .returning();

    await tx.insert(apiKeys).values({
      engineerId: engineer!.id,
      keyHash,
      keyPrefix,
    });

    return engineer!;
  });

  return {
    engineer: { id: result.id, name: result.name, email: result.email },
    apiKey: plaintextKey,
  };
}
