import { db } from '../db/connection';
import { decisions, features } from '../db/schema';
import { eq, and, desc, lt } from 'drizzle-orm';
import { NotFoundError } from '../lib/errors';
import { normalizeLimit, parseCursor, buildPaginatedResult } from '../lib/pagination';

export async function createDecision(params: {
  projectId: string;
  engineerId: string;
  title: string;
  decision: string;
  rationale?: string;
  alternatives?: string;
  featureSlug?: string;
  supersedes?: string;
}) {
  const { projectId, engineerId, title, decision, rationale, alternatives, featureSlug, supersedes } = params;

  let featureId: string | undefined;
  if (featureSlug) {
    const [feature] = await db
      .select({ id: features.id })
      .from(features)
      .where(and(eq(features.projectId, projectId), eq(features.slug, featureSlug)))
      .limit(1);

    if (!feature) {
      throw new NotFoundError('Feature', featureSlug);
    }
    featureId = feature.id;
  }

  const [result] = await db
    .insert(decisions)
    .values({
      projectId,
      engineerId,
      featureId,
      title,
      decision,
      rationale,
      alternatives,
      supersedes,
    })
    .returning();

  return result!;
}

export async function listDecisions(params: {
  projectId: string;
  featureSlug?: string;
  limit?: number;
  cursor?: string;
}) {
  const { projectId, featureSlug } = params;
  const limit = normalizeLimit(params.limit);
  const cursorDate = parseCursor(params.cursor);

  const conditions = [eq(decisions.projectId, projectId)];

  if (featureSlug) {
    const [feature] = await db
      .select({ id: features.id })
      .from(features)
      .where(and(eq(features.projectId, projectId), eq(features.slug, featureSlug)))
      .limit(1);

    if (!feature) {
      throw new NotFoundError('Feature', featureSlug);
    }
    conditions.push(eq(decisions.featureId, feature.id));
  }

  if (cursorDate) conditions.push(lt(decisions.createdAt, cursorDate));

  const items = await db
    .select()
    .from(decisions)
    .where(and(...conditions))
    .orderBy(desc(decisions.createdAt))
    .limit(limit + 1);

  return buildPaginatedResult(items, limit);
}
