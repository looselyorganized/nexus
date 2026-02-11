import { describe, it, expect, beforeEach } from 'bun:test';
import { truncateAll, flushTestRedis } from '../../setup/test-helpers';
import {
  updateSessionHeartbeat,
  getSessionHeartbeat,
  isSessionAlive,
  removeSessionHeartbeat,
  getAllActiveSessionIds,
  syncHeartbeatsToDb,
} from '../../../redis/sessions';
import { getRedis } from '../../../redis/client';

beforeEach(async () => {
  await flushTestRedis();
  // Also clean up any session:heartbeat:* keys from DB 0 (where getRedis() connects)
  const redis = getRedis();
  let cursor = '0';
  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'session:heartbeat:*', 'COUNT', 200);
    cursor = nextCursor;
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } while (cursor !== '0');
});

// ─── updateSessionHeartbeat ───────────────────────────────────────────────────

describe('updateSessionHeartbeat', () => {
  it('stores a timestamp for the session', async () => {
    const sessionId = crypto.randomUUID();
    const before = Date.now();

    await updateSessionHeartbeat(sessionId);

    const heartbeat = await getSessionHeartbeat(sessionId);
    expect(heartbeat).not.toBeNull();
    expect(heartbeat!).toBeGreaterThanOrEqual(before);
    expect(heartbeat!).toBeLessThanOrEqual(Date.now());
  });

  it('sets a TTL on the key (~120 seconds)', async () => {
    const sessionId = crypto.randomUUID();
    await updateSessionHeartbeat(sessionId);

    const redis = getRedis();
    const ttl = await redis.ttl(`session:heartbeat:${sessionId}`);

    // TTL should be approximately 120 seconds (allow some tolerance)
    expect(ttl).toBeGreaterThan(110);
    expect(ttl).toBeLessThanOrEqual(120);
  });

  it('overwrites the previous heartbeat on subsequent calls', async () => {
    const sessionId = crypto.randomUUID();

    await updateSessionHeartbeat(sessionId);
    const first = await getSessionHeartbeat(sessionId);

    await Bun.sleep(50);

    await updateSessionHeartbeat(sessionId);
    const second = await getSessionHeartbeat(sessionId);

    expect(second!).toBeGreaterThanOrEqual(first!);
  });
});

// ─── getSessionHeartbeat ──────────────────────────────────────────────────────

describe('getSessionHeartbeat', () => {
  it('returns the heartbeat timestamp as a number', async () => {
    const sessionId = crypto.randomUUID();
    await updateSessionHeartbeat(sessionId);

    const heartbeat = await getSessionHeartbeat(sessionId);

    expect(typeof heartbeat).toBe('number');
    expect(heartbeat).not.toBeNaN();
  });

  it('returns null for an unknown session', async () => {
    const heartbeat = await getSessionHeartbeat(crypto.randomUUID());
    expect(heartbeat).toBeNull();
  });
});

// ─── isSessionAlive ───────────────────────────────────────────────────────────

describe('isSessionAlive', () => {
  it('returns true after a heartbeat has been set', async () => {
    const sessionId = crypto.randomUUID();
    await updateSessionHeartbeat(sessionId);

    const alive = await isSessionAlive(sessionId);
    expect(alive).toBe(true);
  });

  it('returns false for an unknown session', async () => {
    const alive = await isSessionAlive(crypto.randomUUID());
    expect(alive).toBe(false);
  });

  it('returns false after the heartbeat has been removed', async () => {
    const sessionId = crypto.randomUUID();
    await updateSessionHeartbeat(sessionId);
    await removeSessionHeartbeat(sessionId);

    const alive = await isSessionAlive(sessionId);
    expect(alive).toBe(false);
  });
});

// ─── removeSessionHeartbeat ───────────────────────────────────────────────────

describe('removeSessionHeartbeat', () => {
  it('removes the heartbeat key from Redis', async () => {
    const sessionId = crypto.randomUUID();
    await updateSessionHeartbeat(sessionId);

    await removeSessionHeartbeat(sessionId);

    const heartbeat = await getSessionHeartbeat(sessionId);
    expect(heartbeat).toBeNull();
  });

  it('does not throw when removing a nonexistent session', async () => {
    // Should complete without error
    await removeSessionHeartbeat(crypto.randomUUID());
  });
});

