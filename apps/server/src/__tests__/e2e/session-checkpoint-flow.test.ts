import { describe, it, expect, beforeEach } from 'bun:test';
import {
  truncateAll,
  flushTestRedis,
  seedEngineer,
  seedProject,
  seedFeature,
  postJson,
  authRequest,
  jsonBody,
} from '../setup/test-helpers';

beforeEach(async () => {
  await truncateAll();
  await flushTestRedis();
});

describe('Session + Checkpoint flow E2E', () => {
  it('full flow: create session, heartbeat, manual checkpoint, get latest', async () => {
    const { engineer, apiKey } = await seedEngineer({ name: 'SessionEngineer' });
    const project = await seedProject(engineer.id);
    const feature = await seedFeature(project.id, engineer.id, {
      slug: 'feat-session',
      title: 'Session Feature',
      spec: 'For session testing',
    });

    // Step 1: Create session
    const sessionRes = await postJson(
      `/api/projects/${project.id}/sessions`,
      apiKey,
      { featureId: feature.id, metadata: { gitBranch: 'main' } }
    );
    expect(sessionRes.status).toBe(201);
    const session = await jsonBody<{ data: any }>(sessionRes);
    expect(session.data.id).toBeTruthy();
    expect(session.data.projectId).toBe(project.id);
    expect(session.data.engineerId).toBe(engineer.id);
    expect(session.data.status).toBe('active');
    const sessionId = session.data.id;

    // Step 2: Heartbeat
    const heartbeatRes = await postJson(
      `/api/projects/${project.id}/sessions/${sessionId}/heartbeat`,
      apiKey,
      {}
    );
    expect(heartbeatRes.status).toBe(200);
    const hbBody = await jsonBody<{ data: any }>(heartbeatRes);
    expect(hbBody.data.ok).toBe(true);

    // Step 3: Manual checkpoint
    const checkpointRes = await postJson(
      `/api/projects/${project.id}/sessions/checkpoints`,
      apiKey,
      {
        sessionId,
        featureId: feature.id,
        context: { currentFile: 'src/main.ts', progress: 50 },
        type: 'manual',
        notes: 'halfway done',
      }
    );
    expect(checkpointRes.status).toBe(201);
    const checkpoint = await jsonBody<{ data: any }>(checkpointRes);
    expect(checkpoint.data.id).toBeTruthy();
    expect(checkpoint.data.type).toBe('manual');
    expect(checkpoint.data.isLatest).toBe(true);
    expect(checkpoint.data.notes).toBe('halfway done');
    expect(checkpoint.data.context.currentFile).toBe('src/main.ts');

    // Step 4: Get latest checkpoint
    const latestRes = await authRequest(
      `/api/projects/${project.id}/sessions/checkpoints/latest?featureId=${feature.id}`,
      apiKey
    );
    expect(latestRes.status).toBe(200);
    const latest = await jsonBody<{ data: any }>(latestRes);
    expect(latest.data.id).toBe(checkpoint.data.id);
    expect(latest.data.isLatest).toBe(true);
  });

  it('heartbeat returns ok', async () => {
    const { engineer, apiKey } = await seedEngineer({ name: 'HbEngineer' });
    const project = await seedProject(engineer.id);

    // Create session
    const sessionRes = await postJson(
      `/api/projects/${project.id}/sessions`,
      apiKey,
      {}
    );
    const session = await jsonBody<{ data: any }>(sessionRes);
    const sessionId = session.data.id;

    // Multiple heartbeats
    for (let i = 0; i < 3; i++) {
      const res = await postJson(
        `/api/projects/${project.id}/sessions/${sessionId}/heartbeat`,
        apiKey,
        {}
      );
      expect(res.status).toBe(200);
    }
  });

  it('auto_periodic dedup: same state returns null, different state creates new checkpoint', async () => {
    const { engineer, apiKey } = await seedEngineer({ name: 'DedupEngineer' });
    const project = await seedProject(engineer.id);
    const feature = await seedFeature(project.id, engineer.id, {
      slug: 'feat-dedup',
      title: 'Dedup Feature',
      spec: 'For dedup testing',
    });

    // Create session
    const sessionRes = await postJson(
      `/api/projects/${project.id}/sessions`,
      apiKey,
      { featureId: feature.id }
    );
    const session = await jsonBody<{ data: any }>(sessionRes);
    const sessionId = session.data.id;

    const context1 = { file: 'a.ts', line: 10 };

    // First auto_periodic checkpoint
    const cp1Res = await postJson(
      `/api/projects/${project.id}/sessions/checkpoints`,
      apiKey,
      { sessionId, featureId: feature.id, context: context1, type: 'auto_periodic' }
    );
    expect(cp1Res.status).toBe(201);
    const cp1 = await jsonBody<{ data: any }>(cp1Res);
    expect(cp1.data).not.toBeNull();

    // Second auto_periodic with SAME context -> should be deduped (null data)
    const cp2Res = await postJson(
      `/api/projects/${project.id}/sessions/checkpoints`,
      apiKey,
      { sessionId, featureId: feature.id, context: context1, type: 'auto_periodic' }
    );
    expect(cp2Res.status).toBe(200);
    const cp2 = await jsonBody<{ data: any; message?: string }>(cp2Res);
    expect(cp2.data).toBeNull();
    expect(cp2.message).toContain('Duplicate');

    // Third auto_periodic with DIFFERENT context -> should create new
    const context2 = { file: 'b.ts', line: 42 };
    const cp3Res = await postJson(
      `/api/projects/${project.id}/sessions/checkpoints`,
      apiKey,
      { sessionId, featureId: feature.id, context: context2, type: 'auto_periodic' }
    );
    expect(cp3Res.status).toBe(201);
    const cp3 = await jsonBody<{ data: any }>(cp3Res);
    expect(cp3.data).not.toBeNull();
    expect(cp3.data.id).not.toBe(cp1.data.id);
  });

  it('latest checkpoint is updated after creating a new one', async () => {
    const { engineer, apiKey } = await seedEngineer({ name: 'LatestEngineer' });
    const project = await seedProject(engineer.id);
    const feature = await seedFeature(project.id, engineer.id, {
      slug: 'feat-latest',
      title: 'Latest Feature',
      spec: 'For latest testing',
    });

    // Create session
    const sessionRes = await postJson(
      `/api/projects/${project.id}/sessions`,
      apiKey,
      { featureId: feature.id }
    );
    const session = await jsonBody<{ data: any }>(sessionRes);
    const sessionId = session.data.id;

    // Checkpoint 1
    const cp1Res = await postJson(
      `/api/projects/${project.id}/sessions/checkpoints`,
      apiKey,
      { sessionId, featureId: feature.id, context: { step: 1 }, type: 'manual' }
    );
    const cp1 = await jsonBody<{ data: any }>(cp1Res);
    expect(cp1.data.isLatest).toBe(true);

    // Checkpoint 2
    const cp2Res = await postJson(
      `/api/projects/${project.id}/sessions/checkpoints`,
      apiKey,
      { sessionId, featureId: feature.id, context: { step: 2 }, type: 'manual' }
    );
    const cp2 = await jsonBody<{ data: any }>(cp2Res);
    expect(cp2.data.isLatest).toBe(true);
    expect(cp2.data.id).not.toBe(cp1.data.id);

    // Verify latest returns checkpoint 2
    const latestRes = await authRequest(
      `/api/projects/${project.id}/sessions/checkpoints/latest?featureId=${feature.id}`,
      apiKey
    );
    const latest = await jsonBody<{ data: any }>(latestRes);
    expect(latest.data.id).toBe(cp2.data.id);
  });

  it('existing active session is returned instead of creating a new one', async () => {
    const { engineer, apiKey } = await seedEngineer({ name: 'DupeSession' });
    const project = await seedProject(engineer.id);

    // Create session
    const res1 = await postJson(`/api/projects/${project.id}/sessions`, apiKey, {});
    const s1 = await jsonBody<{ data: any }>(res1);

    // Creating again should return the existing one
    const res2 = await postJson(`/api/projects/${project.id}/sessions`, apiKey, {});
    const s2 = await jsonBody<{ data: any }>(res2);

    expect(s2.data.id).toBe(s1.data.id);
  });
});
