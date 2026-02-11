import { db } from '../db/connection';
import { features } from '../db/schema';
import { eq, and, desc, asc, lt, sql } from 'drizzle-orm';
import { NotFoundError, ValidationError, ConflictError } from '../lib/errors';
import type { FeatureStatus, Lane, AvailableFeature, FeatureTransitions as _FT } from '@nexus/shared';
import { FeatureTransitions, LanePriority } from '@nexus/shared';
import { normalizeLimit, parseCursor, buildPaginatedResult } from '../lib/pagination';
import { claimFiles, releaseAllFiles, getProjectClaims } from '../redis/claims';
import { publish } from '../redis/pubsub';

export async function createFeature(params: {
  projectId: string;
  slug: string;
  title: string;
  spec: string;
  lane?: Lane;
  priority?: number;
  touches?: string[];
  createdBy: string;
}) {
  const { projectId, slug, title, spec, lane = 'next', touches = [], createdBy } = params;

  // Check for duplicate slug
  const existing = await db
    .select({ id: features.id })
    .from(features)
    .where(and(eq(features.projectId, projectId), eq(features.slug, slug)))
    .limit(1);

  if (existing.length > 0) {
    throw new ConflictError(`Feature with slug '${slug}' already exists in this project`);
  }

  // Auto-assign priority if not provided: max priority + 1
  let priority = params.priority;
  if (priority === undefined) {
    const [maxPriority] = await db
      .select({ max: sql<number>`COALESCE(MAX(${features.priority}), 0)` })
      .from(features)
      .where(and(eq(features.projectId, projectId), eq(features.lane, lane)));
    priority = (maxPriority?.max ?? 0) + 1;
  }

  const [feature] = await db
    .insert(features)
    .values({
      projectId,
      slug,
      title,
      spec,
      status: 'draft',
      lane,
      priority,
      touches,
      createdBy,
    })
    .returning();

  return feature!;
}

export async function getFeature(projectId: string, slug: string) {
  const [feature] = await db
    .select()
    .from(features)
    .where(and(eq(features.projectId, projectId), eq(features.slug, slug)))
    .limit(1);

  if (!feature) {
    throw new NotFoundError('Feature', slug);
  }

  return feature;
}

export async function listFeatures(params: {
  projectId: string;
  status?: FeatureStatus;
  lane?: Lane;
  limit?: number;
  cursor?: string;
}) {
  const { projectId, status, lane } = params;
  const limit = normalizeLimit(params.limit);
  const cursorDate = parseCursor(params.cursor);

  const conditions = [eq(features.projectId, projectId)];
  if (status) conditions.push(eq(features.status, status));
  if (lane) conditions.push(eq(features.lane, lane));
  if (cursorDate) conditions.push(lt(features.createdAt, cursorDate));

  const items = await db
    .select()
    .from(features)
    .where(and(...conditions))
    .orderBy(asc(features.lane), asc(features.priority), desc(features.createdAt))
    .limit(limit + 1);

  return buildPaginatedResult(items, limit);
}

export async function updateFeature(params: {
  projectId: string;
  slug: string;
  title?: string;
  spec?: string;
  lane?: Lane;
  priority?: number;
  touches?: string[];
}) {
  const { projectId, slug, ...updates } = params;
  const feature = await getFeature(projectId, slug);

  const setValues: Record<string, unknown> = { updatedAt: new Date() };
  if (updates.title !== undefined) setValues.title = updates.title;
  if (updates.spec !== undefined) setValues.spec = updates.spec;
  if (updates.lane !== undefined) setValues.lane = updates.lane;
  if (updates.priority !== undefined) setValues.priority = updates.priority;
  if (updates.touches !== undefined) setValues.touches = updates.touches;

  const [updated] = await db
    .update(features)
    .set(setValues)
    .where(eq(features.id, feature.id))
    .returning();

  return updated!;
}

export async function deleteFeature(projectId: string, slug: string) {
  const feature = await getFeature(projectId, slug);

  if (feature.status !== 'draft') {
    throw new ValidationError('Only draft features can be deleted');
  }

  await db.delete(features).where(eq(features.id, feature.id));
}

// ─── Feature Lifecycle ───

function assertTransition(current: FeatureStatus, target: FeatureStatus) {
  const allowed = FeatureTransitions[current];
  if (!allowed || !allowed.includes(target)) {
    throw new ValidationError(
      `Cannot transition feature from '${current}' to '${target}'`
    );
  }
}

/**
 * Mark a draft feature as ready for pickup
 */
export async function markReady(projectId: string, slug: string) {
  const feature = await getFeature(projectId, slug);
  assertTransition(feature.status as FeatureStatus, 'ready');

  const [updated] = await db
    .update(features)
    .set({ status: 'ready', updatedAt: new Date() })
    .where(eq(features.id, feature.id))
    .returning();

  await publish(projectId, 'feature_updated', {
    feature: updated,
    field: 'status',
    oldValue: feature.status,
    newValue: 'ready',
  });

  return updated!;
}

/**
 * Claim a ready feature — locks touches paths via Redis
 */
