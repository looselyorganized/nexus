import { getRedis } from './client';
import { logger } from '../lib/logger';

const SESSION_HEARTBEAT_PREFIX = 'session:heartbeat:';
const HEARTBEAT_TTL_SECONDS = 120;

export async function updateSessionHeartbeat(sessionId: string): Promise<void> {
  const redis = getRedis();
  await redis.set(
    `${SESSION_HEARTBEAT_PREFIX}${sessionId}`,
    Date.now().toString(),
    'EX',
    HEARTBEAT_TTL_SECONDS
  );
}

export async function getSessionHeartbeat(sessionId: string): Promise<number | null> {
  const redis = getRedis();
  const value = await redis.get(`${SESSION_HEARTBEAT_PREFIX}${sessionId}`);
  return value ? parseInt(value, 10) : null;
}

export async function isSessionAlive(sessionId: string): Promise<boolean> {
  const redis = getRedis();
  return (await redis.exists(`${SESSION_HEARTBEAT_PREFIX}${sessionId}`)) === 1;
}

export async function removeSessionHeartbeat(sessionId: string): Promise<void> {
  const redis = getRedis();
  await redis.del(`${SESSION_HEARTBEAT_PREFIX}${sessionId}`);
}

export async function getAllActiveSessionIds(): Promise<string[]> {
  const redis = getRedis();
  const sessionIds: string[] = [];
  let cursor = '0';
  do {
    const [nextCursor, keys] = await redis.scan(
      cursor, 'MATCH', `${SESSION_HEARTBEAT_PREFIX}*`, 'COUNT', 100
    );
    cursor = nextCursor;
    for (const key of keys) {
      sessionIds.push(key.replace(SESSION_HEARTBEAT_PREFIX, ''));
    }
  } while (cursor !== '0');
  return sessionIds;
}

export async function syncHeartbeatsToDb(
  updateDbHeartbeats: (updates: Array<{ sessionId: string; lastHeartbeat: Date }>) => Promise<number>
): Promise<{ synced: number; total: number }> {
  const sessionIds = await getAllActiveSessionIds();
  if (sessionIds.length === 0) return { synced: 0, total: 0 };

  const redis = getRedis();
  const keys = sessionIds.map((id) => `${SESSION_HEARTBEAT_PREFIX}${id}`);
  const values = await redis.mget(...keys);

  const updates: Array<{ sessionId: string; lastHeartbeat: Date }> = [];
  for (let i = 0; i < sessionIds.length; i++) {
    const value = values[i];
    if (value) {
      updates.push({ sessionId: sessionIds[i]!, lastHeartbeat: new Date(parseInt(value, 10)) });
    }
  }

  if (updates.length === 0) return { synced: 0, total: sessionIds.length };
  const synced = await updateDbHeartbeats(updates);

  logger.debug({ synced, total: sessionIds.length }, 'Synced heartbeats from Redis to DB');
  return { synced, total: sessionIds.length };
}
