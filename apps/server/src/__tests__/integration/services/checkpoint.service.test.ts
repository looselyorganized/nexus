import { describe, it, expect, beforeEach } from 'bun:test';
import {
  truncateAll,
  flushTestRedis,
  seedEngineer,
  seedProject,
  seedFeature,
  seedSession,
} from '../../setup/test-helpers';
import {
  createCheckpoint,
  getLatestCheckpoint,
  getCheckpointHistory,
  cleanupOldCheckpoints,
} from '../../../services/checkpoint.service';
import { ValidationError } from '../../../lib/errors';
import { markReady, pickFeature } from '../../../services/feature.service';

let engineer: { id: string; name: string; email: string };
let project: { id: string; slug: string };
let featureId: string;
let sessionId: string;

beforeEach(async () => {
  await truncateAll();
  await flushTestRedis();

  const seed = await seedEngineer();
  engineer = seed.engineer;
  project = await seedProject(engineer.id);

  const feature = await seedFeature(project.id, engineer.id, {
    touches: ['src/checkpoint-test.ts'],
  });
  await markReady(project.id, feature.slug);
  const picked = await pickFeature({
    projectId: project.id,
    slug: feature.slug,
    engineerId: engineer.id,
    engineerName: engineer.name,
  });
  featureId = picked.id;

  const session = await seedSession(project.id, engineer.id, featureId);
  sessionId = session.id;
});

// ─── createCheckpoint ───

