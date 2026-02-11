import { describe, it, expect, beforeEach } from 'bun:test';
import {
  truncateAll,
  flushTestRedis,
  seedEngineer,
  request,
  authRequest,
  postJson,
  jsonBody,
} from '../../setup/test-helpers';

beforeEach(async () => {
  await truncateAll();
  await flushTestRedis();
});

describe('POST /api/auth/register', () => {
  it('returns 201 with engineer and apiKey', async () => {
    const res = await request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alice', email: 'alice@example.com' }),
    });

    expect(res.status).toBe(201);
    const body = await jsonBody<{ data: { engineer: any; apiKey: string } }>(res);
    expect(body.data.engineer.name).toBe('Alice');
    expect(body.data.engineer.email).toBe('alice@example.com');
    expect(body.data.engineer.id).toBeDefined();
    expect(body.data.apiKey).toBeDefined();
    expect(body.data.apiKey.startsWith('nexus_eng_')).toBe(true);
  });

  it('normalizes email to lowercase', async () => {
    const res = await request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alice', email: 'Alice@Example.COM' }),
    });

    expect(res.status).toBe(201);
    const body = await jsonBody<{ data: { engineer: any } }>(res);
    expect(body.data.engineer.email).toBe('alice@example.com');
  });

  it('returns 400 for missing name', async () => {
    const res = await request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'bob@example.com' }),
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 for empty name', async () => {
    const res = await request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '', email: 'bob@example.com' }),
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid email', async () => {
    const res = await request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Bob', email: 'not-an-email' }),
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 for missing email', async () => {
    const res = await request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Bob' }),
    });

    expect(res.status).toBe(400);
  });

  it('returns 409 for duplicate email', async () => {
    const email = `dup-${Date.now()}@example.com`;

    await request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'First', email }),
    });

    const res = await request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Second', email }),
    });

    expect(res.status).toBe(409);
  });

  it('returns 409 for duplicate email case-insensitive', async () => {
    const email = `DupCase-${Date.now()}@Example.COM`;

    await request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'First', email: email.toLowerCase() }),
    });

    const res = await request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Second', email: email.toUpperCase() }),
    });

    expect(res.status).toBe(409);
  });
});

describe('GET /api/auth/me', () => {
  it('returns 200 with correct engineer data', async () => {
    const { engineer, apiKey } = await seedEngineer({ name: 'Me User' });

    const res = await authRequest('/api/auth/me', apiKey);
    expect(res.status).toBe(200);

    const body = await jsonBody<{ data: { id: string; name: string; email: string; role: string } }>(res);
    expect(body.data.id).toBe(engineer.id);
    expect(body.data.name).toBe('Me User');
    expect(body.data.email).toBe(engineer.email);
    expect(body.data.role).toBe('engineer');
  });

  it('returns 401 without auth header', async () => {
    const res = await request('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 with invalid API key', async () => {
    const res = await authRequest('/api/auth/me', 'nexus_eng_invalidkeyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
    expect(res.status).toBe(401);
  });
});
