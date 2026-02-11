import { describe, it, expect, beforeEach } from 'bun:test';
import {
  truncateAll,
  flushTestRedis,
  seedEngineer,
  seedProject,
} from '../../setup/test-helpers';
import { websocketHandler } from '../../../ws/handler';
import {
  clearAllConnections,
  getConnection,
  getProjectConnections,
  type ConnectionData,
} from '../../../ws/connections';

// ─── Mock ServerWebSocket ───

function createMockWs(data: ConnectionData): any {
  const sent: string[] = [];
  return {
    data,
    send: (msg: string) => {
      sent.push(msg);
    },
    close: () => {},
    _sent: sent,
  };
}

function parseSent(ws: any): any[] {
  return ws._sent.map((s: string) => JSON.parse(s));
}

beforeEach(async () => {
  await truncateAll();
  await flushTestRedis();
  clearAllConnections();
});

// ─── upgrade() ───

describe('websocketHandler.upgrade', () => {
  it('succeeds with a valid API key', async () => {
    const { apiKey } = await seedEngineer({ name: 'Upgrader' });

    const req = new Request('ws://localhost/ws', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    const result = await websocketHandler.upgrade(req);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.engineerId).toBeTruthy();
    expect(result.data!.connectionId).toBeTruthy();
    expect(result.data!.engineerName).toBe('Upgrader');
  });

  it('fails without an Authorization header', async () => {
    const req = new Request('ws://localhost/ws');
    const result = await websocketHandler.upgrade(req);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error!.message).toBe('API key required');
  });

  it('fails with an invalid API key', async () => {
    const req = new Request('ws://localhost/ws', {
      headers: { Authorization: 'Bearer nexus_eng_invalidkey000000000000000000000000000000000000000000000000' },
    });

    const result = await websocketHandler.upgrade(req);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error!.message).toBe('Invalid API key');
  });
});

// ─── onOpen() ───

describe('websocketHandler.onOpen', () => {
  it('adds connection to registry and sends connected event', async () => {
    const { engineer } = await seedEngineer({ name: 'Opener' });

    const data: ConnectionData = {
      connectionId: crypto.randomUUID(),
      engineerId: engineer.id,
      engineerName: 'Opener',
    };
    const ws = createMockWs(data);

    websocketHandler.onOpen(ws);

    // Connection should be in registry
    const conn = getConnection(data.connectionId);
    expect(conn).toBeDefined();
    expect(conn!.engineerId).toBe(engineer.id);

    // Should have sent 'connected' event
    const events = parseSent(ws);
    expect(events.length).toBe(1);
    expect(events[0].type).toBe('connected');
    expect(events[0].connectionId).toBe(data.connectionId);
  });
});

// ─── onMessage() ───

describe('websocketHandler.onMessage', () => {
  it('join: requires membership, creates session, sends joined event', async () => {
    const { engineer } = await seedEngineer({ name: 'Joiner' });
    const project = await seedProject(engineer.id);

    const data: ConnectionData = {
      connectionId: crypto.randomUUID(),
      engineerId: engineer.id,
      engineerName: 'Joiner',
    };
    const ws = createMockWs(data);

    // Register the connection first
    websocketHandler.onOpen(ws);
    ws._sent.length = 0; // clear connected event

    // Send join message
    const joinMsg = JSON.stringify({ type: 'join', projectId: project.id });
    await websocketHandler.onMessage(ws, joinMsg);

    const events = parseSent(ws);
    // Should receive 'joined' event
    const joinedEvent = events.find((e: any) => e.type === 'joined');
    expect(joinedEvent).toBeDefined();
    expect(joinedEvent.projectId).toBe(project.id);
    expect(joinedEvent.sessionId).toBeTruthy();
  });

  it('heartbeat: updates heartbeat without error', async () => {
    const { engineer } = await seedEngineer({ name: 'Heartbeater' });
    const project = await seedProject(engineer.id);

    const data: ConnectionData = {
      connectionId: crypto.randomUUID(),
      engineerId: engineer.id,
      engineerName: 'Heartbeater',
    };
    const ws = createMockWs(data);

    websocketHandler.onOpen(ws);
    ws._sent.length = 0;

    // Join first to get a session
    await websocketHandler.onMessage(ws, JSON.stringify({ type: 'join', projectId: project.id }));
    ws._sent.length = 0;

    // Send heartbeat
    await websocketHandler.onMessage(ws, JSON.stringify({ type: 'heartbeat' }));

    // Should not send any error events
    const events = parseSent(ws);
    const errors = events.filter((e: any) => e.type === 'error');
    expect(errors.length).toBe(0);
  });

  it('leave: sends left event and removes from project room', async () => {
    const { engineer } = await seedEngineer({ name: 'Leaver' });
    const project = await seedProject(engineer.id);

    const data: ConnectionData = {
      connectionId: crypto.randomUUID(),
      engineerId: engineer.id,
      engineerName: 'Leaver',
    };
    const ws = createMockWs(data);

    websocketHandler.onOpen(ws);
    await websocketHandler.onMessage(ws, JSON.stringify({ type: 'join', projectId: project.id }));
    ws._sent.length = 0;

    // Send leave
    await websocketHandler.onMessage(ws, JSON.stringify({ type: 'leave' }));

    const events = parseSent(ws);
    const leftEvent = events.find((e: any) => e.type === 'left');
    expect(leftEvent).toBeDefined();
    expect(leftEvent.projectId).toBe(project.id);

    // Should be removed from project room
    const projectConns = getProjectConnections(project.id);
    expect(projectConns.length).toBe(0);
  });

  it('invalid JSON: sends error event', async () => {
    const { engineer } = await seedEngineer({ name: 'BadJson' });

    const data: ConnectionData = {
      connectionId: crypto.randomUUID(),
      engineerId: engineer.id,
      engineerName: 'BadJson',
    };
    const ws = createMockWs(data);

    websocketHandler.onOpen(ws);
    ws._sent.length = 0;

    await websocketHandler.onMessage(ws, 'not-valid-json{{{');

    const events = parseSent(ws);
    const errorEvent = events.find((e: any) => e.type === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent.code).toBe('INVALID_MESSAGE');
  });

  it('join with non-member sends FORBIDDEN error event', async () => {
    const { engineer: owner } = await seedEngineer({ name: 'Owner' });
    const { engineer: outsider } = await seedEngineer({ name: 'Outsider' });
    const project = await seedProject(owner.id);

    const data: ConnectionData = {
      connectionId: crypto.randomUUID(),
      engineerId: outsider.id,
      engineerName: 'Outsider',
    };
    const ws = createMockWs(data);

    websocketHandler.onOpen(ws);
    ws._sent.length = 0;

    await websocketHandler.onMessage(ws, JSON.stringify({ type: 'join', projectId: project.id }));

    const events = parseSent(ws);
    const errorEvent = events.find((e: any) => e.type === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent.code).toBe('FORBIDDEN');
  });
});

// ─── onClose() ───

describe('websocketHandler.onClose', () => {
  it('removes connection from registry', async () => {
    const { engineer } = await seedEngineer({ name: 'Closer' });

    const data: ConnectionData = {
      connectionId: crypto.randomUUID(),
      engineerId: engineer.id,
      engineerName: 'Closer',
    };
    const ws = createMockWs(data);

    websocketHandler.onOpen(ws);
    expect(getConnection(data.connectionId)).toBeDefined();

    await websocketHandler.onClose(ws);
    expect(getConnection(data.connectionId)).toBeUndefined();
  });
});
