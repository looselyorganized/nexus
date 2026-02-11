import { describe, it, expect, beforeEach } from 'bun:test';
import {
  truncateAll,
  flushTestRedis,
  seedEngineer,
  seedProject,
  postJson,
  jsonBody,
} from '../setup/test-helpers';

beforeEach(async () => {
  await truncateAll();
  await flushTestRedis();
});

describe('Multi-engineer claims E2E', () => {
  it('overlapping file touches cause conflict on pick', async () => {
    const { engineer: alice, apiKey: aliceKey } = await seedEngineer({ name: 'Alice' });
    const { engineer: bob, apiKey: bobKey } = await seedEngineer({ name: 'Bob' });
    const project = await seedProject(alice.id);

    // Add Bob as member
    await postJson(`/api/projects/${project.id}/members`, aliceKey, {
      engineerId: bob.id, role: 'member',
    });

    // Create feature A touching [src/a.ts, src/shared.ts]
    await postJson(`/api/projects/${project.id}/features`, aliceKey, {
      slug: 'feat-a', title: 'Feature A', spec: 'Feature A spec',
      touches: ['src/a.ts', 'src/shared.ts'],
    });
    await postJson(`/api/projects/${project.id}/features/feat-a/ready`, aliceKey, {});

    // Create feature B touching [src/b.ts, src/shared.ts]
    await postJson(`/api/projects/${project.id}/features`, aliceKey, {
      slug: 'feat-b', title: 'Feature B', spec: 'Feature B spec',
      touches: ['src/b.ts', 'src/shared.ts'],
    });
    await postJson(`/api/projects/${project.id}/features/feat-b/ready`, aliceKey, {});

    // Alice picks feature A
    const pickARes = await postJson(
      `/api/projects/${project.id}/features/feat-a/pick`,
      aliceKey,
      {}
    );
    expect(pickARes.status).toBe(200);

    // Bob tries to pick feature B (conflict on src/shared.ts)
    const pickBRes = await postJson(
      `/api/projects/${project.id}/features/feat-b/pick`,
      bobKey,
      {}
    );
    expect(pickBRes.status).toBe(409);
    const conflict = await jsonBody<{ error: any }>(pickBRes);
    expect(conflict.error.message).toContain('conflict');
  });

  it('after release, previously conflicted engineer can pick', async () => {
    const { engineer: alice, apiKey: aliceKey } = await seedEngineer({ name: 'Alice' });
    const { engineer: bob, apiKey: bobKey } = await seedEngineer({ name: 'Bob' });
    const project = await seedProject(alice.id);

    await postJson(`/api/projects/${project.id}/members`, aliceKey, {
      engineerId: bob.id, role: 'member',
    });

    // Create overlapping features
    await postJson(`/api/projects/${project.id}/features`, aliceKey, {
      slug: 'feat-x', title: 'Feature X', spec: 'Feature X',
      touches: ['src/x.ts', 'src/overlap.ts'],
    });
    await postJson(`/api/projects/${project.id}/features/feat-x/ready`, aliceKey, {});

    await postJson(`/api/projects/${project.id}/features`, aliceKey, {
      slug: 'feat-y', title: 'Feature Y', spec: 'Feature Y',
      touches: ['src/y.ts', 'src/overlap.ts'],
    });
    await postJson(`/api/projects/${project.id}/features/feat-y/ready`, aliceKey, {});

    // Alice picks feat-x
    await postJson(`/api/projects/${project.id}/features/feat-x/pick`, aliceKey, {});

    // Bob can't pick feat-y (overlap)
    const conflictRes = await postJson(`/api/projects/${project.id}/features/feat-y/pick`, bobKey, {});
    expect(conflictRes.status).toBe(409);

    // Alice releases feat-x
    await postJson(`/api/projects/${project.id}/features/feat-x/release`, aliceKey, {});

    // Now Bob can pick feat-y
    const pickRes = await postJson(`/api/projects/${project.id}/features/feat-y/pick`, bobKey, {});
    expect(pickRes.status).toBe(200);
    const picked = await jsonBody<{ data: any }>(pickRes);
    expect(picked.data.claimedBy).toBe(bob.id);
    expect(picked.data.status).toBe('active');
  });

  it('non-overlapping features can be picked simultaneously', async () => {
    const { engineer: alice, apiKey: aliceKey } = await seedEngineer({ name: 'Alice' });
    const { engineer: bob, apiKey: bobKey } = await seedEngineer({ name: 'Bob' });
    const project = await seedProject(alice.id);

    await postJson(`/api/projects/${project.id}/members`, aliceKey, {
      engineerId: bob.id, role: 'member',
    });

    // Create features with non-overlapping touches
    await postJson(`/api/projects/${project.id}/features`, aliceKey, {
      slug: 'feat-isolated-a', title: 'Isolated A', spec: 'Isolated A',
      touches: ['src/only-a.ts', 'src/only-a2.ts'],
    });
    await postJson(`/api/projects/${project.id}/features/feat-isolated-a/ready`, aliceKey, {});

    await postJson(`/api/projects/${project.id}/features`, aliceKey, {
      slug: 'feat-isolated-b', title: 'Isolated B', spec: 'Isolated B',
      touches: ['src/only-b.ts', 'src/only-b2.ts'],
    });
    await postJson(`/api/projects/${project.id}/features/feat-isolated-b/ready`, aliceKey, {});

    // Both can pick simultaneously without conflict
    const pickARes = await postJson(
      `/api/projects/${project.id}/features/feat-isolated-a/pick`,
      aliceKey,
      {}
    );
    expect(pickARes.status).toBe(200);

    const pickBRes = await postJson(
      `/api/projects/${project.id}/features/feat-isolated-b/pick`,
      bobKey,
      {}
    );
    expect(pickBRes.status).toBe(200);

    // Both are now active
    const pickedA = await jsonBody<{ data: any }>(pickARes);
    const pickedB = await jsonBody<{ data: any }>(pickBRes);
    expect(pickedA.data.status).toBe('active');
    expect(pickedA.data.claimedBy).toBe(alice.id);
    expect(pickedB.data.status).toBe('active');
    expect(pickedB.data.claimedBy).toBe(bob.id);
  });

  it('features without touches do not cause conflicts', async () => {
    const { engineer: alice, apiKey: aliceKey } = await seedEngineer({ name: 'Alice' });
    const { engineer: bob, apiKey: bobKey } = await seedEngineer({ name: 'Bob' });
    const project = await seedProject(alice.id);

    await postJson(`/api/projects/${project.id}/members`, aliceKey, {
      engineerId: bob.id, role: 'member',
    });

    // Create two features with no touches
    await postJson(`/api/projects/${project.id}/features`, aliceKey, {
      slug: 'feat-notouch-a', title: 'No Touch A', spec: 'No files',
    });
    await postJson(`/api/projects/${project.id}/features/feat-notouch-a/ready`, aliceKey, {});

    await postJson(`/api/projects/${project.id}/features`, aliceKey, {
      slug: 'feat-notouch-b', title: 'No Touch B', spec: 'No files',
    });
    await postJson(`/api/projects/${project.id}/features/feat-notouch-b/ready`, aliceKey, {});

    // Both can pick without conflict
    const pickARes = await postJson(
      `/api/projects/${project.id}/features/feat-notouch-a/pick`,
      aliceKey,
      {}
    );
    expect(pickARes.status).toBe(200);

    const pickBRes = await postJson(
      `/api/projects/${project.id}/features/feat-notouch-b/pick`,
      bobKey,
      {}
    );
    expect(pickBRes.status).toBe(200);
  });

  it('same engineer can pick multiple features with overlapping touches', async () => {
    const { engineer: alice, apiKey: aliceKey } = await seedEngineer({ name: 'Alice' });
    const project = await seedProject(alice.id);

    // Create two features with overlapping files
    await postJson(`/api/projects/${project.id}/features`, aliceKey, {
      slug: 'feat-self-a', title: 'Self A', spec: 'Self A',
      touches: ['src/common.ts'],
    });
    await postJson(`/api/projects/${project.id}/features/feat-self-a/ready`, aliceKey, {});

    await postJson(`/api/projects/${project.id}/features`, aliceKey, {
      slug: 'feat-self-b', title: 'Self B', spec: 'Self B',
      touches: ['src/common.ts'],
    });
    await postJson(`/api/projects/${project.id}/features/feat-self-b/ready`, aliceKey, {});

    // Alice picks both -- same engineer should not conflict with themselves
    const pickARes = await postJson(
      `/api/projects/${project.id}/features/feat-self-a/pick`,
      aliceKey,
      {}
    );
    expect(pickARes.status).toBe(200);

    const pickBRes = await postJson(
      `/api/projects/${project.id}/features/feat-self-b/pick`,
      aliceKey,
      {}
    );
    expect(pickBRes.status).toBe(200);
  });
});
