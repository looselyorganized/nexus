import { describe, it, expect, beforeEach } from 'bun:test';
import { truncateAll, flushTestRedis } from '../../setup/test-helpers';
import {
  claimFiles,
  releaseFiles,
  releaseAllFiles,
  checkConflicts,
  getProjectClaims,
  getEngineerClaims,
  refreshClaims,
  cleanupExpiredClaims,
} from '../../../redis/claims';

beforeEach(async () => {
  await flushTestRedis();
});

// Helpers to generate unique IDs per test
function ids() {
  return {
    projectId: crypto.randomUUID(),
    engineerId: crypto.randomUUID(),
    featureId: crypto.randomUUID(),
  };
}

// ─── claimFiles ───────────────────────────────────────────────────────────────

describe('claimFiles', () => {
  it('claims files successfully and returns the claimed array', async () => {
    const { projectId, engineerId, featureId } = ids();
    const files = ['src/index.ts', 'src/app.ts'];

    const result = await claimFiles({ projectId, engineerId, featureId, files });

    expect(result.success).toBe(true);
    expect(result.claimed).toEqual(files);
    expect(result.conflicts).toEqual([]);
  });

  it('returns conflicts when another engineer already claimed the same file', async () => {
    const { projectId, featureId } = ids();
    const engineer1 = crypto.randomUUID();
    const engineer2 = crypto.randomUUID();
    const files = ['src/shared.ts'];

    await claimFiles({
      projectId,
      engineerId: engineer1,
      engineerName: 'Alice',
      featureId,
      files,
    });

    const result = await claimFiles({
      projectId,
      engineerId: engineer2,
      featureId: crypto.randomUUID(),
      files,
    });

    expect(result.success).toBe(false);
    expect(result.claimed).toEqual([]);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]!.filePath).toBe('src/shared.ts');
    expect(result.conflicts[0]!.claimedBy.engineerId).toBe(engineer1);
  });

  it('allows the same engineer to re-claim without conflict', async () => {
    const { projectId, engineerId, featureId } = ids();
    const files = ['src/utils.ts'];

    await claimFiles({ projectId, engineerId, featureId, files });
    const result = await claimFiles({ projectId, engineerId, featureId, files });

    expect(result.success).toBe(true);
    expect(result.claimed).toEqual(files);
    expect(result.conflicts).toEqual([]);
  });

  it('claims multiple files atomically', async () => {
    const { projectId, engineerId, featureId } = ids();
    const files = ['a.ts', 'b.ts', 'c.ts', 'd.ts'];

    const result = await claimFiles({ projectId, engineerId, featureId, files });

    expect(result.success).toBe(true);
    expect(result.claimed).toHaveLength(4);
    expect(result.claimed).toEqual(files);
  });

  it('rejects entire batch when any file has a conflict', async () => {
    const { projectId, featureId } = ids();
    const engineer1 = crypto.randomUUID();
    const engineer2 = crypto.randomUUID();

    await claimFiles({
      projectId,
      engineerId: engineer1,
      featureId,
      files: ['shared.ts'],
    });

    const result = await claimFiles({
      projectId,
      engineerId: engineer2,
      featureId: crypto.randomUUID(),
      files: ['new-file.ts', 'shared.ts'],
    });

    expect(result.success).toBe(false);
    expect(result.claimed).toEqual([]);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]!.filePath).toBe('shared.ts');
  });

  it('stores engineerName in the claim data', async () => {
    const { projectId, engineerId, featureId } = ids();
    const files = ['src/named.ts'];

    await claimFiles({
      projectId,
      engineerId,
      engineerName: 'Bob',
      featureId,
      files,
    });

    const claims = await getProjectClaims(projectId);
    expect(claims).toHaveLength(1);
    expect(claims[0]!.engineerName).toBe('Bob');
  });

  it('uses custom ttlSeconds for expiration', async () => {
    const { projectId, engineerId, featureId } = ids();
    const files = ['src/ttl.ts'];

    await claimFiles({
      projectId,
      engineerId,
      featureId,
      files,
      ttlSeconds: 60,
    });

    const claims = await getProjectClaims(projectId);
    expect(claims).toHaveLength(1);
    expect(claims[0]!.expiresAt).toBeInstanceOf(Date);
    // expiresAt should be roughly 60 seconds from now
    const diffMs = claims[0]!.expiresAt!.getTime() - Date.now();
    expect(diffMs).toBeGreaterThan(50_000);
    expect(diffMs).toBeLessThan(65_000);
  });
});

