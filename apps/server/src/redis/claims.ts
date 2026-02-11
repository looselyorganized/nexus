import { getRedis } from './client';
import type { FileClaim, ClaimConflict, ClaimResult, ConflictCheckResult } from '@nexus/shared';
import { config } from '../config';
import { logger } from '../lib/logger';

const KEYS = {
  projectClaims: (projectId: string) => `project:${projectId}:claims`,
  engineerClaims: (engineerId: string, projectId: string) =>
    `engineer:${engineerId}:claims:${projectId}`,
};

function serializeClaim(claim: Omit<FileClaim, 'filePath'>): string {
  return JSON.stringify({
    ...claim,
    claimedAt: claim.claimedAt.toISOString(),
    expiresAt: claim.expiresAt?.toISOString() ?? null,
  });
}

function deserializeClaim(filePath: string, data: string): FileClaim {
  const parsed = JSON.parse(data);
  return {
    filePath,
    projectId: parsed.projectId,
    engineerId: parsed.engineerId,
    engineerName: parsed.engineerName,
    featureId: parsed.featureId,
    claimedAt: new Date(parsed.claimedAt),
    expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : null,
  };
}

export async function claimFiles(params: {
  projectId: string;
  engineerId: string;
  engineerName?: string;
  featureId: string;
  files: string[];
  ttlSeconds?: number;
}): Promise<ClaimResult> {
  const redis = getRedis();
  const { projectId, engineerId, engineerName, featureId, files, ttlSeconds = config.claimTtlSeconds } = params;

  const claimsKey = KEYS.projectClaims(projectId);
  const engineerKey = KEYS.engineerClaims(engineerId, projectId);

  const conflicts: ClaimConflict[] = [];
  const existingClaims = await redis.hmget(claimsKey, ...files);

  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    const existingData = existingClaims[i];
    if (existingData) {
      const existing = deserializeClaim(file, existingData);
      if (existing.engineerId !== engineerId) {
        conflicts.push({
          filePath: file,
          claimedBy: {
            engineerId: existing.engineerId,
            engineerName: existing.engineerName,
            featureId: existing.featureId,
            claimedAt: existing.claimedAt,
          },
        });
      }
    }
  }

  if (conflicts.length > 0) {
    return { success: false, claimed: [], conflicts };
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
  const claimData: Omit<FileClaim, 'filePath'> = {
    projectId, engineerId, engineerName, featureId,
    claimedAt: now, expiresAt,
  };

  const pipeline = redis.pipeline();
  const claimEntries: Record<string, string> = {};
  for (const file of files) {
    claimEntries[file] = serializeClaim(claimData);
  }
  pipeline.hset(claimsKey, claimEntries);
  pipeline.sadd(engineerKey, ...files);
  pipeline.expire(claimsKey, ttlSeconds + 60);
  pipeline.expire(engineerKey, ttlSeconds + 60);
  await pipeline.exec();

  return { success: true, claimed: files, conflicts: [] };
}

export async function releaseFiles(params: {
  projectId: string;
  engineerId: string;
  files: string[];
}): Promise<{ released: string[]; notOwned: string[] }> {
  const redis = getRedis();
  const { projectId, engineerId, files } = params;
  const claimsKey = KEYS.projectClaims(projectId);
  const engineerKey = KEYS.engineerClaims(engineerId, projectId);

  const existingClaims = await redis.hmget(claimsKey, ...files);
  const toRelease: string[] = [];
  const notOwned: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    const existingData = existingClaims[i];
    if (existingData) {
      const existing = deserializeClaim(file, existingData);
      if (existing.engineerId === engineerId) {
        toRelease.push(file);
      } else {
        notOwned.push(file);
      }
    } else {
      toRelease.push(file);
    }
  }

  if (toRelease.length > 0) {
    const pipeline = redis.pipeline();
    pipeline.hdel(claimsKey, ...toRelease);
    pipeline.srem(engineerKey, ...toRelease);
    await pipeline.exec();
  }

  return { released: toRelease, notOwned };
}

export async function releaseAllFiles(params: {
  projectId: string;
  engineerId: string;
}): Promise<{ released: string[] }> {
  const redis = getRedis();
  const { projectId, engineerId } = params;
  const claimsKey = KEYS.projectClaims(projectId);
  const engineerKey = KEYS.engineerClaims(engineerId, projectId);

  const files = await redis.smembers(engineerKey);

  if (files.length > 0) {
    const pipeline = redis.pipeline();
    pipeline.hdel(claimsKey, ...files);
    pipeline.del(engineerKey);
    await pipeline.exec();
  }

  return { released: files };
}

