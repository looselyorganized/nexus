import { describe, it, expect, beforeEach } from 'bun:test';
import {
  truncateAll,
  flushTestRedis,
  seedEngineer,
  seedProject,
  postJson,
  patchJson,
  authRequest,
  jsonBody,
} from '../setup/test-helpers';

beforeEach(async () => {
  await truncateAll();
  await flushTestRedis();
});

describe('Roadmap management E2E', () => {
  it('create features across lanes and get roadmap with proper grouping', async () => {
    const { engineer, apiKey } = await seedEngineer({ name: 'RoadmapLead' });
    const project = await seedProject(engineer.id);

    // Create features in different lanes
    await postJson(`/api/projects/${project.id}/features`, apiKey, {
      slug: 'feat-now-1', title: 'Now Feature 1', spec: 'Now spec', lane: 'now',
    });
    await postJson(`/api/projects/${project.id}/features`, apiKey, {
      slug: 'feat-now-2', title: 'Now Feature 2', spec: 'Now spec 2', lane: 'now',
    });
    await postJson(`/api/projects/${project.id}/features`, apiKey, {
      slug: 'feat-next-1', title: 'Next Feature 1', spec: 'Next spec', lane: 'next',
    });
    await postJson(`/api/projects/${project.id}/features`, apiKey, {
      slug: 'feat-later-1', title: 'Later Feature', spec: 'Later spec', lane: 'later',
    });
    await postJson(`/api/projects/${project.id}/features`, apiKey, {
      slug: 'feat-icebox-1', title: 'Icebox Feature', spec: 'Icebox spec', lane: 'icebox',
    });

    // Get roadmap
    const roadmapRes = await authRequest(`/api/projects/${project.id}/roadmap`, apiKey);
    expect(roadmapRes.status).toBe(200);
    const roadmap = await jsonBody<{ data: any }>(roadmapRes);

    expect(roadmap.data.projectId).toBe(project.id);
    expect(roadmap.data.lanes).toHaveLength(4);

    // Verify lane ordering: now, next, later, icebox
    expect(roadmap.data.lanes[0].lane).toBe('now');
    expect(roadmap.data.lanes[1].lane).toBe('next');
    expect(roadmap.data.lanes[2].lane).toBe('later');
    expect(roadmap.data.lanes[3].lane).toBe('icebox');

    // Verify feature counts per lane
    expect(roadmap.data.lanes[0].features).toHaveLength(2);
    expect(roadmap.data.lanes[1].features).toHaveLength(1);
    expect(roadmap.data.lanes[2].features).toHaveLength(1);
    expect(roadmap.data.lanes[3].features).toHaveLength(1);
  });

  it('reorder within lane updates priorities', async () => {
    const { engineer, apiKey } = await seedEngineer({ name: 'Reorderer' });
    const project = await seedProject(engineer.id);

    // Create 3 features in 'next' lane
    await postJson(`/api/projects/${project.id}/features`, apiKey, {
      slug: 'feat-r1', title: 'Reorder 1', spec: 'R1', lane: 'next',
    });
    await postJson(`/api/projects/${project.id}/features`, apiKey, {
      slug: 'feat-r2', title: 'Reorder 2', spec: 'R2', lane: 'next',
    });
    await postJson(`/api/projects/${project.id}/features`, apiKey, {
      slug: 'feat-r3', title: 'Reorder 3', spec: 'R3', lane: 'next',
    });

    // Reorder: reverse the order
    const reorderRes = await patchJson(
      `/api/projects/${project.id}/roadmap/reorder`,
      apiKey,
      { next: ['feat-r3', 'feat-r1', 'feat-r2'] }
    );
    expect(reorderRes.status).toBe(200);
    const reordered = await jsonBody<{ data: any }>(reorderRes);

    // Find the 'next' lane
    const nextLane = reordered.data.lanes.find((l: any) => l.lane === 'next');
    expect(nextLane).toBeDefined();
    expect(nextLane.features).toHaveLength(3);

    // Verify new order by priority
    const slugs = nextLane.features.map((f: any) => f.slug);
    expect(slugs[0]).toBe('feat-r3');
    expect(slugs[1]).toBe('feat-r1');
    expect(slugs[2]).toBe('feat-r2');

    // Verify priorities are sequential
    expect(nextLane.features[0].priority).toBe(1);
    expect(nextLane.features[1].priority).toBe(2);
    expect(nextLane.features[2].priority).toBe(3);
  });

  it('move feature between lanes', async () => {
    const { engineer, apiKey } = await seedEngineer({ name: 'Mover' });
    const project = await seedProject(engineer.id);

    // Create feature in 'next'
    await postJson(`/api/projects/${project.id}/features`, apiKey, {
      slug: 'feat-move', title: 'Move Feature', spec: 'Moving around', lane: 'next',
    });

    // Move to 'now' lane
    const moveRes = await patchJson(
      `/api/projects/${project.id}/roadmap/feat-move/lane`,
      apiKey,
      { lane: 'now', priority: 1 }
    );
    expect(moveRes.status).toBe(200);
    const moved = await jsonBody<{ data: any }>(moveRes);
    expect(moved.data.lane).toBe('now');
    expect(moved.data.priority).toBe(1);

    // Verify via roadmap
    const roadmapRes = await authRequest(`/api/projects/${project.id}/roadmap`, apiKey);
    const roadmap = await jsonBody<{ data: any }>(roadmapRes);
    const nowLane = roadmap.data.lanes.find((l: any) => l.lane === 'now');
    const nextLane = roadmap.data.lanes.find((l: any) => l.lane === 'next');

    expect(nowLane.features).toHaveLength(1);
    expect(nowLane.features[0].slug).toBe('feat-move');
    expect(nextLane.features).toHaveLength(0);
  });

  it('move to lane without explicit priority appends to end', async () => {
    const { engineer, apiKey } = await seedEngineer({ name: 'Appender' });
    const project = await seedProject(engineer.id);

    // Create two features in 'now'
    await postJson(`/api/projects/${project.id}/features`, apiKey, {
      slug: 'feat-existing', title: 'Existing', spec: 'Already here', lane: 'now',
    });

    // Create feature in 'next'
    await postJson(`/api/projects/${project.id}/features`, apiKey, {
      slug: 'feat-append', title: 'Append', spec: 'Moving without priority', lane: 'next',
    });

    // Move to 'now' without priority (should get appended at end)
    const moveRes = await patchJson(
      `/api/projects/${project.id}/roadmap/feat-append/lane`,
      apiKey,
      { lane: 'now' }
    );
    expect(moveRes.status).toBe(200);
    const moved = await jsonBody<{ data: any }>(moveRes);
    expect(moved.data.lane).toBe('now');
    // Priority should be after the existing feature
    expect(moved.data.priority).toBeGreaterThan(1);
  });

  it('reorder returns full roadmap after update', async () => {
    const { engineer, apiKey } = await seedEngineer({ name: 'FullRoadmap' });
    const project = await seedProject(engineer.id);

    await postJson(`/api/projects/${project.id}/features`, apiKey, {
      slug: 'feat-fr1', title: 'FR1', spec: 'FR1', lane: 'now',
    });
    await postJson(`/api/projects/${project.id}/features`, apiKey, {
      slug: 'feat-fr2', title: 'FR2', spec: 'FR2', lane: 'later',
    });

    const reorderRes = await patchJson(
      `/api/projects/${project.id}/roadmap/reorder`,
      apiKey,
      { now: ['feat-fr1'] }
    );
    const reordered = await jsonBody<{ data: any }>(reorderRes);

    // Should return full roadmap with all 4 lanes
    expect(reordered.data.lanes).toHaveLength(4);
    expect(reordered.data.projectId).toBe(project.id);

    // 'later' lane should still have its feature
    const laterLane = reordered.data.lanes.find((l: any) => l.lane === 'later');
    expect(laterLane.features).toHaveLength(1);
    expect(laterLane.features[0].slug).toBe('feat-fr2');
  });
});