// ─── releaseFiles ─────────────────────────────────────────────────────────────

describe('releaseFiles', () => {
  it('releases owned files', async () => {
    const { projectId, engineerId, featureId } = ids();
    const files = ['src/a.ts', 'src/b.ts'];

    await claimFiles({ projectId, engineerId, featureId, files });
    const result = await releaseFiles({ projectId, engineerId, files });

    expect(result.released).toEqual(files);
    expect(result.notOwned).toEqual([]);
  });

  it('reports files owned by another engineer as notOwned', async () => {
    const { projectId, featureId } = ids();
    const engineer1 = crypto.randomUUID();
    const engineer2 = crypto.randomUUID();

    await claimFiles({
      projectId,
      engineerId: engineer1,
      featureId,
      files: ['src/owned.ts'],
    });

    const result = await releaseFiles({
      projectId,
      engineerId: engineer2,
      files: ['src/owned.ts'],
    });

    expect(result.released).toEqual([]);
    expect(result.notOwned).toEqual(['src/owned.ts']);
  });

  it('counts unclaimed files as released', async () => {
    const { projectId, engineerId } = ids();

    const result = await releaseFiles({
      projectId,
      engineerId,
      files: ['src/nonexistent.ts'],
    });

    expect(result.released).toEqual(['src/nonexistent.ts']);
    expect(result.notOwned).toEqual([]);
  });

  it('handles mix of owned, not-owned, and unclaimed files', async () => {
    const { projectId, featureId } = ids();
    const engineer1 = crypto.randomUUID();
    const engineer2 = crypto.randomUUID();

    await claimFiles({
      projectId,
      engineerId: engineer1,
      featureId,
      files: ['mine.ts', 'theirs.ts'],
    });

    await claimFiles({
      projectId,
      engineerId: engineer2,
      featureId: crypto.randomUUID(),
      files: ['theirs.ts'],
    }); // This will fail due to conflict, so theirs.ts stays with engineer1

    // Release from engineer1 perspective: mine.ts is owned, unclaimed.ts is unclaimed
    const result = await releaseFiles({
      projectId,
      engineerId: engineer1,
      files: ['mine.ts', 'unclaimed.ts'],
    });

    expect(result.released.sort()).toEqual(['mine.ts', 'unclaimed.ts'].sort());
    expect(result.notOwned).toEqual([]);
  });
});

// ─── releaseAllFiles ──────────────────────────────────────────────────────────

describe('releaseAllFiles', () => {
  it('releases all files for an engineer and returns the list', async () => {
    const { projectId, engineerId, featureId } = ids();
    const files = ['src/x.ts', 'src/y.ts', 'src/z.ts'];

    await claimFiles({ projectId, engineerId, featureId, files });
    const result = await releaseAllFiles({ projectId, engineerId });

    expect(result.released.sort()).toEqual(files.sort());
  });

  it('returns empty array when engineer has no claims', async () => {
    const { projectId, engineerId } = ids();

    const result = await releaseAllFiles({ projectId, engineerId });

    expect(result.released).toEqual([]);
  });

  it('does not affect claims by other engineers', async () => {
    const { projectId, featureId } = ids();
    const engineer1 = crypto.randomUUID();
    const engineer2 = crypto.randomUUID();

    await claimFiles({
      projectId,
      engineerId: engineer1,
      featureId,
      files: ['e1.ts'],
    });
    await claimFiles({
      projectId,
      engineerId: engineer2,
      featureId: crypto.randomUUID(),
      files: ['e2.ts'],
    });

    await releaseAllFiles({ projectId, engineerId: engineer1 });

    const remaining = await getProjectClaims(projectId);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.filePath).toBe('e2.ts');
    expect(remaining[0]!.engineerId).toBe(engineer2);
  });
});

// ─── checkConflicts ───────────────────────────────────────────────────────────

