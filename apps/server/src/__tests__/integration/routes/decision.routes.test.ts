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

describe('POST /api/projects/:projectId/decisions', () => {
  it('returns 201 and creates decision', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);

    const res = await postJson(`/api/projects/${project.id}/decisions`, apiKey, {
      title: 'Use PostgreSQL',
      decision: 'We will use PostgreSQL for the primary database',
      rationale: 'Best fit for relational data',
      alternatives: 'MongoDB, DynamoDB',
    });

    expect(res.status).toBe(201);
    const body = await jsonBody<{ data: any }>(res);
    expect(body.data.title).toBe('Use PostgreSQL');
    expect(body.data.decision).toBe('We will use PostgreSQL for the primary database');
    expect(body.data.rationale).toBe('Best fit for relational data');
    expect(body.data.alternatives).toBe('MongoDB, DynamoDB');
    expect(body.data.projectId).toBe(project.id);
    expect(body.data.engineerId).toBe(engineer.id);
    expect(body.data.id).toBeDefined();
  });

  it('returns 201 with feature slug link', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);
    const feature = await seedFeature(project.id, engineer.id, { slug: 'linked-feat' });

    const res = await postJson(`/api/projects/${project.id}/decisions`, apiKey, {
      title: 'Feature Decision',
      decision: 'Use approach A for this feature',
      featureSlug: 'linked-feat',
    });

    expect(res.status).toBe(201);
    const body = await jsonBody<{ data: any }>(res);
    expect(body.data.featureId).toBe(feature.id);
  });

  it('returns 404 for invalid feature slug', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);

    const res = await postJson(`/api/projects/${project.id}/decisions`, apiKey, {
      title: 'Bad Slug Decision',
      decision: 'This should fail',
      featureSlug: 'nonexistent-feat',
    });

    expect(res.status).toBe(404);
  });

  it('returns 400 for missing title', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);

    const res = await postJson(`/api/projects/${project.id}/decisions`, apiKey, {
      decision: 'Missing title field',
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 for missing decision field', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);

    const res = await postJson(`/api/projects/${project.id}/decisions`, apiKey, {
      title: 'Missing decision field',
    });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/projects/:projectId/decisions', () => {
  it('returns 200 with decisions list', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);

    await postJson(`/api/projects/${project.id}/decisions`, apiKey, {
      title: 'Decision 1',
      decision: 'First decision',
    });
    await postJson(`/api/projects/${project.id}/decisions`, apiKey, {
      title: 'Decision 2',
      decision: 'Second decision',
    });

    const res = await authRequest(`/api/projects/${project.id}/decisions`, apiKey);
    expect(res.status).toBe(200);

    const body = await jsonBody<{ data: { items: any[]; hasMore: boolean } }>(res);
    expect(body.data.items.length).toBe(2);
    expect(body.data.hasMore).toBe(false);
  });

  it('filters by feature query param', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);
    const feature = await seedFeature(project.id, engineer.id, { slug: 'filter-feat' });

    await postJson(`/api/projects/${project.id}/decisions`, apiKey, {
      title: 'Linked Decision',
      decision: 'Linked to feature',
      featureSlug: 'filter-feat',
    });
    await postJson(`/api/projects/${project.id}/decisions`, apiKey, {
      title: 'Unlinked Decision',
      decision: 'Not linked to any feature',
    });

    const res = await authRequest(
      `/api/projects/${project.id}/decisions?feature=filter-feat`,
      apiKey
    );
    expect(res.status).toBe(200);

    const body = await jsonBody<{ data: { items: any[] } }>(res);
    expect(body.data.items.length).toBe(1);
    expect(body.data.items[0].title).toBe('Linked Decision');
  });

  it('supports pagination with limit', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);

    for (let i = 0; i < 3; i++) {
      await postJson(`/api/projects/${project.id}/decisions`, apiKey, {
        title: `Decision ${i}`,
        decision: `Decision content ${i}`,
      });
    }

    const res = await authRequest(
      `/api/projects/${project.id}/decisions?limit=2`,
      apiKey
    );
    expect(res.status).toBe(200);

    const body = await jsonBody<{ data: { items: any[]; hasMore: boolean; nextCursor: string | null } }>(res);
    expect(body.data.items.length).toBe(2);
    expect(body.data.hasMore).toBe(true);
    expect(body.data.nextCursor).toBeDefined();
  });
});
