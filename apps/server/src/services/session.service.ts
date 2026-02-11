import { db } from '../db/connection';
import { sessions, engineers } from '../db/schema';
import { eq, and, sql, inArray } from 'drizzle-orm';
import type { SessionMetadata } from '@nexus/shared';
import { NotFoundError } from '../lib/errors';

import { logger } from '../lib/logger';
import {
  updateSessionHeartbeat as updateRedisHeartbeat,
  removeSessionHeartbeat,
  getAllActiveSessionIds,
} from '../redis/sessions';

/**
 * Get or create a session for an engineer in a project
 * - Returns existing active session if one exists
 * - Creates new session otherwise
 */
export async function getOrCreateSession(
  projectId: string,
  engineerId: string,
  featureId?: string,
  metadata?: SessionMetadata
) {
  // Check for existing active session
  const [existing] = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.projectId, projectId),
        eq(sessions.engineerId, engineerId),
        eq(sessions.status, 'active')
      )
    )
    .limit(1);

  if (existing) {
    // Update heartbeat and optionally feature
    const updates: Record<string, unknown> = { lastHeartbeat: new Date() };
    if (featureId !== undefined) updates.featureId = featureId;

    const [updated] = await db
      .update(sessions)
      .set(updates)
      .where(eq(sessions.id, existing.id))
      .returning();

    await updateRedisHeartbeat(existing.id);
    return updated!;
  }

  // Create new session
  const [created] = await db
    .insert(sessions)
    .values({
      projectId,
      engineerId,
      featureId: featureId ?? null,
      status: 'active',
      metadata: metadata ?? null,
    })
    .returning();

  await updateRedisHeartbeat(created!.id);
  return created!;
}

/**
 * Update session heartbeat (writes to Redis, synced to DB periodically)
 */
export async function updateHeartbeat(sessionId: string): Promise<void> {
  await updateRedisHeartbeat(sessionId);
}

/**
 * Disconnect a session
 */
export async function disconnectSession(sessionId: string) {
  await removeSessionHeartbeat(sessionId);

  const [updated] = await db
    .update(sessions)
    .set({ status: 'disconnected' })
    .where(eq(sessions.id, sessionId))
    .returning();

  if (!updated) {
    throw new NotFoundError('Session', sessionId);
  }

  return updated;
}

/**
 * Set the feature a session is working on
 */
export async function setSessionFeature(sessionId: string, featureId: string | null) {
  const [updated] = await db
    .update(sessions)
    .set({ featureId })
    .where(eq(sessions.id, sessionId))
    .returning();

  if (!updated) {
    throw new NotFoundError('Session', sessionId);
  }

  return updated;
}

/**
 * Get all active sessions for a project
 */
export async function getActiveSessions(projectId: string) {
  return db
    .select({
      session: sessions,
      engineer: {
        id: engineers.id,
        name: engineers.name,
        email: engineers.email,
      },
    })
    .from(sessions)
    .innerJoin(engineers, eq(sessions.engineerId, engineers.id))
    .where(
      and(
        eq(sessions.projectId, projectId),
        eq(sessions.status, 'active')
      )
    );
}

/**
 * Get the active session for an engineer in a project
 */
export async function getActiveSessionForEngineer(
  projectId: string,
  engineerId: string
) {
  const [session] = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.projectId, projectId),
        eq(sessions.engineerId, engineerId),
        eq(sessions.status, 'active')
      )
    )
    .limit(1);

  return session ?? null;
}

/**
 * Cleanup stale sessions — mark active sessions with no Redis heartbeat as disconnected
 */
export async function cleanupStaleSessions(): Promise<{ disconnected: number }> {
  const activeSessions = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.status, 'active'));

  if (activeSessions.length === 0) return { disconnected: 0 };

  const activeRedisIds = new Set(await getAllActiveSessionIds());
  const staleIds = activeSessions
    .filter((s) => !activeRedisIds.has(s.id))
    .map((s) => s.id);

  if (staleIds.length === 0) return { disconnected: 0 };

  const result = await db
    .update(sessions)
    .set({ status: 'disconnected' })
    .where(inArray(sessions.id, staleIds))
    .returning({ id: sessions.id });

  if (result.length > 0) {
    logger.info({ count: result.length }, 'Cleaned up stale sessions');
  }

  return { disconnected: result.length };
}

/**
 * Batch update session heartbeats in the database (from Redis sync)
 */
export async function batchUpdateHeartbeats(
  updates: Array<{ sessionId: string; lastHeartbeat: Date }>
): Promise<number> {
  if (updates.length === 0) return 0;

  const BATCH_SIZE = 100;
  let totalUpdated = 0;

  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    const sessionIds = batch.map((u) => u.sessionId);

    const valueRows = batch.map(
      (u) => sql`(${u.sessionId}::uuid, ${u.lastHeartbeat.toISOString()}::timestamp)`
    );

    const result = await db
      .update(sessions)
      .set({
        lastHeartbeat: sql`v.heartbeat`,
      })
      .from(sql`(VALUES ${sql.join(valueRows, sql`, `)}) AS v(session_id, heartbeat)`)
      .where(
        and(
          sql`${sessions.id} = v.session_id`,
          eq(sessions.status, 'active'),
          inArray(sessions.id, sessionIds)
        )
      )
      .returning({ id: sessions.id });

    totalUpdated += result.length;
  }

  return totalUpdated;
}
