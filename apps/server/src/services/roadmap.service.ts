import { db } from '../db/connection';
import { features } from '../db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { ValidationError, NotFoundError } from '../lib/errors';
import type { Lane, Roadmap, RoadmapLane, ReorderInput } from '@nexus/shared';


const VALID_LANES: Lane[] = ['now', 'next', 'later', 'icebox'];

/**
 * Get the full roadmap for a project — features grouped by lane, sorted by priority
 */
export async function getRoadmap(projectId: string): Promise<Roadmap> {
  const allFeatures = await db
    .select()
    .from(features)
    .where(eq(features.projectId, projectId))
    .orderBy(asc(features.priority));

  const laneMap = new Map<Lane, RoadmapLane>();
  for (const lane of VALID_LANES) {
    laneMap.set(lane, { lane, features: [] });
  }

  for (const feature of allFeatures) {
    const lane = laneMap.get(feature.lane as Lane);
    if (lane) {
      lane.features.push(feature as any);
    }
  }

  return {
    projectId,
    lanes: VALID_LANES.map((l) => laneMap.get(l)!),
  };
}

/**
 * Reorder features within lanes — accepts ordered list of slugs per lane
 */
export async function reorderFeatures(
  projectId: string,
  input: ReorderInput
): Promise<Roadmap> {
  // Validate lanes
  for (const lane of Object.keys(input)) {
    if (!VALID_LANES.includes(lane as Lane)) {
      throw new ValidationError(`Invalid lane: ${lane}`);
    }
  }

  // Update priorities for each lane
  await db.transaction(async (tx) => {
    for (const [lane, slugs] of Object.entries(input)) {
      for (let i = 0; i < slugs.length; i++) {
        const slug = slugs[i]!;
        const result = await tx
          .update(features)
          .set({
            lane,
            priority: i + 1,
            updatedAt: new Date(),
          })
          .where(
            and(eq(features.projectId, projectId), eq(features.slug, slug))
          )
          .returning({ id: features.id });

        if (result.length === 0) {
          throw new NotFoundError('Feature', slug);
        }
      }
    }
  });

  return getRoadmap(projectId);
}

/**
 * Move a feature to a different lane (keeps same relative priority position)
 */
export async function moveToLane(params: {
  projectId: string;
  slug: string;
  lane: Lane;
  priority?: number;
}): Promise<typeof features.$inferSelect> {
  const { projectId, slug, lane, priority } = params;

  if (!VALID_LANES.includes(lane)) {
    throw new ValidationError(`Invalid lane: ${lane}`);
  }

  // Get the feature
  const [feature] = await db
    .select()
    .from(features)
    .where(and(eq(features.projectId, projectId), eq(features.slug, slug)))
    .limit(1);

  if (!feature) {
    throw new NotFoundError('Feature', slug);
  }

  // If no priority specified, put at end of target lane
  let newPriority = priority;
  if (newPriority === undefined) {
    // Count features in target lane + 1
    const laneFeatures = await db
      .select({ id: features.id })
      .from(features)
      .where(and(eq(features.projectId, projectId), eq(features.lane, lane)));

    newPriority = laneFeatures.length + 1;
  }

  const [updated] = await db
    .update(features)
    .set({ lane, priority: newPriority, updatedAt: new Date() })
    .where(eq(features.id, feature.id))
    .returning();

  return updated!;
}
