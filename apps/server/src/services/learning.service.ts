import { db } from '../db/connection';
import { learnings, features } from '../db/schema';
import { eq, and, desc, lt } from 'drizzle-orm';
import { NotFoundError } from '../lib/errors';
import { normalizeLimit, parseCursor, buildPaginatedResult } from '../lib/pagination';

export async function addLearning(params: {
  projectId: string;
  featureSlug: string;
  engineerId: string;
  content: string;
}) {
  const { projectId, featureSlug, engineerId, content } = params;

  // Resolve feature by slug
  const [feature] = await db
    .select({ id: features.id })
    .from(features)
    .where(and(eq(features.projectId, projectId), eq(features.slug, featureSlug)))
    .limit(1);

  if (!feature) {
    throw new NotFoundError('Feature', featureSlug);
  }

  const [learning] = await db
    .insert(learnings)
    .values({
      featureId: feature.id,
      engineerId,
      content,
    })
    .returning();

  return learning!;
}

export async function listLearnings(params: {
  projectId: string;
  featureSlug: string;
  limit?: number;
  cursor?: string;
}) {
  const { projectId, featureSlug } = params;
  const limit = normalizeLimit(params.limit);
  const cursorDate = parseCursor(params.cursor);

  const [feature] = await db
    .select({ id: features.id })
    .from(features)
    .where(and(eq(features.projectId, projectId), eq(features.slug, featureSlug)))
    .limit(1);

  if (!feature) {
    throw new NotFoundError('Feature', featureSlug);
  }

  const conditions = [eq(learnings.featureId, feature.id)];
  if (cursorDate) conditions.push(lt(learnings.createdAt, cursorDate));

  const items = await db
    .select()
    .from(learnings)
    .where(and(...conditions))
    .orderBy(desc(learnings.createdAt))
    .limit(limit + 1);

  return buildPaginatedResult(items, limit);
}
