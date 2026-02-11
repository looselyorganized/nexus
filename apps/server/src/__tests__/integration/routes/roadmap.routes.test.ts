import { describe, it, expect, beforeEach } from 'bun:test';
import {
  truncateAll,
  flushTestRedis,
  seedEngineer,
  seedProject,
  seedFeature,
  authRequest,
  patchJson,
  jsonBody,
} from '../../setup/test-helpers';

beforeEach(async () => {
  await truncateAll();
  await flushTestRedis();
});

describe('GET /api/projects/:projectId/roadmap', () => {
  it('returns 200 with lanes and features', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);
    await seedFeature(project.id, engineer.id, { slug: 'now-feat', lane: 'now' });
    await seedFeature(project.id, engineer.id, { slug: 'next-feat', lane: 'next' });
    await seedFeature(project.id, engineer.id, { slug: 'later-feat', lane: 'later' });

    const res = await authRequest(`/api/projects/${project.id}/roadmap`, apiKey);
    expect(res.status).toBe(200);

    const body = await jsonBody<{ data: { projectId: string; lanes: any[] } }>(res);
    expect(body.data.projectId).toBe(project.id);
    expect(body.data.lanes).toHaveLength(4); // now, next, later, icebox
    expect(body.data.lanes[0].lane).toBe('now');
    expect(body.data.lanes[1].lane).toBe('next');
    expect(body.data.lanes[2].lane).toBe('later');
    expect(body.data.lanes[3].lane).toBe('icebox');

    // Check features are in correct lanes
    const nowLane = body.data.lanes.find((l: any) => l.lane === 'now');
    expect(nowLane.features.length).toBe(1);
    expect(nowLane.features[0].slug).toBe('now-feat');
  });

  it('returns empty lanes for project with no features', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);

    const res = await authRequest(`/api/projects/${project.id}/roadmap`, apiKey);
    expect(res.status).toBe(200);

    const body = await jsonBody<{ data: { lanes: any[] } }>(res);
    expect(body.data.lanes).toHaveLength(4);
    for (const lane of body.data.lanes) {
      expect(lane.features).toHaveLength(0);
    }
  });

  it('returns 401 without auth', async () => {
    const { engineer } = await seedEngineer();
    const project = await seedProject(engineer.id);

    const res = await authRequest(`/api/projects/${project.id}/roadmap`, 'nexus_eng_invalidkeyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/projects/:projectId/roadmap/reorder', () => {
  it('updates priorities within lanes', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);
    await seedFeature(project.id, engineer.id, { slug: 'reorder-a', lane: 'next', priority: 1 });
    await seedFeature(project.id, engineer.id, { slug: 'reorder-b', lane: 'next', priority: 2 });

    const res = await patchJson(`/api/projects/${project.id}/roadmap/reorder`, apiKey, {
      next: ['reorder-b', 'reorder-a'],
    });

    expect(res.status).toBe(200);
    const body = await jsonBody<{ data: { lanes: any[] } }>(res);
    const nextLane = body.data.lanes.find((l: any) => l.lane === 'next');
    expect(nextLane.features[0].slug).toBe('reorder-b');
    expect(nextLane.features[0].priority).toBe(1);
    expect(nextLane.features[1].slug).toBe('reorder-a');
    expect(nextLane.features[1].priority).toBe(2);
  });

  it('can move features between lanes via reorder', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);
    await seedFeature(project.id, engineer.id, { slug: 'move-feat', lane: 'later' });

    const res = await patchJson(`/api/projects/${project.id}/roadmap/reorder`, apiKey, {
      now: ['move-feat'],
    });

    expect(res.status).toBe(200);
    const body = await jsonBody<{ data: { lanes: any[] } }>(res);
    const nowLane = body.data.lanes.find((l: any) => l.lane === 'now');
    expect(nowLane.features.some((f: any) => f.slug === 'move-feat')).toBe(true);
  });
});

describe('PATCH /api/projects/:projectId/roadmap/:slug/lane', () => {
  it('moves feature to new lane', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);
    await seedFeature(project.id, engineer.id, { slug: 'lane-move', lane: 'next' });

    const res = await patchJson(`/api/projects/${project.id}/roadmap/lane-move/lane`, apiKey, {
      lane: 'now',
    });

    expect(res.status).toBe(200);
    const body = await jsonBody<{ data: any }>(res);
    expect(body.data.lane).toBe('now');
  });

  it('moves feature with explicit priority', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);
    await seedFeature(project.id, engineer.id, { slug: 'lane-priority', lane: 'next' });

    const res = await patchJson(`/api/projects/${project.id}/roadmap/lane-priority/lane`, apiKey, {
      lane: 'later',
      priority: 5,
    });

    expect(res.status).toBe(200);
    const body = await jsonBody<{ data: any }>(res);
    expect(body.data.lane).toBe('later');
    expect(body.data.priority).toBe(5);
  });

  it('returns 404 for unknown slug', async () => {
    const { engineer, apiKey } = await seedEngineer();
    const project = await seedProject(engineer.id);

    const res = await patchJson(`/api/projects/${project.id}/roadmap/nonexistent/lane`, apiKey, {
      lane: 'now',
    });

    expect(res.status).toBe(404);
  });
});