// ─── getAllActiveSessionIds ───────────────────────────────────────────────────

describe('getAllActiveSessionIds', () => {
  it('returns all session IDs that have heartbeats', async () => {
    const session1 = crypto.randomUUID();
    const session2 = crypto.randomUUID();
    const session3 = crypto.randomUUID();

    await updateSessionHeartbeat(session1);
    await updateSessionHeartbeat(session2);
    await updateSessionHeartbeat(session3);

    const activeIds = await getAllActiveSessionIds();

    expect(activeIds).toContain(session1);
    expect(activeIds).toContain(session2);
    expect(activeIds).toContain(session3);
    expect(activeIds.length).toBeGreaterThanOrEqual(3);
  });

  it('returns empty array when no heartbeats exist', async () => {
    const activeIds = await getAllActiveSessionIds();
    expect(activeIds).toEqual([]);
  });

  it('does not include removed sessions', async () => {
    const alive = crypto.randomUUID();
    const removed = crypto.randomUUID();

    await updateSessionHeartbeat(alive);
    await updateSessionHeartbeat(removed);
    await removeSessionHeartbeat(removed);

    const activeIds = await getAllActiveSessionIds();

    expect(activeIds).toContain(alive);
    expect(activeIds).not.toContain(removed);
  });
});

// ─── syncHeartbeatsToDb ──────────────────────────────────────────────────────

describe('syncHeartbeatsToDb', () => {
  it('calls the callback with correct session updates', async () => {
    const session1 = crypto.randomUUID();
    const session2 = crypto.randomUUID();

    await updateSessionHeartbeat(session1);
    await updateSessionHeartbeat(session2);

    let receivedUpdates: Array<{ sessionId: string; lastHeartbeat: Date }> = [];
    const mockUpdate = async (updates: Array<{ sessionId: string; lastHeartbeat: Date }>) => {
      receivedUpdates = updates;
      return updates.length;
    };

    const result = await syncHeartbeatsToDb(mockUpdate);

    // Find our test sessions in the received updates
    const ourUpdates = receivedUpdates.filter(
      (u) => u.sessionId === session1 || u.sessionId === session2
    );
    expect(ourUpdates).toHaveLength(2);

    for (const update of ourUpdates) {
      expect(update.lastHeartbeat).toBeInstanceOf(Date);
      // lastHeartbeat should be recent (within 5 seconds)
      const diff = Date.now() - update.lastHeartbeat.getTime();
      expect(diff).toBeLessThan(5_000);
    }

    expect(result.synced).toBeGreaterThanOrEqual(2);
    expect(result.total).toBeGreaterThanOrEqual(2);
  });

  it('returns synced and total counts matching session count', async () => {
    const session1 = crypto.randomUUID();
    const session2 = crypto.randomUUID();
    const session3 = crypto.randomUUID();

    await updateSessionHeartbeat(session1);
    await updateSessionHeartbeat(session2);
    await updateSessionHeartbeat(session3);

    const mockUpdate = async (updates: Array<{ sessionId: string; lastHeartbeat: Date }>) =>
      updates.length;

    const result = await syncHeartbeatsToDb(mockUpdate);

    expect(result.synced).toBeGreaterThanOrEqual(3);
    expect(result.total).toBeGreaterThanOrEqual(3);
    expect(result.synced).toBe(result.total);
  });

  it('returns zeros when no heartbeats exist', async () => {
    const mockUpdate = async (updates: Array<{ sessionId: string; lastHeartbeat: Date }>) =>
      updates.length;

    const result = await syncHeartbeatsToDb(mockUpdate);

    expect(result).toEqual({ synced: 0, total: 0 });
  });

  it('passes the callback return value as the synced count', async () => {
    const sessionId = crypto.randomUUID();
    await updateSessionHeartbeat(sessionId);

    // Mock that returns a fixed number regardless of input
    const mockUpdate = async (_updates: Array<{ sessionId: string; lastHeartbeat: Date }>) => 42;

    const result = await syncHeartbeatsToDb(mockUpdate);

    expect(result.synced).toBe(42);
    expect(result.total).toBeGreaterThanOrEqual(1);
  });
});