export async function pickFeature(params: {
  projectId: string;
  slug: string;
  engineerId: string;
  engineerName?: string;
}) {
  const { projectId, slug, engineerId, engineerName } = params;
  const feature = await getFeature(projectId, slug);
  assertTransition(feature.status as FeatureStatus, 'active');

  // Claim touches paths in Redis if feature has any
  if (feature.touches && feature.touches.length > 0) {
    const result = await claimFiles({
      projectId,
      engineerId,
      engineerName,
      featureId: feature.id,
      files: feature.touches,
    });

    if (!result.success) {
      throw new ConflictError(
        `Cannot pick feature: file conflicts with ${result.conflicts.map((c) => c.claimedBy.engineerName || c.claimedBy.engineerId).join(', ')}`
      );
    }
  }

  const [updated] = await db
    .update(features)
    .set({
      status: 'active',
      claimedBy: engineerId,
      claimedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(features.id, feature.id))
    .returning();

  await publish(projectId, 'feature_claimed', {
    feature: updated,
    engineer: { id: engineerId, name: engineerName },
  });

  return updated!;
}

/**
 * Release a claimed feature back to ready — releases Redis claims
 */
export async function releaseFeature(params: {
  projectId: string;
  slug: string;
  engineerId: string;
}) {
  const { projectId, slug, engineerId } = params;
  const feature = await getFeature(projectId, slug);
  assertTransition(feature.status as FeatureStatus, 'ready');

  if (feature.claimedBy !== engineerId) {
    throw new ValidationError('Only the claiming engineer can release a feature');
  }

  // Release all claims for this engineer in the project
  await releaseAllFiles({ projectId, engineerId });

  const [updated] = await db
    .update(features)
    .set({
      status: 'ready',
      claimedBy: null,
      claimedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(features.id, feature.id))
    .returning();

  await publish(projectId, 'feature_released', {
    feature: updated,
    engineer: { id: engineerId },
  });

  return updated!;
}

/**
 * Mark an active feature as done — releases Redis claims
 */
export async function markDone(params: {
  projectId: string;
  slug: string;
  engineerId: string;
}) {
  const { projectId, slug, engineerId } = params;
  const feature = await getFeature(projectId, slug);
  assertTransition(feature.status as FeatureStatus, 'done');

  if (feature.claimedBy !== engineerId) {
    throw new ValidationError('Only the claiming engineer can complete a feature');
  }

  // Release all claims
  await releaseAllFiles({ projectId, engineerId });

  const [updated] = await db
    .update(features)
    .set({
      status: 'done',
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(features.id, feature.id))
    .returning();

  await publish(projectId, 'feature_completed', {
    feature: updated,
    engineer: { id: engineerId },
  });

  return updated!;
}

/**
 * Cancel an active feature — releases Redis claims
 */
export async function cancelFeature(params: {
  projectId: string;
  slug: string;
  engineerId: string;
}) {
  const { projectId, slug } = params;
  const feature = await getFeature(projectId, slug);
  assertTransition(feature.status as FeatureStatus, 'cancelled');

  // Release claims if active
  if (feature.claimedBy) {
    await releaseAllFiles({ projectId, engineerId: feature.claimedBy });
  }

  const [updated] = await db
    .update(features)
    .set({
      status: 'cancelled',
      updatedAt: new Date(),
    })
    .where(eq(features.id, feature.id))
    .returning();

  return updated!;
}

/**
 * Get available features — ready features with collision detection
 * Returns all ready features, marking ones with file conflicts
 */
export async function getAvailableFeatures(params: {
  projectId: string;
  engineerId: string;
}): Promise<AvailableFeature[]> {
  const { projectId, engineerId } = params;

  // Get all ready features sorted by lane priority, then priority number
  const readyFeatures = await db
    .select()
    .from(features)
    .where(and(eq(features.projectId, projectId), eq(features.status, 'ready')))
    .orderBy(asc(features.lane), asc(features.priority));

  if (readyFeatures.length === 0) return [];

  // Get all current claims in the project
  const allClaims = await getProjectClaims(projectId);
  const claimMap = new Map(allClaims.map((c) => [c.filePath, c]));

  const results: AvailableFeature[] = [];

  for (const feature of readyFeatures) {
    const available: AvailableFeature = { ...feature } as AvailableFeature;

    // Check for file conflicts
    if (feature.touches && feature.touches.length > 0) {
      for (const filePath of feature.touches) {
        const existingClaim = claimMap.get(filePath);
        if (existingClaim && existingClaim.engineerId !== engineerId) {
          // Find the feature slug for the blocking claim
          const [blockingFeature] = await db
            .select({ slug: features.slug })
            .from(features)
            .where(eq(features.id, existingClaim.featureId))
            .limit(1);

          available.blockedBy = {
            engineerId: existingClaim.engineerId,
            engineerName: existingClaim.engineerName,
            featureSlug: blockingFeature?.slug ?? 'unknown',
          };
          break;
        }
      }
    }

    results.push(available);
  }

  // Sort: unblocked first, then by lane priority and priority number
  results.sort((a, b) => {
    const aBlocked = a.blockedBy ? 1 : 0;
    const bBlocked = b.blockedBy ? 1 : 0;
    if (aBlocked !== bBlocked) return aBlocked - bBlocked;
    const laneDiff = (LanePriority[a.lane as Lane] ?? 99) - (LanePriority[b.lane as Lane] ?? 99);
    if (laneDiff !== 0) return laneDiff;
    return a.priority - b.priority;
  });

  return results;
}
