import { describe, it, expect, beforeEach } from 'bun:test';
import {
  truncateAll,
  flushTestRedis,
  seedEngineer,
  seedProject,
  seedFeature,
  authRequest,
  postJson,
  jsonBody,
} from '../../setup/test-helpers';

beforeEach(async () => {
  await truncateAll();
  await flushTestRedis();
});

describe('GET /api/projects/:projectId/claims', () => {
  it('returns 200 with empty claims when no features are claimed', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);

    const res = await authRequest(`/api/projects/${project.id}/claims`, apiKey);
    expect(res.status).toBe(200);

    const body = await jsonBody<{ data: any[] }>(res);
    expect(body.data).toEqual([]);
  });

  it('returns claims after picking a feature with touches', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);
    await seedFeature(project.id, engineer.id, {
      slug: 'claimed-feat',
      touches: ['src/index.ts', 'src/app.ts'],
    });

    // Transition draft -> ready -> active (pick)
    await postJson(`/api/projects/${project.id}/features/claimed-feat/ready`, apiKey, {});
    await postJson(`/api/projects/${project.id}/features/claimed-feat/pick`, apiKey, {});

    const res = await authRequest(`/api/projects/${project.id}/claims`, apiKey);
    expect(res.status).toBe(200);

    const body = await jsonBody<{ data: any[] }>(res);
    expect(body.data.length).toBe(2);

    const filePaths = body.data.map((c: any) => c.filePath).sort();
    expect(filePaths).toEqual(['src/app.ts', 'src/index.ts']);
  });
});

describe('GET /api/projects/:projectId/claims/mine', () => {
  it('returns 200 with the engineers own claims', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);
    await seedFeature(project.id, engineer.id, {
      slug: 'my-claim-feat',
      touches: ['src/mine.ts'],
    });

    await postJson(`/api/projects/${project.id}/features/my-claim-feat/ready`, apiKey, {});
    await postJson(`/api/projects/${project.id}/features/my-claim-feat/pick`, apiKey, {});

    const res = await authRequest(`/api/projects/${project.id}/claims/mine`, apiKey);
    expect(res.status).toBe(200);

    const body = await jsonBody<{ data: any[] }>(res);
    expect(body.data.length).toBe(1);
    expect(body.data[0].filePath).toBe('src/mine.ts');
    expect(body.data[0].engineerId).toBe(engineer.id);
  });

  it('returns empty when engineer has no claims', async () => {
    const { engineer: lead, apiKey: leadKey } = await seedEngineer();
    const { apiKey: otherKey, engineer: other } = await seedEngineer();
    const project = await seedProject(lead.id);

    // Add other as member
    await postJson(`/api/projects/${project.id}/members`, leadKey, {
      engineerId: other.id,
      role: 'member',
    });

    const res = await authRequest(`/api/projects/${project.id}/claims/mine`, otherKey);
    expect(res.status).toBe(200);

    const body = await jsonBody<{ data: any[] }>(res);
    expect(body.data).toEqual([]);
  });
});

describe('POST /api/projects/:projectId/claims/refresh', () => {
  it('returns 200 and refreshes claims', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);
    await seedFeature(project.id, engineer.id, {
      slug: 'refresh-feat',
      touches: ['src/refresh.ts'],
    });

    await postJson(`/api/projects/${project.id}/features/refresh-feat/ready`, apiKey, {});
    await postJson(`/api/projects/${project.id}/features/refresh-feat/pick`, apiKey, {});

    const res = await postJson(`/api/projects/${project.id}/claims/refresh`, apiKey, {});
    expect(res.status).toBe(200);

    const body = await jsonBody<{ data: { refreshed: string[]; notOwned: string[] } }>(res);
    expect(body.data.refreshed).toContain('src/refresh.ts');
    expect(body.data.notOwned).toEqual([]);
  });

  it('returns empty result when no claims exist', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);

    const res = await postJson(`/api/projects/${project.id}/claims/refresh`, apiKey, {});
    expect(res.status).toBe(200);

    const body = await jsonBody<{ data: { refreshed: any[]; notOwned: any[] } }>(res);
    expect(body.data.refreshed).toEqual([]);
    expect(body.data.notOwned).toEqual([]);
  });
});
