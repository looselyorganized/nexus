import { describe, it, expect, beforeEach } from 'bun:test';
import { truncateAll, flushTestRedis, engineerFactory } from '../../setup/test-helpers';
import { registerEngineer } from '../../../services/auth.service';
import * as argon2 from 'argon2';
import { db } from '../../../db/connection';
import { apiKeys, engineers } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { ConflictError } from '../../../lib/errors';

beforeEach(async () => {
  await truncateAll();
  await flushTestRedis();
});

describe('registerEngineer', () => {
  it('creates engineer with correct name and email (lowercase)', async () => {
    const input = { name: 'Alice Smith', email: 'Alice@Example.COM' };
    const result = await registerEngineer(input);

    expect(result.engineer.name).toBe('Alice Smith');
    expect(result.engineer.email).toBe('alice@example.com');
  });

  it('returns plaintext API key starting with nexus_eng_', async () => {
    const data = engineerFactory();
    const result = await registerEngineer({ name: data.name, email: data.email });

    expect(result.apiKey.startsWith('nexus_eng_')).toBe(true);
  });

  it('returns API key that is 74 characters long', async () => {
    const data = engineerFactory();
    const result = await registerEngineer({ name: data.name, email: data.email });

    expect(result.apiKey.length).toBe(74);
  });

  it('creates API key record in database', async () => {
    const data = engineerFactory();
    const result = await registerEngineer({ name: data.name, email: data.email });

    const [keyRecord] = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.engineerId, result.engineer.id))
      .limit(1);

    expect(keyRecord).toBeDefined();
    expect(keyRecord!.engineerId).toBe(result.engineer.id);
    expect(keyRecord!.keyHash).toBeTruthy();
    expect(keyRecord!.keyPrefix).toBeTruthy();
  });

  it('stores Argon2 hash that verifies against plaintext key', async () => {
    const data = engineerFactory();
    const result = await registerEngineer({ name: data.name, email: data.email });

    const [keyRecord] = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.engineerId, result.engineer.id))
      .limit(1);

    const isValid = await argon2.verify(keyRecord!.keyHash, result.apiKey);
    expect(isValid).toBe(true);
  });

  it('throws ConflictError on duplicate email', async () => {
    const email = `dupe-${Date.now()}@example.com`;
    await registerEngineer({ name: 'First', email });

    expect(registerEngineer({ name: 'Second', email })).rejects.toBeInstanceOf(ConflictError);
  });

  it('throws ConflictError on duplicate email (case-insensitive)', async () => {
    const email = `CaseTest-${Date.now()}@example.com`;
    await registerEngineer({ name: 'First', email: email.toLowerCase() });

    expect(registerEngineer({ name: 'Second', email: email.toUpperCase() })).rejects.toBeInstanceOf(ConflictError);
  });

  it('creates engineer with role "engineer" by default', async () => {
    const data = engineerFactory();
    const result = await registerEngineer({ name: data.name, email: data.email });

    const [eng] = await db
      .select()
      .from(engineers)
      .where(eq(engineers.id, result.engineer.id))
      .limit(1);

    expect(eng!.role).toBe('engineer');
  });
});
