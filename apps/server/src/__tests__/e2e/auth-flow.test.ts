import { describe, it, expect, beforeEach } from 'bun:test';
import {
  truncateAll,
  flushTestRedis,
  request,
  authRequest,
  postJson,
  jsonBody,
} from '../setup/test-helpers';

beforeEach(async () => {
  await truncateAll();
  await flushTestRedis();
});

describe('Auth E2E flow', () => {
  it('register engineer, verify identity via /me, second engineer gets different key', async () => {
    // Step 1: Register first engineer
    const registerRes1 = await request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alice Auth', email: 'alice-auth@example.com' }),
    });
    expect(registerRes1.status).toBe(201);

    const body1 = await jsonBody<{ data: { engineer: any; apiKey: string } }>(registerRes1);
    expect(body1.data.engineer.name).toBe('Alice Auth');
    expect(body1.data.engineer.email).toBe('alice-auth@example.com');
    expect(body1.data.apiKey).toBeTruthy();

    const apiKey1 = body1.data.apiKey;

    // Step 2: Use key on GET /api/auth/me to verify identity
    const meRes = await authRequest('/api/auth/me', apiKey1);
    expect(meRes.status).toBe(200);

    const meBody = await jsonBody<{ data: any }>(meRes);
    expect(meBody.data.name).toBe('Alice Auth');
    expect(meBody.data.email).toBe('alice-auth@example.com');
    expect(meBody.data.id).toBe(body1.data.engineer.id);
    expect(meBody.data.role).toBe('engineer');

    // Step 3: Register second engineer with different key
    const registerRes2 = await request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Bob Auth', email: 'bob-auth@example.com' }),
    });
    expect(registerRes2.status).toBe(201);

    const body2 = await jsonBody<{ data: { engineer: any; apiKey: string } }>(registerRes2);
    expect(body2.data.apiKey).toBeTruthy();
    expect(body2.data.apiKey).not.toBe(apiKey1);

    // Step 4: Verify second engineer identity
    const meRes2 = await authRequest('/api/auth/me', body2.data.apiKey);
    expect(meRes2.status).toBe(200);
    const meBody2 = await jsonBody<{ data: any }>(meRes2);
    expect(meBody2.data.name).toBe('Bob Auth');
  });

  it('rejects invalid key on /api/auth/me', async () => {
    const fakeKey = 'nexus_eng_0000000000000000000000000000000000000000000000000000000000000000';
    const res = await authRequest('/api/auth/me', fakeKey);
    expect(res.status).toBe(401);
  });

  it('rejects invalid key on /api/projects', async () => {
    const fakeKey = 'nexus_eng_0000000000000000000000000000000000000000000000000000000000000000';
    const res = await authRequest('/api/projects', fakeKey);
    expect(res.status).toBe(401);
  });

  it('rejects request with no Authorization header on /me', async () => {
    const res = await request('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects request with malformed Bearer token', async () => {
    const res = await request('/api/auth/me', {
      headers: { Authorization: 'Bearer not-a-valid-format' },
    });
    expect(res.status).toBe(401);
  });
});
