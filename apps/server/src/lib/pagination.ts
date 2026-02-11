import type { PaginatedResult } from '@nexus/shared';

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

export function normalizeLimit(limit?: number): number {
  if (!limit) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(1, limit), MAX_PAGE_SIZE);
}

export function parseCursor(cursor?: string): Date | undefined {
  if (!cursor) return undefined;
  const date = new Date(cursor);
  if (isNaN(date.getTime())) return undefined;
  return date;
}

export function buildPaginatedResult<T extends { createdAt: Date }>(
  items: T[],
  limit: number
): PaginatedResult<T> {
  const hasMore = items.length > limit;
  const resultItems = hasMore ? items.slice(0, -1) : items;
  const nextCursor =
    hasMore && resultItems.length > 0
      ? resultItems[resultItems.length - 1]!.createdAt.toISOString()
      : null;
  return { items: resultItems, nextCursor, hasMore };
}
