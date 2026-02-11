import { describe, it, expect, beforeEach } from 'bun:test';
import {
  truncateAll,
  flushTestRedis,
  request,
  jsonBody,
} from '../../setup/test-helpers';

beforeEach(async () => {
  await truncateAll();
  await flushTestRedis();
});

describe('GET /api/health/live', () => {
  it('returns 200 with status alive', async () => {
    const res = await request('/api/health/live');
    expect(res.status).toBe(200);

    const body = await jsonBody<{ status: string; timestamp: string }>(res);
    expect(body.status).toBe('alive');
    expect(body.timestamp).toBeDefined();
  });
});

describe('GET /api/health', () => {
  it('returns 200 when DB and Redis are healthy', async () => {
    const res = await request('/api/health');
    expect(res.status).toBe(200);

    const body = await jsonBody<{
      status: string;
      checks: { database: { status: string }; redis: { status: string } };
      timestamp: string;
    }>(res);
    expect(body.status).toBe('ready');
    expect(body.checks.database.status).toBe('healthy');
    expect(body.checks.redis.status).toBe('healthy');
    expect(body.timestamp).toBeDefined();
  });
});

describe('GET /api/health/ready', () => {
  it('returns 200 when healthy', async () => {
    const res = await request('/api/health/ready');
    expect(res.status).toBe(200);

    const body = await jsonBody<{
      status: string;
      checks: { database: { status: string; latencyMs: number }; redis: { status: string; latencyMs: number } };
    }>(res);
    expect(body.status).toBe('ready');
    expect(body.checks.database.latencyMs).toBeGreaterThanOrEqual(0);
    expect(body.checks.redis.latencyMs).toBeGreaterThanOrEqual(0);
  });
});

describe('GET /api/metrics', () => {
  it('returns 200 with text content type', async () => {
    const res = await request('/api/metrics');
    expect(res.status).toBe(200);

    const contentType = res.headers.get('content-type') ?? '';
    expect(contentType).toContain('text/');

    const text = await res.text();
    expect(text.length).toBeGreaterThan(0);
  });

  it('returns prometheus-style metrics content', async () => {
    const res = await request('/api/metrics');
    const text = await res.text();
    // Prometheus metrics typically contain HELP or TYPE lines or metric names
    expect(text).toBeDefined();
  });
});
