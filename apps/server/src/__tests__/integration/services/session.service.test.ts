import { describe, it, expect, beforeEach } from 'bun:test';
import {
  truncateAll,
  flushTestRedis,
  seedEngineer,
  seedProject,
  seedSession,
} from '../../setup/test-helpers';
import {
  getOrCreateSession,
  disconnectSession,
  getActiveSessions,
  cleanupStaleSessions,
  batchUpdateHeartbeats,
} from '../../../services/session.service';
import { NotFoundError } from '../../../lib/errors';
import {
  updateSessionHeartbeat,
  removeSessionHeartbeat,
} from '../../../redis/sessions';

let engineer: { id: string; name: string; email: string };
let project: { id: string; slug: string };

beforeEach(async () => {
  await truncateAll();
  await flushTestRedis();
  const seed = await seedEngineer();
  engineer = seed.engineer;
  project = await seedProject(engineer.id);
});

// ─── getOrCreateSession ───

describe('getOrCreateSession', () => {
  it('creates new session with active status', async () => {
    const session = await getOrCreateSession(project.id, engineer.id);

    expect(session.status).toBe('active');
    expect(session.projectId).toBe(project.id);
    expect(session.engineerId).toBe(engineer.id);
    expect(session.id).toBeTruthy();
  });

  it('returns existing active session (no duplicate)', async () => {
    const first = await getOrCreateSession(project.id, engineer.id);
    const second = await getOrCreateSession(project.id, engineer.id);

    expect(second.id).toBe(first.id);
  });

  it('updates heartbeat on existing session', async () => {
    const first = await getOrCreateSession(project.id, engineer.id);
    const firstHeartbeat = first.lastHeartbeat;

    await new Promise((r) => setTimeout(r, 10));

    const second = await getOrCreateSession(project.id, engineer.id);

    expect(second.id).toBe(first.id);
    expect(second.lastHeartbeat.getTime()).toBeGreaterThanOrEqual(firstHeartbeat.getTime());
  });
});

// ─── disconnectSession ───

describe('disconnectSession', () => {
  it('sets status to disconnected and removes Redis heartbeat', async () => {
    const session = await getOrCreateSession(project.id, engineer.id);

    const disconnected = await disconnectSession(session.id);

    expect(disconnected.status).toBe('disconnected');

    // Verify Redis heartbeat is removed
    const { getSessionHeartbeat } = await import('../../../redis/sessions');
    const heartbeat = await getSessionHeartbeat(session.id);
    expect(heartbeat).toBeNull();
  });

  it('throws NotFoundError for unknown session', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    expect(disconnectSession(fakeId)).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ─── getActiveSessions ───

describe('getActiveSessions', () => {
  it('returns active sessions with engineer info', async () => {
    await getOrCreateSession(project.id, engineer.id);

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
    await getOrCreateSession(project.id, engineer2.id);

    const sessions = await getActiveSessions(project.id);

    expect(sessions.length).toBe(2);
    const engineerIds = sessions.map((s) => s.engineer.id).sort();
    expect(engineerIds).toContain(engineer.id);
    expect(engineerIds).toContain(engineer2.id);
    sessions.forEach((s) => {
      expect(s.engineer.name).toBeTruthy();
      expect(s.engineer.email).toBeTruthy();
    });
  });
});

// ─── cleanupStaleSessions ───

describe('cleanupStaleSessions', () => {
  it('marks sessions without Redis heartbeat as disconnected', async () => {
    const session = await getOrCreateSession(project.id, engineer.id);

    // Remove the Redis heartbeat to simulate staleness
    await removeSessionHeartbeat(session.id);

    const result = await cleanupStaleSessions();

    expect(result.disconnected).toBe(1);

    // Verify session is now disconnected
    const { db } = await import('../../../db/connection');
    const { sessions } = await import('../../../db/schema');
    const { eq } = await import('drizzle-orm');
    const [updated] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, session.id))
      .limit(1);

    expect(updated!.status).toBe('disconnected');
  });

  it('keeps sessions with Redis heartbeat', async () => {
    const session = await getOrCreateSession(project.id, engineer.id);
    // Heartbeat already set by getOrCreateSession

    const result = await cleanupStaleSessions();

    expect(result.disconnected).toBe(0);

    const { db } = await import('../../../db/connection');
    const { sessions } = await import('../../../db/schema');
    const { eq } = await import('drizzle-orm');
    const [found] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, session.id))
      .limit(1);

    expect(found!.status).toBe('active');
  });
});

// ─── batchUpdateHeartbeats ───

describe('batchUpdateHeartbeats', () => {
  it('updates heartbeats in DB for active sessions', async () => {
    const session = await getOrCreateSession(project.id, engineer.id);
    const newHeartbeat = new Date(Date.now() + 5000);

    const updated = await batchUpdateHeartbeats([
      { sessionId: session.id, lastHeartbeat: newHeartbeat },
    ]);

    expect(updated).toBe(1);

    // Verify heartbeat was updated
    const { db } = await import('../../../db/connection');
    const { sessions } = await import('../../../db/schema');
    const { eq } = await import('drizzle-orm');
    const [found] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, session.id))
      .limit(1);

    // The DB heartbeat should be updated (at least as recent as newHeartbeat)
    expect(found!.lastHeartbeat.getTime()).toBeGreaterThanOrEqual(newHeartbeat.getTime() - 1000);
  });

  it('returns 0 when updates array is empty', async () => {
    const updated = await batchUpdateHeartbeats([]);
    expect(updated).toBe(0);
  });
});
