import { describe, it, expect } from 'bun:test';
import {
  normalizeLimit,
  parseCursor,
  buildPaginatedResult,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from '../../../lib/pagination';

describe('normalizeLimit', () => {
  it('returns DEFAULT_PAGE_SIZE (50) when called with undefined', () => {
    expect(normalizeLimit(undefined)).toBe(DEFAULT_PAGE_SIZE);
  });

  it('returns DEFAULT_PAGE_SIZE (50) when called with 0', () => {
    expect(normalizeLimit(0)).toBe(DEFAULT_PAGE_SIZE);
  });

  it('clamps a negative number to 1', () => {
    expect(normalizeLimit(-10)).toBe(1);
  });

  it('clamps values above MAX_PAGE_SIZE to 100', () => {
    expect(normalizeLimit(500)).toBe(MAX_PAGE_SIZE);
  });

  it('passes through 1 unchanged', () => {
    expect(normalizeLimit(1)).toBe(1);
  });

  it('passes through 50 unchanged', () => {
    expect(normalizeLimit(50)).toBe(50);
  });

  it('passes through 100 unchanged', () => {
    expect(normalizeLimit(100)).toBe(100);
  });

  it('passes through a mid-range value unchanged', () => {
    expect(normalizeLimit(25)).toBe(25);
  });
});

describe('parseCursor', () => {
  it('returns undefined when called with undefined', () => {
    expect(parseCursor(undefined)).toBeUndefined();
  });

  it('returns undefined for an empty string', () => {
    expect(parseCursor('')).toBeUndefined();
  });

  it('returns a valid Date for an ISO 8601 string', () => {
    const iso = '2025-01-15T12:30:00.000Z';
    const result = parseCursor(iso);
    expect(result).toBeInstanceOf(Date);
    expect(result!.toISOString()).toBe(iso);
  });

  it('returns undefined for an invalid date string', () => {
    expect(parseCursor('not-a-date')).toBeUndefined();
  });

  it('returns undefined for a random string', () => {
    expect(parseCursor('xyzzy')).toBeUndefined();
  });
});

describe('buildPaginatedResult', () => {
  function makeItem(isoDate: string) {
    return { id: isoDate, createdAt: new Date(isoDate) };
  }

  it('returns hasMore false and null nextCursor when items count equals limit', () => {
    const items = [
      makeItem('2025-01-01T00:00:00.000Z'),
      makeItem('2025-01-02T00:00:00.000Z'),
    ];
    const result = buildPaginatedResult(items, 2);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
    expect(result.items).toHaveLength(2);
  });

  it('returns hasMore false and null nextCursor when items count is less than limit', () => {
    const items = [makeItem('2025-01-01T00:00:00.000Z')];
    const result = buildPaginatedResult(items, 5);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
    expect(result.items).toHaveLength(1);
  });

  it('returns hasMore true when items count exceeds limit', () => {
    const items = [
      makeItem('2025-01-01T00:00:00.000Z'),
      makeItem('2025-01-02T00:00:00.000Z'),
      makeItem('2025-01-03T00:00:00.000Z'),
    ];
    const result = buildPaginatedResult(items, 2);
    expect(result.hasMore).toBe(true);
  });

  it('trims the last item when items exceed the limit', () => {
    const items = [
      makeItem('2025-01-01T00:00:00.000Z'),
      makeItem('2025-01-02T00:00:00.000Z'),
      makeItem('2025-01-03T00:00:00.000Z'),
    ];
    const result = buildPaginatedResult(items, 2);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual(items[0]);
    expect(result.items[1]).toEqual(items[1]);
  });

  it('sets nextCursor to the createdAt ISO string of the last returned item', () => {
    const items = [
      makeItem('2025-01-01T00:00:00.000Z'),
      makeItem('2025-01-02T00:00:00.000Z'),
      makeItem('2025-01-03T00:00:00.000Z'),
    ];
    const result = buildPaginatedResult(items, 2);
    expect(result.nextCursor).toBe('2025-01-02T00:00:00.000Z');
  });

  it('returns empty items array, null nextCursor, and hasMore false for empty input', () => {
    const result = buildPaginatedResult([], 10);
    expect(result.items).toHaveLength(0);
    expect(result.nextCursor).toBeNull();
    expect(result.hasMore).toBe(false);
  });

  it('returns exactly limit items when items count is limit + 1', () => {
    const items = [
      makeItem('2025-03-01T00:00:00.000Z'),
      makeItem('2025-03-02T00:00:00.000Z'),
      makeItem('2025-03-03T00:00:00.000Z'),
      makeItem('2025-03-04T00:00:00.000Z'),
    ];
    const result = buildPaginatedResult(items, 3);
    expect(result.items).toHaveLength(3);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe('2025-03-03T00:00:00.000Z');
  });

  it('does not mutate the original items array', () => {
    const items = [
      makeItem('2025-01-01T00:00:00.000Z'),
      makeItem('2025-01-02T00:00:00.000Z'),
      makeItem('2025-01-03T00:00:00.000Z'),
    ];
    const originalLength = items.length;
    buildPaginatedResult(items, 2);
    expect(items).toHaveLength(originalLength);
  });
});
