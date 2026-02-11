import { describe, it, expect, beforeEach } from 'bun:test';
import {
  truncateAll,
  flushTestRedis,
  seedEngineer,
  seedProject,
  seedFeature,
  request,
  authRequest,
  postJson,
  jsonBody,
} from '../../setup/test-helpers';

beforeEach(async () => {
  await truncateAll();
  await flushTestRedis();
});

describe('GET /api/projects/:projectId/status', () => {
  it('returns 200 with activeFeatures, claims, and sessions', async () => {
    const { engineer, apiKey } = await seedEngineer({ name: 'Status User' });
    const project = await seedProject(engineer.id);
    await seedFeature(project.id, engineer.id, {
      slug: 'status-feat',
      touches: ['src/status.ts'],
    });

    // Transition draft -> ready -> active
    await postJson(`/api/projects/${project.id}/features/status-feat/ready`, apiKey, {});
    await postJson(`/api/projects/${project.id}/features/status-feat/pick`, apiKey, {});

    // Create a session
    await postJson(`/api/projects/${project.id}/sessions`, apiKey, {});

    const res = await authRequest(`/api/projects/${project.id}/status`, apiKey);
    expect(res.status).toBe(200);

    const body = await jsonBody<{
      data: {
        activeFeatures: any[];
        claims: any[];
        sessions: any[];
      };
    }>(res);

    expect(body.data.activeFeatures.length).toBe(1);
    expect(body.data.activeFeatures[0].slug).toBe('status-feat');
    expect(body.data.activeFeatures[0].status).toBe('active');

    expect(body.data.claims.length).toBe(1);
    expect(body.data.claims[0].filePath).toBe('src/status.ts');

    expect(body.data.sessions.length).toBe(1);
    expect(body.data.sessions[0].engineer.name).toBe('Status User');
  });

  it('returns empty arrays for empty project', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);

    const res = await authRequest(`/api/projects/${project.id}/status`, apiKey);
    expect(res.status).toBe(200);

    const body = await jsonBody<{
      data: {
        activeFeatures: any[];
        claims: any[];
        sessions: any[];
      };
    }>(res);

    expect(body.data.activeFeatures).toEqual([]);
    expect(body.data.claims).toEqual([]);
    expect(body.data.sessions).toEqual([]);
  });

  it('returns 401 without auth', async () => {
    const { engineer } = await seedEngineer();
    const project = await seedProject(engineer.id);

    const res = await request(`/api/projects/${project.id}/status`);
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-member', async () => {
    const { engineer: owner } = await seedEngineer();
    const { apiKey: otherKey } = await seedEngineer();
    const project = await seedProject(owner.id);

    const res = await authRequest(`/api/projects/${project.id}/status`, otherKey);
    expect(res.status).toBe(403);
  });
});
