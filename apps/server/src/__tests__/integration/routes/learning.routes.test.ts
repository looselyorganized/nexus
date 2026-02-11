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

describe('POST /api/projects/:projectId/features/:slug/learnings', () => {
  it('returns 201 and creates learning', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);
    const feature = await seedFeature(project.id, engineer.id, { slug: 'learn-feat' });

    const res = await postJson(
      `/api/projects/${project.id}/features/learn-feat/learnings`,
      apiKey,
      { content: 'Learned something important about caching' }
    );

    expect(res.status).toBe(201);
    const body = await jsonBody<{ data: any }>(res);
    expect(body.data.content).toBe('Learned something important about caching');
    expect(body.data.featureId).toBe(feature.id);
    expect(body.data.engineerId).toBe(engineer.id);
    expect(body.data.id).toBeDefined();
  });

  it('returns 404 for invalid feature slug', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);

    const res = await postJson(
      `/api/projects/${project.id}/features/nonexistent-feat/learnings`,
      apiKey,
      { content: 'This should fail' }
    );

    expect(res.status).toBe(404);
  });

  it('returns 400 for missing content', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);
    await seedFeature(project.id, engineer.id, { slug: 'learn-no-content' });

    const res = await postJson(
      `/api/projects/${project.id}/features/learn-no-content/learnings`,
      apiKey,
      {}
    );

    expect(res.status).toBe(400);
  });

  it('returns 400 for empty content string', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);
    await seedFeature(project.id, engineer.id, { slug: 'learn-empty' });

    const res = await postJson(
      `/api/projects/${project.id}/features/learn-empty/learnings`,
      apiKey,
      { content: '' }
    );

    expect(res.status).toBe(400);
  });
});

describe('GET /api/projects/:projectId/features/:slug/learnings', () => {
  it('returns 200 with learnings list', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);
    await seedFeature(project.id, engineer.id, { slug: 'list-learn' });

    await postJson(
      `/api/projects/${project.id}/features/list-learn/learnings`,
      apiKey,
      { content: 'Learning 1' }
    );
    await postJson(
      `/api/projects/${project.id}/features/list-learn/learnings`,
      apiKey,
      { content: 'Learning 2' }
    );

    const res = await authRequest(
      `/api/projects/${project.id}/features/list-learn/learnings`,
      apiKey
    );
    expect(res.status).toBe(200);

    const body = await jsonBody<{ data: { items: any[]; hasMore: boolean } }>(res);
    expect(body.data.items.length).toBe(2);
    expect(body.data.hasMore).toBe(false);
  });

  it('supports pagination with limit', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);
    await seedFeature(project.id, engineer.id, { slug: 'paginate-learn' });

    for (let i = 0; i < 3; i++) {
      await postJson(
        `/api/projects/${project.id}/features/paginate-learn/learnings`,
        apiKey,
        { content: `Learning ${i}` }
      );
    }

    const res = await authRequest(
      `/api/projects/${project.id}/features/paginate-learn/learnings?limit=2`,
      apiKey
    );
    expect(res.status).toBe(200);

    const body = await jsonBody<{ data: { items: any[]; hasMore: boolean; nextCursor: string | null } }>(res);
    expect(body.data.items.length).toBe(2);
    expect(body.data.hasMore).toBe(true);
    expect(body.data.nextCursor).toBeDefined();
  });
});