describe('checkConflicts', () => {
  it('returns no conflicts and all files available when unclaimed', async () => {
    const { projectId } = ids();
    const files = ['free1.ts', 'free2.ts'];

    const result = await checkConflicts({ projectId, files });

    expect(result.hasConflicts).toBe(false);
    expect(result.conflicts).toEqual([]);
    expect(result.available.sort()).toEqual(files.sort());
  });

  it('returns conflicts when files are claimed by another engineer', async () => {
    const { projectId, featureId } = ids();
    const engineer1 = crypto.randomUUID();

    await claimFiles({
      projectId,
      engineerId: engineer1,
      engineerName: 'Alice',
      featureId,
      files: ['contested.ts'],
    });

    const result = await checkConflicts({ projectId, files: ['contested.ts', 'free.ts'] });

    expect(result.hasConflicts).toBe(true);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]!.filePath).toBe('contested.ts');
    expect(result.conflicts[0]!.claimedBy.engineerId).toBe(engineer1);
    expect(result.available).toEqual(['free.ts']);
  });

  it('excludes own claims when excludeEngineerId is provided', async () => {
    const { projectId, engineerId, featureId } = ids();

    await claimFiles({
      projectId,
      engineerId,
      featureId,
      files: ['my-file.ts'],
    });

    const result = await checkConflicts({
      projectId,
      files: ['my-file.ts'],
      excludeEngineerId: engineerId,
    });

    expect(result.hasConflicts).toBe(false);
    expect(result.conflicts).toEqual([]);
    expect(result.available).toEqual(['my-file.ts']);
  });

  it('still reports others claims even when excludeEngineerId is set', async () => {
    const { projectId, featureId } = ids();
    const engineer1 = crypto.randomUUID();
    const engineer2 = crypto.randomUUID();

    await claimFiles({
      projectId,
      engineerId: engineer1,
      featureId,
      files: ['other.ts'],
    });

    const result = await checkConflicts({
      projectId,
      files: ['other.ts'],
      excludeEngineerId: engineer2,
    });

    expect(result.hasConflicts).toBe(true);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]!.claimedBy.engineerId).toBe(engineer1);
  });
});

// ─── getProjectClaims ─────────────────────────────────────────────────────────

describe('getProjectClaims', () => {
  it('returns all claims for a project', async () => {
    const { projectId, featureId } = ids();
    const engineer1 = crypto.randomUUID();
    const engineer2 = crypto.randomUUID();

    await claimFiles({
      projectId,
      engineerId: engineer1,
      featureId,
      files: ['a.ts', 'b.ts'],
    });
    await claimFiles({
      projectId,
      engineerId: engineer2,
      featureId: crypto.randomUUID(),
      files: ['c.ts'],
    });

    const claims = await getProjectClaims(projectId);

    expect(claims).toHaveLength(3);
    const filePaths = claims.map((c) => c.filePath).sort();
    expect(filePaths).toEqual(['a.ts', 'b.ts', 'c.ts']);
  });

  it('returns empty array for unknown project', async () => {
    const claims = await getProjectClaims(crypto.randomUUID());
    expect(claims).toEqual([]);
  });

  it('returns claims with correct fields', async () => {
    const { projectId, engineerId, featureId } = ids();

    await claimFiles({
      projectId,
      engineerId,
      engineerName: 'Charlie',
      featureId,
      files: ['src/detail.ts'],
    });

    const claims = await getProjectClaims(projectId);
    expect(claims).toHaveLength(1);

    const claim = claims[0]!;
    expect(claim.filePath).toBe('src/detail.ts');
    expect(claim.projectId).toBe(projectId);
    expect(claim.engineerId).toBe(engineerId);
    expect(claim.engineerName).toBe('Charlie');
    expect(claim.featureId).toBe(featureId);
    expect(claim.claimedAt).toBeInstanceOf(Date);
    expect(claim.expiresAt).toBeInstanceOf(Date);
  });
});

// ─── getEngineerClaims ────────────────────────────────────────────────────────

