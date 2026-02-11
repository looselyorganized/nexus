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

describe('Feature lifecycle E2E', () => {
  it('happy path: draft -> ready -> active -> done', async () => {
    const { engineer, apiKey } = await seedEngineer({ name: 'Lead' });
    const project = await seedProject(engineer.id);

    // Create feature (draft)
    const createRes = await postJson(
      `/api/projects/${project.id}/features`,
      apiKey,
      { slug: 'feat-happy', title: 'Happy Feature', spec: 'A happy spec', touches: ['src/happy.ts'] }
    );
    expect(createRes.status).toBe(201);
    const created = await jsonBody<{ data: any }>(createRes);
    expect(created.data.status).toBe('draft');
    expect(created.data.claimedBy).toBeNull();

    // Mark ready
    const readyRes = await postJson(
      `/api/projects/${project.id}/features/feat-happy/ready`,
      apiKey,
      {}
    );
    expect(readyRes.status).toBe(200);
    const readied = await jsonBody<{ data: any }>(readyRes);
    expect(readied.data.status).toBe('ready');

    // Pick (active)
    const pickRes = await postJson(
      `/api/projects/${project.id}/features/feat-happy/pick`,
      apiKey,
      {}
    );
    expect(pickRes.status).toBe(200);
    const picked = await jsonBody<{ data: any }>(pickRes);
    expect(picked.data.status).toBe('active');
    expect(picked.data.claimedBy).toBe(engineer.id);
    expect(picked.data.claimedAt).toBeTruthy();

    // Verify claims exist
    const claimsRes = await authRequest(
      `/api/projects/${project.id}/claims/mine`,
      apiKey
    );
    expect(claimsRes.status).toBe(200);
    const claimsBody = await jsonBody<{ data: any[] }>(claimsRes);
    expect(claimsBody.data.length).toBeGreaterThan(0);

    // Done
    const doneRes = await postJson(
      `/api/projects/${project.id}/features/feat-happy/done`,
      apiKey,
      {}
    );
    expect(doneRes.status).toBe(200);
    const done = await jsonBody<{ data: any }>(doneRes);
    expect(done.data.status).toBe('done');
    expect(done.data.completedAt).toBeTruthy();

    // Claims should be released after done
    const claimsAfterDone = await authRequest(
      `/api/projects/${project.id}/claims/mine`,
      apiKey
    );
    const claimsAfterBody = await jsonBody<{ data: any[] }>(claimsAfterDone);
    expect(claimsAfterBody.data.length).toBe(0);
  });

  it('cancel flow: draft -> ready -> active -> cancelled', async () => {
    const { engineer, apiKey } = await seedEngineer({ name: 'Canceller' });
    const project = await seedProject(engineer.id);

    // Create -> ready -> pick
    await postJson(`/api/projects/${project.id}/features`, apiKey, {
      slug: 'feat-cancel', title: 'Cancel Feature', spec: 'To cancel', touches: ['src/cancel.ts'],
    });
    await postJson(`/api/projects/${project.id}/features/feat-cancel/ready`, apiKey, {});
    await postJson(`/api/projects/${project.id}/features/feat-cancel/pick`, apiKey, {});

    // Cancel
    const cancelRes = await postJson(
      `/api/projects/${project.id}/features/feat-cancel/cancel`,
      apiKey,
      {}
    );
    expect(cancelRes.status).toBe(200);
    const cancelled = await jsonBody<{ data: any }>(cancelRes);
    expect(cancelled.data.status).toBe('cancelled');

    // Claims should be released after cancel
    const claimsRes = await authRequest(
      `/api/projects/${project.id}/claims/mine`,
      apiKey
    );
    const claimsBody = await jsonBody<{ data: any[] }>(claimsRes);
    expect(claimsBody.data.length).toBe(0);
  });

  it('release and re-pick by different engineer', async () => {
    const { engineer: lead, apiKey: leadKey } = await seedEngineer({ name: 'Lead' });
    const { engineer: dev, apiKey: devKey } = await seedEngineer({ name: 'Dev' });
    const project = await seedProject(lead.id);

    // Add dev as project member
    await postJson(`/api/projects/${project.id}/members`, leadKey, {
      engineerId: dev.id, role: 'member',
    });

    // Create feature with touches -> ready
    await postJson(`/api/projects/${project.id}/features`, leadKey, {
      slug: 'feat-repick', title: 'Repick Feature', spec: 'For re-pick', touches: ['src/shared.ts'],
    });
    await postJson(`/api/projects/${project.id}/features/feat-repick/ready`, leadKey, {});

    // Lead picks
    const pickRes = await postJson(
      `/api/projects/${project.id}/features/feat-repick/pick`,
      leadKey,
      {}
    );
    expect(pickRes.status).toBe(200);
    const picked = await jsonBody<{ data: any }>(pickRes);
    expect(picked.data.claimedBy).toBe(lead.id);

    // Lead releases
    const releaseRes = await postJson(
      `/api/projects/${project.id}/features/feat-repick/release`,
      leadKey,
      {}
    );
    expect(releaseRes.status).toBe(200);
    const released = await jsonBody<{ data: any }>(releaseRes);
    expect(released.data.status).toBe('ready');
    expect(released.data.claimedBy).toBeNull();

    // Dev re-picks
    const repickRes = await postJson(
      `/api/projects/${project.id}/features/feat-repick/pick`,
      devKey,
      {}
    );
    expect(repickRes.status).toBe(200);
    const repicked = await jsonBody<{ data: any }>(repickRes);
    expect(repicked.data.claimedBy).toBe(dev.id);
  });

  it('claimedBy is set on pick and cleared on release', async () => {
    const { engineer, apiKey } = await seedEngineer({ name: 'Claimer' });
    const project = await seedProject(engineer.id);

    await postJson(`/api/projects/${project.id}/features`, apiKey, {
      slug: 'feat-claim', title: 'Claim Check', spec: 'Check claim fields',
    });
    await postJson(`/api/projects/${project.id}/features/feat-claim/ready`, apiKey, {});

    // Pick - verify claimedBy
    const pickRes = await postJson(`/api/projects/${project.id}/features/feat-claim/pick`, apiKey, {});
    const picked = await jsonBody<{ data: any }>(pickRes);
    expect(picked.data.claimedBy).toBe(engineer.id);
    expect(picked.data.claimedAt).toBeTruthy();

    // Release - verify claimedBy cleared
    const releaseRes = await postJson(`/api/projects/${project.id}/features/feat-claim/release`, apiKey, {});
    const released = await jsonBody<{ data: any }>(releaseRes);
    expect(released.data.claimedBy).toBeNull();
    expect(released.data.claimedAt).toBeNull();
  });

  it('completedAt is set when feature is marked done', async () => {
    const { engineer, apiKey } = await seedEngineer({ name: 'Completer' });
    const project = await seedProject(engineer.id);

    await postJson(`/api/projects/${project.id}/features`, apiKey, {
      slug: 'feat-complete', title: 'Complete Check', spec: 'Check complete fields',
    });
    await postJson(`/api/projects/${project.id}/features/feat-complete/ready`, apiKey, {});
    await postJson(`/api/projects/${project.id}/features/feat-complete/pick`, apiKey, {});

    // Verify completedAt before done
    const getBeforeRes = await authRequest(`/api/projects/${project.id}/features/feat-complete`, apiKey);
    const before = await jsonBody<{ data: any }>(getBeforeRes);
    expect(before.data.completedAt).toBeNull();

    // Mark done
    const doneRes = await postJson(`/api/projects/${project.id}/features/feat-complete/done`, apiKey, {});
    const done = await jsonBody<{ data: any }>(doneRes);
    expect(done.data.completedAt).toBeTruthy();

    // Verify via GET
    const getAfterRes = await authRequest(`/api/projects/${project.id}/features/feat-complete`, apiKey);
    const after = await jsonBody<{ data: any }>(getAfterRes);
    expect(after.data.completedAt).toBeTruthy();
    expect(after.data.status).toBe('done');
  });

  it('cannot transition directly from draft to active (skip ready)', async () => {
    const { engineer, apiKey } = await seedEngineer({ name: 'Skipper' });
    const project = await seedProject(engineer.id);

    await postJson(`/api/projects/${project.id}/features`, apiKey, {
      slug: 'feat-skip', title: 'Skip Ready', spec: 'Try to skip ready step',
    });

    const pickRes = await postJson(`/api/projects/${project.id}/features/feat-skip/pick`, apiKey, {});
    expect(pickRes.status).toBe(400);
  });

  it('cannot mark a feature done if not the claiming engineer', async () => {
    const { engineer: lead, apiKey: leadKey } = await seedEngineer({ name: 'Lead' });
    const { engineer: other, apiKey: otherKey } = await seedEngineer({ name: 'Other' });
    const project = await seedProject(lead.id);

    await postJson(`/api/projects/${project.id}/members`, leadKey, {
      engineerId: other.id, role: 'member',
    });

    await postJson(`/api/projects/${project.id}/features`, leadKey, {
      slug: 'feat-wrong-done', title: 'Wrong Done', spec: 'Wrong engineer tries done',
    });
    await postJson(`/api/projects/${project.id}/features/feat-wrong-done/ready`, leadKey, {});
    await postJson(`/api/projects/${project.id}/features/feat-wrong-done/pick`, leadKey, {});

    // Other engineer tries to mark done
    const doneRes = await postJson(
      `/api/projects/${project.id}/features/feat-wrong-done/done`,
      otherKey,
      {}
    );
    expect(doneRes.status).toBe(400);
  });
});
