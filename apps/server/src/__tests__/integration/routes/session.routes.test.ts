import { describe, it, expect, beforeEach } from 'bun:test';
import {
  truncateAll,
  flushTestRedis,
  seedEngineer,
  seedProject,
  seedFeature,
  seedSession,
  authRequest,
  postJson,
  jsonBody,
} from '../../setup/test-helpers';

beforeEach(async () => {
  await truncateAll();
  await flushTestRedis();
});

describe('POST /api/projects/:projectId/sessions', () => {
  it('returns 201 and creates session', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);

    const res = await postJson(`/api/projects/${project.id}/sessions`, apiKey, {});
    expect(res.status).toBe(201);

    const body = await jsonBody<{ data: any }>(res);
    expect(body.data.projectId).toBe(project.id);
    expect(body.data.engineerId).toBe(engineer.id);
    expect(body.data.status).toBe('active');
    expect(body.data.id).toBeDefined();
  });

  it('creates session with metadata', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);

    const res = await postJson(`/api/projects/${project.id}/sessions`, apiKey, {
      metadata: {
        gitBranch: 'feature/test',
        workingDir: '/home/user/project',
        clientVersion: '1.0.0',
      },
    });

    expect(res.status).toBe(201);
    const body = await jsonBody<{ data: any }>(res);
    expect(body.data.metadata).toBeDefined();
  });

  it('reuses existing active session for same engineer and project', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);

    const res1 = await postJson(`/api/projects/${project.id}/sessions`, apiKey, {});
    const body1 = await jsonBody<{ data: any }>(res1);
    const sessionId1 = body1.data.id;

    const res2 = await postJson(`/api/projects/${project.id}/sessions`, apiKey, {});
    const body2 = await jsonBody<{ data: any }>(res2);
    const sessionId2 = body2.data.id;

    expect(sessionId1).toBe(sessionId2);
  });

  it('creates session with featureId', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);
    const feature = await seedFeature(project.id, engineer.id, { slug: 'session-feat' });

    const res = await postJson(`/api/projects/${project.id}/sessions`, apiKey, {
      featureId: feature.id,
    });

    expect(res.status).toBe(201);
    const body = await jsonBody<{ data: any }>(res);
    expect(body.data.featureId).toBe(feature.id);
  });
});

describe('GET /api/projects/:projectId/sessions/active', () => {
  it('returns active sessions with engineer info', async () => {
    const { engineer, apiKey } = await seedEngineer({ name: 'Active User' });
    const project = await seedProject(engineer.id);

    await postJson(`/api/projects/${project.id}/sessions`, apiKey, {});

    const res = await authRequest(`/api/projects/${project.id}/sessions/active`, apiKey);
    expect(res.status).toBe(200);

    const body = await jsonBody<{ data: any[] }>(res);
    expect(body.data.length).toBe(1);
    expect(body.data[0].engineer.name).toBe('Active User');
    expect(body.data[0].engineer.id).toBe(engineer.id);
    expect(body.data[0].session.status).toBe('active');
  });

  it('returns empty when no active sessions', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);

    const res = await authRequest(`/api/projects/${project.id}/sessions/active`, apiKey);
    expect(res.status).toBe(200);

    const body = await jsonBody<{ data: any[] }>(res);
    expect(body.data.length).toBe(0);
  });
});

describe('POST /api/projects/:projectId/sessions/:sessionId/heartbeat', () => {
  it('returns 200 ok', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);

    const sessionRes = await postJson(`/api/projects/${project.id}/sessions`, apiKey, {});
    const sessionBody = await jsonBody<{ data: any }>(sessionRes);

    const res = await postJson(
      `/api/projects/${project.id}/sessions/${sessionBody.data.id}/heartbeat`,
      apiKey,
      {}
    );

    expect(res.status).toBe(200);
    const body = await jsonBody<{ data: { ok: boolean } }>(res);
    expect(body.data.ok).toBe(true);
  });
});

