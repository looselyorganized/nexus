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
  patchJson,
  deleteRequest,
  jsonBody,
} from '../../setup/test-helpers';

beforeEach(async () => {
  await truncateAll();
  await flushTestRedis();
});

describe('POST /api/projects/:projectId/features', () => {
  it('returns 201 and creates feature with draft status', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);

    const res = await postJson(`/api/projects/${project.id}/features`, apiKey, {
      slug: 'my-feature',
      title: 'My Feature',
      spec: 'Feature spec content',
    });

    expect(res.status).toBe(201);
    const body = await jsonBody<{ data: any }>(res);
    expect(body.data.slug).toBe('my-feature');
    expect(body.data.title).toBe('My Feature');
    expect(body.data.status).toBe('draft');
    expect(body.data.lane).toBe('next');
    expect(body.data.projectId).toBe(project.id);
  });

  it('returns 400 for invalid slug format', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);

    const res = await postJson(`/api/projects/${project.id}/features`, apiKey, {
      slug: 'INVALID SLUG!',
      title: 'Bad Slug',
      spec: 'spec',
    });

    expect(res.status).toBe(400);
  });

  it('returns 409 for duplicate slug in same project', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);
    const slug = `dup-feat-${Date.now()}`;

    await postJson(`/api/projects/${project.id}/features`, apiKey, {
      slug,
      title: 'First',
      spec: 'spec',
    });

    const res = await postJson(`/api/projects/${project.id}/features`, apiKey, {
      slug,
      title: 'Second',
      spec: 'spec',
    });

    expect(res.status).toBe(409);
  });

  it('creates feature with specified lane and touches', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);

    const res = await postJson(`/api/projects/${project.id}/features`, apiKey, {
      slug: 'lane-feat',
      title: 'Lane Feature',
      spec: 'spec',
      lane: 'now',
      touches: ['src/index.ts', 'src/app.ts'],
    });

    expect(res.status).toBe(201);
    const body = await jsonBody<{ data: any }>(res);
    expect(body.data.lane).toBe('now');
    expect(body.data.touches).toEqual(['src/index.ts', 'src/app.ts']);
  });

  it('returns 401 without auth', async () => {
    const { engineer } = await seedEngineer();
    const project = await seedProject(engineer.id);

    const res = await request(`/api/projects/${project.id}/features`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'no-auth', title: 'No Auth', spec: 'spec' }),
    });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/projects/:projectId/features', () => {
  it('returns 200 with paginated features', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);
    await seedFeature(project.id, engineer.id, { slug: 'feat-a', title: 'Feature A' });
    await seedFeature(project.id, engineer.id, { slug: 'feat-b', title: 'Feature B' });

    const res = await authRequest(`/api/projects/${project.id}/features`, apiKey);
    expect(res.status).toBe(200);

    const body = await jsonBody<{ data: { items: any[]; hasMore: boolean; nextCursor: string | null } }>(res);
    expect(body.data.items.length).toBe(2);
    expect(body.data.hasMore).toBe(false);
  });

  it('supports limit parameter', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);
    await seedFeature(project.id, engineer.id, { slug: 'feat-1' });
    await seedFeature(project.id, engineer.id, { slug: 'feat-2' });
    await seedFeature(project.id, engineer.id, { slug: 'feat-3' });

    const res = await authRequest(`/api/projects/${project.id}/features?limit=2`, apiKey);
    expect(res.status).toBe(200);

    const body = await jsonBody<{ data: { items: any[]; hasMore: boolean; nextCursor: string | null } }>(res);
    expect(body.data.items.length).toBe(2);
    expect(body.data.hasMore).toBe(true);
    expect(body.data.nextCursor).toBeDefined();
  });

  it('filters by status', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);
    await seedFeature(project.id, engineer.id, { slug: 'draft-feat' });

    const res = await authRequest(`/api/projects/${project.id}/features?status=ready`, apiKey);
    expect(res.status).toBe(200);

    const body = await jsonBody<{ data: { items: any[] } }>(res);
    expect(body.data.items.length).toBe(0);
  });
});

describe('GET /api/projects/:projectId/features/:slug', () => {
  it('returns 200 with feature data', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);
    const feature = await seedFeature(project.id, engineer.id, { slug: 'get-feat' });

    const res = await authRequest(`/api/projects/${project.id}/features/get-feat`, apiKey);
    expect(res.status).toBe(200);

    const body = await jsonBody<{ data: any }>(res);
    expect(body.data.slug).toBe('get-feat');
    expect(body.data.id).toBe(feature.id);
  });

  it('returns 404 for unknown slug', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);

    const res = await authRequest(`/api/projects/${project.id}/features/nonexistent`, apiKey);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/projects/:projectId/features/:slug', () => {
  it('updates title', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);
    await seedFeature(project.id, engineer.id, { slug: 'patch-feat', title: 'Old Title' });

    const res = await patchJson(`/api/projects/${project.id}/features/patch-feat`, apiKey, {
      title: 'New Title',
    });

    expect(res.status).toBe(200);
    const body = await jsonBody<{ data: any }>(res);
    expect(body.data.title).toBe('New Title');
  });

  it('updates lane and priority', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);
    await seedFeature(project.id, engineer.id, { slug: 'lane-update', lane: 'next' });

    const res = await patchJson(`/api/projects/${project.id}/features/lane-update`, apiKey, {
      lane: 'now',
      priority: 1,
    });

    expect(res.status).toBe(200);
    const body = await jsonBody<{ data: any }>(res);
    expect(body.data.lane).toBe('now');
    expect(body.data.priority).toBe(1);
  });
});