describe('createCheckpoint', () => {
  it('creates manual checkpoint with isLatest=true', async () => {
    const cp = await createCheckpoint(project.id, engineer.id, {
      sessionId,
      featureId,
      context: { step: 1 },
      type: 'manual',
    });

    expect(cp).not.toBeNull();
    expect(cp!.isLatest).toBe(true);
    expect(cp!.type).toBe('manual');
    expect(cp!.featureId).toBe(featureId);
    expect(cp!.sessionId).toBe(sessionId);
  });

  it('sets previous checkpoint isLatest=false when new one is created', async () => {
    const cp1 = await createCheckpoint(project.id, engineer.id, {
      sessionId,
      featureId,
      context: { step: 1 },
      type: 'manual',
    });

    const cp2 = await createCheckpoint(project.id, engineer.id, {
      sessionId,
      featureId,
      context: { step: 2 },
      type: 'manual',
    });

    expect(cp2!.isLatest).toBe(true);

    // Verify previous is no longer latest via history
    const history = await getCheckpointHistory(engineer.id, featureId);
    const oldCp = history.find((c) => c.id === cp1!.id);
    expect(oldCp!.isLatest).toBe(false);
  });

  it('auto_periodic deduplication: same state hash returns null', async () => {
    const context = { step: 1, data: 'same' };

    const cp1 = await createCheckpoint(project.id, engineer.id, {
      sessionId,
      featureId,
      context,
      type: 'auto_periodic',
      activeClaims: ['src/checkpoint-test.ts'],
    });
    expect(cp1).not.toBeNull();

    // Same state -> should return null (deduplicated)
    const cp2 = await createCheckpoint(project.id, engineer.id, {
      sessionId,
      featureId,
      context,
      type: 'auto_periodic',
      activeClaims: ['src/checkpoint-test.ts'],
    });
    expect(cp2).toBeNull();
  });

  it('auto_periodic with different state creates new checkpoint', async () => {
    const cp1 = await createCheckpoint(project.id, engineer.id, {
      sessionId,
      featureId,
      context: { step: 1 },
      type: 'auto_periodic',
      activeClaims: ['src/checkpoint-test.ts'],
    });
    expect(cp1).not.toBeNull();

    const cp2 = await createCheckpoint(project.id, engineer.id, {
      sessionId,
      featureId,
      context: { step: 2, extraData: true },
      type: 'auto_periodic',
      activeClaims: ['src/checkpoint-test.ts'],
    });
    expect(cp2).not.toBeNull();
    expect(cp2!.id).not.toBe(cp1!.id);
  });

  it('validates session belongs to engineer', async () => {
    const seed2 = await seedEngineer();
    const engineer2 = seed2.engineer;

    expect(
      createCheckpoint(project.id, engineer2.id, {
        sessionId,
        featureId,
        context: { step: 1 },
        type: 'manual',
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

// ─── getLatestCheckpoint ───

describe('getLatestCheckpoint', () => {
  it('returns the latest checkpoint', async () => {
    await createCheckpoint(project.id, engineer.id, {
      sessionId,
      featureId,
      context: { step: 1 },
      type: 'manual',
    });

    const cp2 = await createCheckpoint(project.id, engineer.id, {
      sessionId,
      featureId,
      context: { step: 2 },
      type: 'manual',
    });

    const latest = await getLatestCheckpoint(engineer.id, featureId);
    expect(latest).not.toBeNull();
    expect(latest!.id).toBe(cp2!.id);
    expect(latest!.isLatest).toBe(true);
  });

  it('returns null when no checkpoints exist', async () => {
    const fakeFeatureId = '00000000-0000-0000-0000-000000000000';
    const latest = await getLatestCheckpoint(engineer.id, fakeFeatureId);
    expect(latest).toBeNull();
  });
});

// ─── getCheckpointHistory ───

describe('getCheckpointHistory', () => {
  it('returns checkpoints in reverse chronological order', async () => {
    const cp1 = await createCheckpoint(project.id, engineer.id, {
      sessionId,
      featureId,
      context: { step: 1 },
      type: 'manual',
    });

    await new Promise((r) => setTimeout(r, 10));

    const cp2 = await createCheckpoint(project.id, engineer.id, {
      sessionId,
      featureId,
      context: { step: 2 },
      type: 'manual',
    });

    await new Promise((r) => setTimeout(r, 10));

    const cp3 = await createCheckpoint(project.id, engineer.id, {
      sessionId,
      featureId,
      context: { step: 3 },
      type: 'manual',
    });

    const history = await getCheckpointHistory(engineer.id, featureId);

    expect(history.length).toBe(3);
    // Most recent first
    expect(history[0]!.id).toBe(cp3!.id);
    expect(history[1]!.id).toBe(cp2!.id);
    expect(history[2]!.id).toBe(cp1!.id);
  });
});

// ─── cleanupOldCheckpoints ───

describe('cleanupOldCheckpoints', () => {
  it('deletes old non-latest checkpoints', async () => {
    // Create checkpoints with backdated createdAt
    const cp1 = await createCheckpoint(project.id, engineer.id, {
      sessionId,
      featureId,
      context: { step: 1 },
      type: 'manual',
    });

    const cp2 = await createCheckpoint(project.id, engineer.id, {
      sessionId,
      featureId,
      context: { step: 2 },
      type: 'manual',
    });

    // cp1 is now isLatest=false, cp2 is isLatest=true
    // Backdate cp1 to be old enough for cleanup
    const { db } = await import('../../../db/connection');
    const { checkpoints } = await import('../../../db/schema');
    const { eq } = await import('drizzle-orm');

    const oldDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    await db
      .update(checkpoints)
      .set({ createdAt: oldDate })
      .where(eq(checkpoints.id, cp1!.id));

    // Disconnect the session so its checkpoints are eligible for cleanup
    const { sessions } = await import('../../../db/schema');
    await db
      .update(sessions)
      .set({ status: 'disconnected' })
      .where(eq(sessions.id, sessionId));

    const result = await cleanupOldCheckpoints(7);

    expect(result.deleted).toBe(1);

    // cp2 (latest) should still exist
    const latest = await getLatestCheckpoint(engineer.id, featureId);
    expect(latest).not.toBeNull();
    expect(latest!.id).toBe(cp2!.id);
  });

  it('preserves latest and active session checkpoints', async () => {
    const cp1 = await createCheckpoint(project.id, engineer.id, {
      sessionId,
      featureId,
      context: { step: 'latest' },
      type: 'manual',
    });

    // Even if old, should not be deleted because isLatest=true
    const { db } = await import('../../../db/connection');
    const { checkpoints } = await import('../../../db/schema');
    const { eq } = await import('drizzle-orm');

    const oldDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await db
      .update(checkpoints)
      .set({ createdAt: oldDate })
      .where(eq(checkpoints.id, cp1!.id));

    const result = await cleanupOldCheckpoints(7);

    // Should not delete the latest checkpoint
    expect(result.deleted).toBe(0);

    const latest = await getLatestCheckpoint(engineer.id, featureId);
    expect(latest).not.toBeNull();
    expect(latest!.id).toBe(cp1!.id);
  });
});