describe('POST /api/projects/:projectId/sessions/checkpoints', () => {
  it('returns 201 and creates checkpoint', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);
    const feature = await seedFeature(project.id, engineer.id, { slug: 'checkpoint-feat' });

    const sessionRes = await postJson(`/api/projects/${project.id}/sessions`, apiKey, {});
    const sessionBody = await jsonBody<{ data: any }>(sessionRes);

    const res = await postJson(`/api/projects/${project.id}/sessions/checkpoints`, apiKey, {
      sessionId: sessionBody.data.id,
      featureId: feature.id,
      context: { currentFile: 'src/index.ts', progress: 50 },
      type: 'manual',
    });

    expect(res.status).toBe(201);
    const body = await jsonBody<{ data: any }>(res);
    expect(body.data.featureId).toBe(feature.id);
    expect(body.data.sessionId).toBe(sessionBody.data.id);
    expect(body.data.engineerId).toBe(engineer.id);
    expect(body.data.type).toBe('manual');
    expect(body.data.isLatest).toBe(true);
    expect(body.data.id).toBeDefined();
  });

  it('deduplicates auto_periodic checkpoints with same content', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);
    const feature = await seedFeature(project.id, engineer.id, { slug: 'dedup-feat' });

    const sessionRes = await postJson(`/api/projects/${project.id}/sessions`, apiKey, {});
    const sessionBody = await jsonBody<{ data: any }>(sessionRes);

    const checkpointBody = {
      sessionId: sessionBody.data.id,
      featureId: feature.id,
      context: { file: 'index.ts' },
      type: 'auto_periodic' as const,
    };

    // First checkpoint
    const res1 = await postJson(`/api/projects/${project.id}/sessions/checkpoints`, apiKey, checkpointBody);
    expect(res1.status).toBe(201);

    // Duplicate checkpoint (same context)
    const res2 = await postJson(`/api/projects/${project.id}/sessions/checkpoints`, apiKey, checkpointBody);
    expect(res2.status).toBe(200);

    const body2 = await jsonBody<{ data: any; message?: string }>(res2);
    expect(body2.data).toBeNull();
    expect(body2.message).toBe('Duplicate checkpoint skipped');
  });
});

describe('GET /api/projects/:projectId/sessions/checkpoints/latest', () => {
  it('returns latest checkpoint', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);
    const feature = await seedFeature(project.id, engineer.id, { slug: 'latest-feat' });

    const sessionRes = await postJson(`/api/projects/${project.id}/sessions`, apiKey, {});
    const sessionBody = await jsonBody<{ data: any }>(sessionRes);

    await postJson(`/api/projects/${project.id}/sessions/checkpoints`, apiKey, {
      sessionId: sessionBody.data.id,
      featureId: feature.id,
      context: { step: 1 },
    });

    await postJson(`/api/projects/${project.id}/sessions/checkpoints`, apiKey, {
      sessionId: sessionBody.data.id,
      featureId: feature.id,
      context: { step: 2 },
    });

    const res = await authRequest(
      `/api/projects/${project.id}/sessions/checkpoints/latest?featureId=${feature.id}`,
      apiKey
    );
    expect(res.status).toBe(200);

    const body = await jsonBody<{ data: any }>(res);
    expect(body.data).toBeDefined();
    expect(body.data.isLatest).toBe(true);
    expect(body.data.context.step).toBe(2);
  });

  it('returns 400 without featureId query param', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);

    const res = await authRequest(
      `/api/projects/${project.id}/sessions/checkpoints/latest`,
      apiKey
    );

    expect(res.status).toBe(400);
    const body = await jsonBody<{ error: { code: string; message: string } }>(res);
    expect(body.error.message).toContain('featureId');
  });

  it('returns null data when no checkpoint exists', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);
    const fakeFeatureId = '00000000-0000-0000-0000-000000000000';

    const res = await authRequest(
      `/api/projects/${project.id}/sessions/checkpoints/latest?featureId=${fakeFeatureId}`,
      apiKey
    );

    expect(res.status).toBe(200);
    const body = await jsonBody<{ data: any }>(res);
    expect(body.data).toBeNull();
  });
});