export async function checkConflicts(params: {
  projectId: string;
  files: string[];
  excludeEngineerId?: string;
}): Promise<ConflictCheckResult> {
  const redis = getRedis();
  const { projectId, files, excludeEngineerId } = params;
  const claimsKey = KEYS.projectClaims(projectId);
  const existingClaims = await redis.hmget(claimsKey, ...files);

  const conflicts: ClaimConflict[] = [];
  const available: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    const existingData = existingClaims[i];
    if (existingData) {
      const existing = deserializeClaim(file, existingData);
      if (excludeEngineerId && existing.engineerId === excludeEngineerId) {
        available.push(file);
      } else {
        conflicts.push({
          filePath: file,
          claimedBy: {
            engineerId: existing.engineerId,
            engineerName: existing.engineerName,
            featureId: existing.featureId,
            claimedAt: existing.claimedAt,
          },
        });
      }
    } else {
      available.push(file);
    }
  }

  return { hasConflicts: conflicts.length > 0, conflicts, available };
}

export async function getProjectClaims(projectId: string): Promise<FileClaim[]> {
  const redis = getRedis();
  const claimsKey = KEYS.projectClaims(projectId);
  const claims: FileClaim[] = [];
  let cursor = '0';

  do {
    const [newCursor, results] = await redis.hscan(claimsKey, cursor, 'COUNT', 100);
    cursor = newCursor;
    for (let i = 0; i < results.length; i += 2) {
      const filePath = results[i];
      const data = results[i + 1];
      if (filePath && data) {
        try {
          claims.push(deserializeClaim(filePath, data));
        } catch {
          logger.warn({ filePath }, 'Malformed claim data');
        }
      }
    }
  } while (cursor !== '0');

  return claims;
}

export async function getEngineerClaims(params: {
  projectId: string;
  engineerId: string;
}): Promise<FileClaim[]> {
  const redis = getRedis();
  const { projectId, engineerId } = params;
  const claimsKey = KEYS.projectClaims(projectId);
  const engineerKey = KEYS.engineerClaims(engineerId, projectId);

  const files = await redis.smembers(engineerKey);
  if (files.length === 0) return [];

  const claimData = await redis.hmget(claimsKey, ...files);
  const claims: FileClaim[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    const data = claimData[i];
    if (data) {
      try {
        claims.push(deserializeClaim(file, data));
      } catch { /* skip malformed */ }
    }
  }

  return claims;
}

export async function refreshClaims(params: {
  projectId: string;
  engineerId: string;
  files: string[];
  ttlSeconds?: number;
}): Promise<{ refreshed: string[]; notOwned: string[] }> {
  const redis = getRedis();
  const { projectId, engineerId, files, ttlSeconds = config.claimTtlSeconds } = params;
  const claimsKey = KEYS.projectClaims(projectId);

  const existingClaims = await redis.hmget(claimsKey, ...files);
  const toRefresh: string[] = [];
  const notOwned: string[] = [];
  const newExpiresAt = new Date(Date.now() + ttlSeconds * 1000);

  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    const existingData = existingClaims[i];
    if (existingData) {
      const existing = deserializeClaim(file, existingData);
      if (existing.engineerId === engineerId) {
        toRefresh.push(file);
      } else {
        notOwned.push(file);
      }
    }
  }

  if (toRefresh.length > 0) {
    const pipeline = redis.pipeline();
    const updates: Record<string, string> = {};
    for (const file of toRefresh) {
      const existingData = existingClaims[files.indexOf(file)]!;
      const existing = deserializeClaim(file, existingData);
      existing.expiresAt = newExpiresAt;
      updates[file] = serializeClaim(existing);
    }
    pipeline.hset(claimsKey, updates);
    pipeline.expire(claimsKey, ttlSeconds + 60);
    await pipeline.exec();
  }

  return { refreshed: toRefresh, notOwned };
}

export async function cleanupExpiredClaims(projectId: string): Promise<{ removed: string[] }> {
  const redis = getRedis();
  const claimsKey = KEYS.projectClaims(projectId);
  const allClaims = await redis.hgetall(claimsKey);
  const now = new Date();
  const toRemove: string[] = [];
  const engineerFiles = new Map<string, string[]>();

  for (const [filePath, data] of Object.entries(allClaims)) {
    try {
      const claim = deserializeClaim(filePath, data);
      if (claim.expiresAt && claim.expiresAt < now) {
        toRemove.push(filePath);
        const existing = engineerFiles.get(claim.engineerId) ?? [];
        existing.push(filePath);
        engineerFiles.set(claim.engineerId, existing);
      }
    } catch {
      toRemove.push(filePath);
    }
  }

  if (toRemove.length > 0) {
    const pipeline = redis.pipeline();
    pipeline.hdel(claimsKey, ...toRemove);
    for (const [engineerId, files] of engineerFiles.entries()) {
      pipeline.srem(KEYS.engineerClaims(engineerId, projectId), ...files);
    }
    await pipeline.exec();
  }

  return { removed: toRemove };
}
