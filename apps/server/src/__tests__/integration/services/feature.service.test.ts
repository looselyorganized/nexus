import { describe, it, expect, beforeEach } from 'bun:test';
import {
  truncateAll,
  flushTestRedis,
  seedEngineer,
  seedProject,
  seedFeature,
  featureFactory,
} from '../../setup/test-helpers';
import {
  createFeature,
  getFeature,
  listFeatures,
  updateFeature,
  deleteFeature,
  markReady,
  pickFeature,
  releaseFeature,
  markDone,
  cancelFeature,
  getAvailableFeatures,
} from '../../../services/feature.service';
import { ConflictError, NotFoundError, ValidationError } from '../../../lib/errors';

let engineer: { id: string; name: string; email: string };
let apiKey: string;
let project: { id: string; slug: string };

beforeEach(async () => {
  await truncateAll();
  await flushTestRedis();
  const seed = await seedEngineer();
  engineer = seed.engineer;
  apiKey = seed.apiKey;
  project = await seedProject(engineer.id);
});

// ─── createFeature ───

describe('createFeature', () => {
  it('creates feature with draft status', async () => {
    const data = featureFactory();
    const feature = await createFeature({
      projectId: project.id,
      slug: data.slug,
      title: data.title,
      spec: data.spec,
      createdBy: engineer.id,
    });

    expect(feature.status).toBe('draft');
    expect(feature.slug).toBe(data.slug);
    expect(feature.title).toBe(data.title);
    expect(feature.projectId).toBe(project.id);
  });

  it('auto-assigns priority when not provided', async () => {
    const f1 = await seedFeature(project.id, engineer.id, { lane: 'next' });
    const f2 = await seedFeature(project.id, engineer.id, { lane: 'next' });

    expect(f2.priority).toBeGreaterThan(f1.priority);
  });

  it('throws ConflictError on duplicate slug in same project', async () => {
    const slug = `dup-slug-${Date.now()}`;
    await seedFeature(project.id, engineer.id, { slug });

    expect(
      createFeature({
        projectId: project.id,
        slug,
        title: 'Dup',
        spec: 'Dup spec',
        createdBy: engineer.id,
      })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('creates feature with custom lane and priority', async () => {
    const feature = await createFeature({
      projectId: project.id,
      slug: `custom-${Date.now()}`,
      title: 'Custom',
      spec: 'Spec',
      lane: 'now',
      priority: 42,
      createdBy: engineer.id,
    });

    expect(feature.lane).toBe('now');
    expect(feature.priority).toBe(42);
  });

  it('stores touches array', async () => {
    const touches = ['src/index.ts', 'src/utils.ts'];
    const feature = await createFeature({
      projectId: project.id,
      slug: `touches-${Date.now()}`,
      title: 'Touches',
      spec: 'Spec',
      touches,
      createdBy: engineer.id,
    });

    expect(feature.touches).toEqual(touches);
  });
});

// ─── getFeature ───

describe('getFeature', () => {
  it('returns feature by slug', async () => {
    const created = await seedFeature(project.id, engineer.id);
    const found = await getFeature(project.id, created.slug);

    expect(found.id).toBe(created.id);
    expect(found.slug).toBe(created.slug);
  });

  it('throws NotFoundError for unknown slug', async () => {
    expect(getFeature(project.id, 'nonexistent-slug')).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ─── listFeatures ───

describe('listFeatures', () => {
  it('returns all features for project', async () => {
    await seedFeature(project.id, engineer.id);
    await seedFeature(project.id, engineer.id);
    await seedFeature(project.id, engineer.id);

    const result = await listFeatures({ projectId: project.id });

    expect(result.items.length).toBe(3);
    expect(result.hasMore).toBe(false);
  });

  it('pagination works with limit and cursor', async () => {
    // Create 3 features with slight delay to ensure different createdAt
    const f1 = await seedFeature(project.id, engineer.id);
    const f2 = await seedFeature(project.id, engineer.id);
    const f3 = await seedFeature(project.id, engineer.id);

    const page1 = await listFeatures({ projectId: project.id, limit: 2 });
    expect(page1.items.length).toBe(2);
    expect(page1.hasMore).toBe(true);
    expect(page1.nextCursor).toBeTruthy();

    const page2 = await listFeatures({
      projectId: project.id,
      limit: 2,
      cursor: page1.nextCursor!,
    });
    expect(page2.items.length).toBe(1);
    expect(page2.hasMore).toBe(false);
  });

  it('filters by status', async () => {
    const f1 = await seedFeature(project.id, engineer.id);
    const f2 = await seedFeature(project.id, engineer.id);
    // Mark f1 as ready
    await markReady(project.id, f1.slug);

    const result = await listFeatures({ projectId: project.id, status: 'ready' });
    expect(result.items.length).toBe(1);
    expect(result.items[0]!.slug).toBe(f1.slug);
  });

  it('filters by lane', async () => {
    await seedFeature(project.id, engineer.id, { lane: 'now' });
    await seedFeature(project.id, engineer.id, { lane: 'later' });
    await seedFeature(project.id, engineer.id, { lane: 'now' });

    const result = await listFeatures({ projectId: project.id, lane: 'now' });
    expect(result.items.length).toBe(2);
    result.items.forEach((f) => expect(f.lane).toBe('now'));
  });
});

// ─── updateFeature ───

describe('updateFeature', () => {
  it('partial update (title only)', async () => {
    const feature = await seedFeature(project.id, engineer.id);
    const updated = await updateFeature({
      projectId: project.id,
      slug: feature.slug,
      title: 'New Title',
    });

    expect(updated.title).toBe('New Title');
    expect(updated.spec).toBe(feature.spec); // unchanged
  });

  it('updates updatedAt timestamp', async () => {
    const feature = await seedFeature(project.id, engineer.id);
    const originalUpdatedAt = feature.updatedAt;

    // Small delay to guarantee timestamp differs
    await new Promise((r) => setTimeout(r, 10));

    const updated = await updateFeature({
      projectId: project.id,
      slug: feature.slug,
      title: 'Updated',
    });

    expect(updated.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
  });
});

// ─── deleteFeature ───

describe('deleteFeature', () => {
  it('deletes a draft feature', async () => {
    const feature = await seedFeature(project.id, engineer.id);
    expect(feature.status).toBe('draft');

    await deleteFeature(project.id, feature.slug);

    expect(getFeature(project.id, feature.slug)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws ValidationError when deleting non-draft feature', async () => {
    const feature = await seedFeature(project.id, engineer.id);
    await markReady(project.id, feature.slug);

    expect(deleteFeature(project.id, feature.slug)).rejects.toBeInstanceOf(ValidationError);
  });
});

// ─── markReady ───

describe('markReady', () => {
  it('transitions draft to ready', async () => {
    const feature = await seedFeature(project.id, engineer.id);
    expect(feature.status).toBe('draft');

    const ready = await markReady(project.id, feature.slug);
    expect(ready.status).toBe('ready');
  });

  it('throws ValidationError for invalid transition (done -> ready)', async () => {
    const feature = await seedFeature(project.id, engineer.id, {
      touches: ['src/file.ts'],
    });
    await markReady(project.id, feature.slug);
    await pickFeature({
      projectId: project.id,
      slug: feature.slug,
      engineerId: engineer.id,
      engineerName: engineer.name,
    });
    await markDone({
      projectId: project.id,
      slug: feature.slug,
      engineerId: engineer.id,
    });

    expect(markReady(project.id, feature.slug)).rejects.toBeInstanceOf(ValidationError);
  });
});

// ─── pickFeature ───

describe('pickFeature', () => {
  it('transitions ready to active and sets claimedBy/claimedAt', async () => {
    const feature = await seedFeature(project.id, engineer.id, {
      touches: ['src/main.ts'],
    });
    await markReady(project.id, feature.slug);

    const picked = await pickFeature({
      projectId: project.id,
      slug: feature.slug,
      engineerId: engineer.id,
      engineerName: engineer.name,
    });

    expect(picked.status).toBe('active');
    expect(picked.claimedBy).toBe(engineer.id);
    expect(picked.claimedAt).toBeTruthy();
  });

  it('claims files in Redis', async () => {
    const touches = ['src/a.ts', 'src/b.ts'];
    const feature = await seedFeature(project.id, engineer.id, { touches });
    await markReady(project.id, feature.slug);

    await pickFeature({
      projectId: project.id,
      slug: feature.slug,
      engineerId: engineer.id,
      engineerName: engineer.name,
    });

    // Import to check Redis directly
    const { getProjectClaims } = await import('../../../redis/claims');
    const claims = await getProjectClaims(project.id);

    expect(claims.length).toBe(2);
    const claimedPaths = claims.map((c) => c.filePath).sort();
    expect(claimedPaths).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('throws ConflictError when files already claimed by another engineer', async () => {
    const seed2 = await seedEngineer();
    const engineer2 = seed2.engineer;

    // Add engineer2 to the project (seedProject only adds lead)
    const { db } = await import('../../../db/connection');
    const { projectMembers } = await import('../../../db/schema');
    await db.insert(projectMembers).values({
      projectId: project.id,
      engineerId: engineer2.id,
      role: 'member',
    });

    // Feature A has overlapping files
    const featureA = await seedFeature(project.id, engineer.id, {
      touches: ['src/shared.ts'],
    });
    await markReady(project.id, featureA.slug);
    await pickFeature({
      projectId: project.id,
      slug: featureA.slug,
      engineerId: engineer.id,
      engineerName: engineer.name,
    });

    // Feature B touches the same file
    const featureB = await seedFeature(project.id, engineer2.id, {
      touches: ['src/shared.ts'],
    });
    await markReady(project.id, featureB.slug);

    expect(
      pickFeature({
        projectId: project.id,
        slug: featureB.slug,
        engineerId: engineer2.id,
        engineerName: engineer2.name,
      })
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

// ─── releaseFeature ───

describe('releaseFeature', () => {
  it('transitions active to ready and clears claimedBy', async () => {
    const feature = await seedFeature(project.id, engineer.id, {
      touches: ['src/release.ts'],
    });
    await markReady(project.id, feature.slug);
    await pickFeature({
      projectId: project.id,
      slug: feature.slug,
      engineerId: engineer.id,
      engineerName: engineer.name,
    });

    const released = await releaseFeature({
      projectId: project.id,
      slug: feature.slug,
      engineerId: engineer.id,
    });

    expect(released.status).toBe('ready');
    expect(released.claimedBy).toBeNull();
    expect(released.claimedAt).toBeNull();
  });

  it('releases Redis claims', async () => {
    const feature = await seedFeature(project.id, engineer.id, {
      touches: ['src/redis-release.ts'],
    });
    await markReady(project.id, feature.slug);
    await pickFeature({
      projectId: project.id,
      slug: feature.slug,
      engineerId: engineer.id,
      engineerName: engineer.name,
    });

    await releaseFeature({
      projectId: project.id,
      slug: feature.slug,
      engineerId: engineer.id,
    });

    const { getProjectClaims } = await import('../../../redis/claims');
    const claims = await getProjectClaims(project.id);
    expect(claims.length).toBe(0);
  });

  it('only the claiming engineer can release', async () => {
    const seed2 = await seedEngineer();
    const engineer2 = seed2.engineer;

    const feature = await seedFeature(project.id, engineer.id, {
      touches: ['src/only-owner.ts'],
    });
    await markReady(project.id, feature.slug);
    await pickFeature({
      projectId: project.id,
      slug: feature.slug,
      engineerId: engineer.id,
      engineerName: engineer.name,
    });

    expect(
      releaseFeature({
        projectId: project.id,
        slug: feature.slug,
        engineerId: engineer2.id,
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

// ─── markDone ───

describe('markDone', () => {
  it('transitions active to done and sets completedAt', async () => {
    const feature = await seedFeature(project.id, engineer.id, {
      touches: ['src/done.ts'],
    });
    await markReady(project.id, feature.slug);
    await pickFeature({
      projectId: project.id,
      slug: feature.slug,
      engineerId: engineer.id,
      engineerName: engineer.name,
    });

    const done = await markDone({
      projectId: project.id,
      slug: feature.slug,
      engineerId: engineer.id,
    });

    expect(done.status).toBe('done');
    expect(done.completedAt).toBeTruthy();
  });

  it('releases Redis claims on completion', async () => {
    const feature = await seedFeature(project.id, engineer.id, {
      touches: ['src/done-claims.ts'],
    });
    await markReady(project.id, feature.slug);
    await pickFeature({
      projectId: project.id,
      slug: feature.slug,
      engineerId: engineer.id,
      engineerName: engineer.name,
    });

    await markDone({
      projectId: project.id,
      slug: feature.slug,
      engineerId: engineer.id,
    });

    const { getProjectClaims } = await import('../../../redis/claims');
    const claims = await getProjectClaims(project.id);
    expect(claims.length).toBe(0);
  });

  it('only the claiming engineer can complete', async () => {
    const seed2 = await seedEngineer();
    const engineer2 = seed2.engineer;

    const feature = await seedFeature(project.id, engineer.id, {
      touches: ['src/done-only-owner.ts'],
    });
    await markReady(project.id, feature.slug);
    await pickFeature({
      projectId: project.id,
      slug: feature.slug,
      engineerId: engineer.id,
      engineerName: engineer.name,
    });

    expect(
      markDone({
        projectId: project.id,
        slug: feature.slug,
        engineerId: engineer2.id,
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

// ─── cancelFeature ───

describe('cancelFeature', () => {
  it('transitions active to cancelled and releases claims', async () => {
    const feature = await seedFeature(project.id, engineer.id, {
      touches: ['src/cancel.ts'],
    });
    await markReady(project.id, feature.slug);
    await pickFeature({
      projectId: project.id,
      slug: feature.slug,
      engineerId: engineer.id,
      engineerName: engineer.name,
    });

    const cancelled = await cancelFeature({
      projectId: project.id,
      slug: feature.slug,
      engineerId: engineer.id,
    });

    expect(cancelled.status).toBe('cancelled');

    const { getProjectClaims } = await import('../../../redis/claims');
    const claims = await getProjectClaims(project.id);
    expect(claims.length).toBe(0);
  });
});

// ─── Invalid Transitions ───

describe('invalid transitions', () => {
  it('cannot transition done to any status', async () => {
    const feature = await seedFeature(project.id, engineer.id, {
      touches: ['src/done-block.ts'],
    });
    await markReady(project.id, feature.slug);
    await pickFeature({
      projectId: project.id,
      slug: feature.slug,
      engineerId: engineer.id,
      engineerName: engineer.name,
    });
    await markDone({
      projectId: project.id,
      slug: feature.slug,
      engineerId: engineer.id,
    });

    expect(markReady(project.id, feature.slug)).rejects.toBeInstanceOf(ValidationError);
  });

  it('cannot transition cancelled to any status', async () => {
    const feature = await seedFeature(project.id, engineer.id, {
      touches: ['src/cancel-block.ts'],
    });
    await markReady(project.id, feature.slug);
    await pickFeature({
      projectId: project.id,
      slug: feature.slug,
      engineerId: engineer.id,
      engineerName: engineer.name,
    });
    await cancelFeature({
      projectId: project.id,
      slug: feature.slug,
      engineerId: engineer.id,
    });

    expect(markReady(project.id, feature.slug)).rejects.toBeInstanceOf(ValidationError);
  });

  it('cannot transition draft directly to active', async () => {
    const feature = await seedFeature(project.id, engineer.id);

    expect(
      pickFeature({
        projectId: project.id,
        slug: feature.slug,
        engineerId: engineer.id,
        engineerName: engineer.name,
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

// ─── getAvailableFeatures ───

describe('getAvailableFeatures', () => {
  it('returns ready features', async () => {
    const f1 = await seedFeature(project.id, engineer.id);
    const f2 = await seedFeature(project.id, engineer.id);
    await markReady(project.id, f1.slug);
    // f2 stays as draft

    const available = await getAvailableFeatures({
      projectId: project.id,
      engineerId: engineer.id,
    });

    expect(available.length).toBe(1);
    expect(available[0]!.slug).toBe(f1.slug);
  });

  it('marks features with file conflicts as blocked', async () => {
    const seed2 = await seedEngineer();
    const engineer2 = seed2.engineer;

    // Add engineer2 to project
    const { db } = await import('../../../db/connection');
    const { projectMembers } = await import('../../../db/schema');
    await db.insert(projectMembers).values({
      projectId: project.id,
      engineerId: engineer2.id,
      role: 'member',
    });

    // Engineer1 picks featureA with file overlap
    const featureA = await seedFeature(project.id, engineer.id, {
      touches: ['src/conflict.ts'],
    });
    await markReady(project.id, featureA.slug);
    await pickFeature({
      projectId: project.id,
      slug: featureA.slug,
      engineerId: engineer.id,
      engineerName: engineer.name,
    });

    // Feature B is ready but has file conflict
    const featureB = await seedFeature(project.id, engineer2.id, {
      touches: ['src/conflict.ts'],
    });
    await markReady(project.id, featureB.slug);

    const available = await getAvailableFeatures({
      projectId: project.id,
      engineerId: engineer2.id,
    });

    const blocked = available.find((f) => f.slug === featureB.slug);
    expect(blocked).toBeDefined();
    expect(blocked!.blockedBy).toBeDefined();
    expect(blocked!.blockedBy!.engineerId).toBe(engineer.id);
  });
});