describe('getEngineerClaims', () => {
  it('returns only the specified engineer claims', async () => {
    const { projectId, featureId } = ids();
    const engineer1 = crypto.randomUUID();
    const engineer2 = crypto.randomUUID();

    await claimFiles({
      projectId,
      engineerId: engineer1,
      featureId,
      files: ['e1-a.ts', 'e1-b.ts'],
    });
    await claimFiles({
      projectId,
      engineerId: engineer2,
      featureId: crypto.randomUUID(),
      files: ['e2-a.ts'],
    });

    const claims = await getEngineerClaims({ projectId, engineerId: engineer1 });

    expect(claims).toHaveLength(2);
    const filePaths = claims.map((c) => c.filePath).sort();
    expect(filePaths).toEqual(['e1-a.ts', 'e1-b.ts']);
  });

  it('returns empty array when engineer has no claims', async () => {
    const { projectId, engineerId } = ids();

    const claims = await getEngineerClaims({ projectId, engineerId });
    expect(claims).toEqual([]);
  });
});

// ─── refreshClaims ────────────────────────────────────────────────────────────

describe('refreshClaims', () => {
  it('refreshes owned claims and updates expiresAt', async () => {
    const { projectId, engineerId, featureId } = ids();
    const files = ['src/refresh.ts'];

    await claimFiles({ projectId, engineerId, featureId, files, ttlSeconds: 60 });

    const beforeClaims = await getProjectClaims(projectId);
    const expiresAtBefore = beforeClaims[0]!.expiresAt!.getTime();

    // Wait a small amount so the new expiresAt is measurably different
    await Bun.sleep(50);

    const result = await refreshClaims({
      projectId,
      engineerId,
      files,
      ttlSeconds: 120,
    });

    expect(result.refreshed).toEqual(files);
    expect(result.notOwned).toEqual([]);

    const afterClaims = await getProjectClaims(projectId);
    const expiresAtAfter = afterClaims[0]!.expiresAt!.getTime();
    expect(expiresAtAfter).toBeGreaterThan(expiresAtBefore);
  });

  it('reports files owned by another engineer as notOwned', async () => {
    const { projectId, featureId } = ids();
    const engineer1 = crypto.randomUUID();
    const engineer2 = crypto.randomUUID();

    await claimFiles({
      projectId,
      engineerId: engineer1,
      featureId,
      files: ['not-mine.ts'],
    });

    const result = await refreshClaims({
      projectId,
      engineerId: engineer2,
      files: ['not-mine.ts'],
    });

    expect(result.refreshed).toEqual([]);
    expect(result.notOwned).toEqual(['not-mine.ts']);
  });

  it('ignores files that have no existing claim', async () => {
    const { projectId, engineerId } = ids();

    const result = await refreshClaims({
      projectId,
      engineerId,
      files: ['ghost.ts'],
    });

    // Unclaimed files are neither refreshed nor notOwned
    expect(result.refreshed).toEqual([]);
    expect(result.notOwned).toEqual([]);
  });
});

// ─── cleanupExpiredClaims ─────────────────────────────────────────────────────

describe('cleanupExpiredClaims', () => {
  it('removes expired claims and keeps active ones', async () => {
    const { projectId, featureId } = ids();
    const engineerExpiring = crypto.randomUUID();
    const engineerActive = crypto.randomUUID();

    // Claim with a 1-second TTL (will expire quickly)
    await claimFiles({
      projectId,
      engineerId: engineerExpiring,
      featureId,
      files: ['expire-soon.ts'],
      ttlSeconds: 1,
    });

    // Claim with a long TTL (will stay active)
    await claimFiles({
      projectId,
      engineerId: engineerActive,
      featureId: crypto.randomUUID(),
      files: ['stays-active.ts'],
      ttlSeconds: 300,
    });

    // Wait for the short-TTL claim to expire
    await Bun.sleep(1500);

    const result = await cleanupExpiredClaims(projectId);

    expect(result.removed).toEqual(['expire-soon.ts']);

    const remaining = await getProjectClaims(projectId);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.filePath).toBe('stays-active.ts');
    expect(remaining[0]!.engineerId).toBe(engineerActive);
  });

  it('returns empty removed array when nothing is expired', async () => {
    const { projectId, engineerId, featureId } = ids();

    await claimFiles({
      projectId,
      engineerId,
      featureId,
      files: ['healthy.ts'],
      ttlSeconds: 300,
    });

    const result = await cleanupExpiredClaims(projectId);
    expect(result.removed).toEqual([]);
  });

  it('returns empty removed array for an empty project', async () => {
    const result = await cleanupExpiredClaims(crypto.randomUUID());
    expect(result.removed).toEqual([]);
  });
});