describe('DELETE /api/projects/:projectId/features/:slug', () => {
  it('deletes a draft feature', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);
    await seedFeature(project.id, engineer.id, { slug: 'to-delete' });

    const res = await deleteRequest(`/api/projects/${project.id}/features/to-delete`, apiKey);
    expect(res.status).toBe(200);

    const body = await jsonBody<{ data: { deleted: boolean } }>(res);
    expect(body.data.deleted).toBe(true);

    // Verify it is gone
    const getRes = await authRequest(`/api/projects/${project.id}/features/to-delete`, apiKey);
    expect(getRes.status).toBe(404);
  });

  it('returns 400 when deleting non-draft feature', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);
    await seedFeature(project.id, engineer.id, { slug: 'ready-feat' });

    // Transition to ready
    await postJson(`/api/projects/${project.id}/features/ready-feat/ready`, apiKey, {});

    const res = await deleteRequest(`/api/projects/${project.id}/features/ready-feat`, apiKey);
    expect(res.status).toBe(400);
  });
});

describe('Feature lifecycle transitions', () => {
  it('POST /:slug/ready transitions draft to ready', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);
    await seedFeature(project.id, engineer.id, { slug: 'lifecycle-feat' });

    const res = await postJson(`/api/projects/${project.id}/features/lifecycle-feat/ready`, apiKey, {});
    expect(res.status).toBe(200);

    const body = await jsonBody<{ data: any }>(res);
    expect(body.data.status).toBe('ready');
  });

  it('POST /:slug/pick transitions ready to active', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);
    await seedFeature(project.id, engineer.id, { slug: 'pick-feat' });

    // draft -> ready
    await postJson(`/api/projects/${project.id}/features/pick-feat/ready`, apiKey, {});
    // ready -> active
    const res = await postJson(`/api/projects/${project.id}/features/pick-feat/pick`, apiKey, {});
    expect(res.status).toBe(200);

    const body = await jsonBody<{ data: any }>(res);
    expect(body.data.status).toBe('active');
    expect(body.data.claimedBy).toBe(engineer.id);
  });

  it('POST /:slug/release transitions active to ready', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);
    await seedFeature(project.id, engineer.id, { slug: 'release-feat' });

    await postJson(`/api/projects/${project.id}/features/release-feat/ready`, apiKey, {});
    await postJson(`/api/projects/${project.id}/features/release-feat/pick`, apiKey, {});

    const res = await postJson(`/api/projects/${project.id}/features/release-feat/release`, apiKey, {});
    expect(res.status).toBe(200);

    const body = await jsonBody<{ data: any }>(res);
    expect(body.data.status).toBe('ready');
    expect(body.data.claimedBy).toBeNull();
  });

  it('POST /:slug/done transitions active to done', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);
    await seedFeature(project.id, engineer.id, { slug: 'done-feat' });

    await postJson(`/api/projects/${project.id}/features/done-feat/ready`, apiKey, {});
    await postJson(`/api/projects/${project.id}/features/done-feat/pick`, apiKey, {});

    const res = await postJson(`/api/projects/${project.id}/features/done-feat/done`, apiKey, {});
    expect(res.status).toBe(200);

    const body = await jsonBody<{ data: any }>(res);
    expect(body.data.status).toBe('done');
    expect(body.data.completedAt).toBeDefined();
  });

  it('POST /:slug/cancel transitions active to cancelled', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);
    await seedFeature(project.id, engineer.id, { slug: 'cancel-feat' });

    await postJson(`/api/projects/${project.id}/features/cancel-feat/ready`, apiKey, {});
    await postJson(`/api/projects/${project.id}/features/cancel-feat/pick`, apiKey, {});

    const res = await postJson(`/api/projects/${project.id}/features/cancel-feat/cancel`, apiKey, {});
    expect(res.status).toBe(200);

    const body = await jsonBody<{ data: any }>(res);
    expect(body.data.status).toBe('cancelled');
  });

  it('returns 400 for invalid transition (draft -> done)', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);
    await seedFeature(project.id, engineer.id, { slug: 'bad-transition' });

    const res = await postJson(`/api/projects/${project.id}/features/bad-transition/done`, apiKey, {});
    expect(res.status).toBe(400);
  });
});

describe('GET /api/projects/:projectId/features/available', () => {
  it('returns ready features', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);
    await seedFeature(project.id, engineer.id, { slug: 'avail-feat' });

    // Transition to ready
    await postJson(`/api/projects/${project.id}/features/avail-feat/ready`, apiKey, {});

    const res = await authRequest(`/api/projects/${project.id}/features/available`, apiKey);
    expect(res.status).toBe(200);

    const body = await jsonBody<{ data: any[] }>(res);
    expect(body.data.length).toBe(1);
    expect(body.data[0].slug).toBe('avail-feat');
    expect(body.data[0].status).toBe('ready');
  });

  it('returns empty array when no ready features', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);
    // Draft feature only, not ready
    await seedFeature(project.id, engineer.id, { slug: 'draft-only' });

    const res = await authRequest(`/api/projects/${project.id}/features/available`, apiKey);
    expect(res.status).toBe(200);

    const body = await jsonBody<{ data: any[] }>(res);
    expect(body.data.length).toBe(0);
  });
});
