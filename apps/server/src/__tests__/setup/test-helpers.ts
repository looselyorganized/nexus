import { beforeAll, afterAll, afterEach } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import Redis from 'ioredis';
import { sql } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { db } from '../../db/connection';
import { app } from '../../app';
import { registerEngineer } from '../../services/auth.service';
import { getOrCreateSession } from '../../services/session.service';
import { createFeature } from '../../services/feature.service';
import type { SessionMetadata, Lane } from '@nexus/shared';

// ─── DB Helpers ───

let migrationClient: ReturnType<typeof postgres> | null = null;

export async function runMigrations() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL required for tests');

  migrationClient = postgres(databaseUrl, { max: 1 });
  const migrationDb = drizzle(migrationClient);
  try {
    await migrate(migrationDb, { migrationsFolder: './src/db/migrations' });
  } catch (err: unknown) {
    // If schema already exists (e.g. via drizzle-kit push), that's fine
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('already exists')) {
      // Verify core tables are present
      const result = await migrationClient`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'engineers'
      `;
      if (result.length === 0) throw err;
    } else {
      throw err;
    }
  }
}

/**
 * TRUNCATE CASCADE all tables in FK-safe order.
 */
export async function truncateAll() {
  await db.execute(sql`
    TRUNCATE TABLE
      checkpoints,
      sessions,
      learnings,
      decisions,
      features,
      project_members,
      api_keys,
      projects,
      engineers
    CASCADE
  `);
}

// ─── Redis Helpers ───

let testRedis: Redis | null = null;

export function getTestRedis(): Redis {
  if (!testRedis) {
    const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
    testRedis = new Redis(`${redisUrl}/1`, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }
  return testRedis;
}

export async function flushTestRedis() {
  const redis = getTestRedis();
  await redis.flushdb();
}

// ─── Factories (plain objects, no DB) ───

let factoryCounter = 0;

export function engineerFactory(overrides?: Partial<{ name: string; email: string; role: string }>) {
  factoryCounter++;
  return {
    name: overrides?.name ?? `Test Engineer ${factoryCounter}`,
    email: overrides?.email ?? `test-${factoryCounter}-${Date.now()}@example.com`,
    role: overrides?.role ?? 'engineer',
  };
}

export function projectFactory(overrides?: Partial<{ name: string; slug: string; repoUrl: string; defaultBranch: string }>) {
  factoryCounter++;
  return {
    name: overrides?.name ?? `Test Project ${factoryCounter}`,
    slug: overrides?.slug ?? `test-project-${factoryCounter}-${Date.now()}`,
    repoUrl: overrides?.repoUrl ?? 'https://github.com/test/repo',
    defaultBranch: overrides?.defaultBranch ?? 'main',
  };
}

export function featureFactory(overrides?: Partial<{
  slug: string;
  title: string;
  spec: string;
  lane: Lane;
  priority: number;
  touches: string[];
}>) {
  factoryCounter++;
  return {
    slug: overrides?.slug ?? `test-feature-${factoryCounter}-${Date.now()}`,
    title: overrides?.title ?? `Test Feature ${factoryCounter}`,
    spec: overrides?.spec ?? `Spec for test feature ${factoryCounter}`,
    lane: overrides?.lane ?? ('next' as Lane),
    priority: overrides?.priority,
    touches: overrides?.touches ?? [],
  };
}

export function decisionFactory(overrides?: Partial<{
  title: string;
  decision: string;
  rationale: string;
  alternatives: string;
}>) {
  factoryCounter++;
  return {
    title: overrides?.title ?? `Decision ${factoryCounter}`,
    decision: overrides?.decision ?? `We decided to do X for reason ${factoryCounter}`,
    rationale: overrides?.rationale ?? 'Because it is better',
    alternatives: overrides?.alternatives ?? 'We could have done Y',
  };
}

export function learningFactory(overrides?: Partial<{ content: string }>) {
  factoryCounter++;
  return {
    content: overrides?.content ?? `Learning content ${factoryCounter}: something useful`,
  };
}

// ─── Seeders (insert into DB, return entities + API key) ───

export async function seedEngineer(overrides?: Partial<{ name: string; email: string }>) {
  const data = engineerFactory(overrides);
  const result = await registerEngineer({ name: data.name, email: data.email });
  return { engineer: result.engineer, apiKey: result.apiKey };
}

export async function seedProject(engineerId: string, overrides?: Partial<{ name: string; slug: string; repoUrl: string }>) {
  const data = projectFactory(overrides);

  const [project] = await db.insert(schema.projects).values({
    name: data.name,
    slug: data.slug,
    repoUrl: data.repoUrl,
    defaultBranch: data.defaultBranch,
  }).returning();

  // Add creator as lead
  await db.insert(schema.projectMembers).values({
    projectId: project!.id,
    engineerId,
    role: 'lead',
  });

  return project!;
}

export async function seedFeature(
  projectId: string,
  engineerId: string,
  overrides?: Partial<{
    slug: string;
    title: string;
    spec: string;
    lane: Lane;
    priority: number;
    touches: string[];
  }>
) {
  const data = featureFactory(overrides);
  return createFeature({
    projectId,
    slug: data.slug,
    title: data.title,
    spec: data.spec,
    lane: data.lane,
    touches: data.touches,
    createdBy: engineerId,
    priority: data.priority,
  });
}

export async function seedSession(projectId: string, engineerId: string, featureId?: string, metadata?: SessionMetadata) {
  return getOrCreateSession(projectId, engineerId, featureId, metadata);
}

// ─── Hono Request Wrappers ───

export function request(path: string, init?: RequestInit) {
  return app.request(path, init);
}

export function authRequest(path: string, apiKey: string, init?: RequestInit) {
  return app.request(path, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${apiKey}`,
    },
  });
}

export function postJson(path: string, apiKey: string, body: unknown) {
  return app.request(path, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

export function patchJson(path: string, apiKey: string, body: unknown) {
  return app.request(path, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

export function deleteRequest(path: string, apiKey: string) {
  return app.request(path, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
}

export async function jsonBody<T = unknown>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

// ─── Environment Setup ───

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  await runMigrations();

  // Connect test Redis
  const redis = getTestRedis();
  await redis.connect();
});

afterAll(async () => {
  // Close migration client
  if (migrationClient) {
    await migrationClient.end();
  }

  // Close test Redis
  if (testRedis) {
    await testRedis.quit();
    testRedis = null;
  }
});
