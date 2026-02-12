import { db } from '../db/connection';
import { checkpoints, sessions } from '../db/schema';
import { eq, and, desc, lt, notInArray } from 'drizzle-orm';
import { createHash } from 'crypto';
import type { Checkpoint } from '@nexus/shared';
import { ValidationError } from '../lib/errors';
import { getEngineerClaims } from '../redis/claims';
import { getActiveSessionForEngineer } from './session.service';
import { config } from '../config';
import { logger } from '../lib/logger';

type CheckpointType = 'auto_periodic' | 'manual' | 'crash_recovery';

interface CreateCheckpointInput {
  sessionId: string;
  featureId: string;
  context: Record<string, unknown>;
  type?: CheckpointType;
  notes?: string;
  activeClaims?: string[];
}

/**
 * Sort object keys recursively for consistent hashing
 */
function sortObjectKeys<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sortObjectKeys) as T;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortObjectKeys((obj as Record<string, unknown>)[key]);
  }
  return sorted as T;
}

/**
 * Compute checkpoint hash for deduplication
 */
function computeHash(input: {
  featureId: string;
  context: Record<string, unknown>;
  activeClaims: string[];
}): string {
  const content = JSON.stringify(sortObjectKeys({
    featureId: input.featureId,
    context: input.context,
    activeClaims: [...input.activeClaims].sort(),
  }));
  return createHash('sha256').update(content).digest('hex').slice(0, 32);
}

/**
 * Create a checkpoint with atomic isLatest flag management
 * Returns null if checkpoint would be a duplicate (for auto_periodic)
 */
export async function createCheckpoint(
  projectId: string,
  engineerId: string,
  input: CreateCheckpointInput
): Promise<Checkpoint | null> {
  const checkpointType = input.type ?? 'manual';

  // Validate session belongs to engineer
  const [session] = await db
    .select()
    .from(sessions)
    .where(
      and(eq(sessions.id, input.sessionId), eq(sessions.engineerId, engineerId))
    )
    .limit(1);

  if (!session) {
    throw new ValidationError('Session not found or does not belong to engineer');
  }

  // Get active claims if not provided
  let activeClaims = input.activeClaims;
  if (!activeClaims) {
    const claims = await getEngineerClaims({ projectId, engineerId });
    activeClaims = claims.map((c) => c.filePath);
  }

  // Compute hash for deduplication (only for auto_periodic)
  let stateHash: string | null = null;
  if (checkpointType === 'auto_periodic') {
    stateHash = computeHash({
      featureId: input.featureId,
      context: input.context,
      activeClaims,
    });

    const latest = await getLatestCheckpoint(engineerId, input.featureId);
    if (latest && latest.stateHash === stateHash) {
      logger.debug({ featureId: input.featureId }, 'Skipping duplicate checkpoint');
      return null;
    }
  }

  return doCreateCheckpoint(projectId, engineerId, {
    ...input,
    type: checkpointType,
    activeClaims,
    stateHash,
  });
}

async function doCreateCheckpoint(
  _projectId: string,
  engineerId: string,
  input: CreateCheckpointInput & {
    type: CheckpointType;
    activeClaims: string[];
    stateHash: string | null;
  }
): Promise<Checkpoint> {
  const result = await db.transaction(async (tx) => {
    // Clear existing isLatest flag
    await tx
      .update(checkpoints)
      .set({ isLatest: false })
      .where(
        and(
          eq(checkpoints.engineerId, engineerId),
          eq(checkpoints.featureId, input.featureId),
          eq(checkpoints.isLatest, true)
        )
      );

    // Insert new checkpoint
    const [created] = await tx
      .insert(checkpoints)
      .values({
        sessionId: input.sessionId,
        featureId: input.featureId,
        engineerId,
        type: input.type,
        stateHash: input.stateHash,
        activeClaims: input.activeClaims,
        context: input.context,
        notes: input.notes ?? null,
        isLatest: true,
      })
      .returning();

    return created!;
  });

  return mapToApi(result);
}

/**
 * Get the latest checkpoint for an engineer working on a feature
 */
export async function getLatestCheckpoint(
  engineerId: string,
  featureId: string
): Promise<Checkpoint | null> {
  const [checkpoint] = await db
    .select()
    .from(checkpoints)
    .where(
      and(
        eq(checkpoints.engineerId, engineerId),
        eq(checkpoints.featureId, featureId),
        eq(checkpoints.isLatest, true)
      )
    )
    .limit(1);

  return checkpoint ? mapToApi(checkpoint) : null;
}

/**
 * Get checkpoint history for an engineer working on a feature
 */
export async function getCheckpointHistory(
  engineerId: string,
  featureId: string,
  limit: number = 20
): Promise<Checkpoint[]> {
  const results = await db
    .select()
    .from(checkpoints)
    .where(
      and(
        eq(checkpoints.engineerId, engineerId),
        eq(checkpoints.featureId, featureId)
      )
    )
    .orderBy(desc(checkpoints.createdAt))
    .limit(limit);

  return results.map(mapToApi);
}

/**
 * Create a crash recovery checkpoint
 */
export async function createCrashRecoveryCheckpoint(params: {
  projectId: string;
  engineerId: string;
  featureId: string;
  activeClaims: string[];
}) {
  const session = await getActiveSessionForEngineer(params.projectId, params.engineerId);
  if (!session) return null;

  return doCreateCheckpoint(params.projectId, params.engineerId, {
    sessionId: session.id,
    featureId: params.featureId,
    type: 'crash_recovery',
    context: {},
    activeClaims: params.activeClaims,
    stateHash: null,
  });
}

/**
 * Cleanup old checkpoints while preserving latest and active session checkpoints
 */
export async function cleanupOldCheckpoints(
  retentionDays: number = config.checkpointRetentionDays
): Promise<{ deleted: number }> {
  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const activeSessions = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.status, 'active'));

  const activeSessionIds = activeSessions.map((s) => s.id);

  const conditions = [
    eq(checkpoints.isLatest, false),
    lt(checkpoints.createdAt, cutoffDate),
  ];

  if (activeSessionIds.length > 0) {
    conditions.push(notInArray(checkpoints.sessionId, activeSessionIds));
  }

  const result = await db
    .delete(checkpoints)
    .where(and(...conditions))
    .returning({ id: checkpoints.id });

  if (result.length > 0) {
    logger.info({ count: result.length }, 'Checkpoint cleanup completed');
  }

  return { deleted: result.length };
}

function mapToApi(cp: typeof checkpoints.$inferSelect): Checkpoint {
  return {
    id: cp.id,
    sessionId: cp.sessionId,
    featureId: cp.featureId,
    engineerId: cp.engineerId,
    type: cp.type,
    stateHash: cp.stateHash,
    activeClaims: cp.activeClaims,
    context: cp.context,
    notes: cp.notes,
    isLatest: cp.isLatest,
    createdAt: cp.createdAt,
  };
}
