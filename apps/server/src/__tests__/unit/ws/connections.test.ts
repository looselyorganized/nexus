import { describe, it, expect, beforeEach } from 'bun:test';
import {
  generateConnectionId,
  addConnection,
  getConnection,
  removeConnection,
  joinProjectRoom,
  leaveProjectRoom,
  getProjectConnections,
  hasProjectConnections,
  getTotalConnectionCount,
  getAllConnections,
  clearAllConnections,
} from '../../../ws/connections';

const mockWs = {} as any;

beforeEach(() => {
  clearAllConnections();
});

describe('generateConnectionId', () => {
  it('returns a string', () => {
    const id = generateConnectionId();
    expect(typeof id).toBe('string');
  });

  it('returns a value that looks like a UUID', () => {
    const id = generateConnectionId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('returns unique values across successive calls', () => {
    const id1 = generateConnectionId();
    const id2 = generateConnectionId();
    const id3 = generateConnectionId();
    expect(id1).not.toBe(id2);
    expect(id2).not.toBe(id3);
    expect(id1).not.toBe(id3);
  });
});

describe('addConnection', () => {
  it('stores a connection that can be retrieved', () => {
    const conn = addConnection('conn-1', mockWs, 'eng-1', 'Alice');
    expect(conn.id).toBe('conn-1');
    expect(getConnection('conn-1')).toBe(conn);
  });

  it('sets sessionId to null initially', () => {
    const conn = addConnection('conn-2', mockWs, 'eng-2', 'Bob');
    expect(conn.sessionId).toBeNull();
  });

  it('sets projectId to null initially', () => {
    const conn = addConnection('conn-3', mockWs, 'eng-3', 'Charlie');
    expect(conn.projectId).toBeNull();
  });

  it('stores engineerId and engineerName correctly', () => {
    const conn = addConnection('conn-4', mockWs, 'eng-4', 'Dana');
    expect(conn.engineerId).toBe('eng-4');
    expect(conn.engineerName).toBe('Dana');
  });

  it('sets connectedAt to a Date', () => {
    const conn = addConnection('conn-5', mockWs, 'eng-5', 'Eve');
    expect(conn.connectedAt).toBeInstanceOf(Date);
  });
});

describe('getConnection', () => {
  it('returns the connection for a known id', () => {
    addConnection('known-id', mockWs, 'eng-1', 'Alice');
    const conn = getConnection('known-id');
    expect(conn).toBeDefined();
    expect(conn!.id).toBe('known-id');
  });

  it('returns undefined for an unknown id', () => {
    const conn = getConnection('does-not-exist');
    expect(conn).toBeUndefined();
  });
});

describe('removeConnection', () => {
  it('removes the connection from the map', () => {
    addConnection('rm-1', mockWs, 'eng-1', 'Alice');
    removeConnection('rm-1');
    expect(getConnection('rm-1')).toBeUndefined();
  });

  it('returns the removed connection', () => {
    addConnection('rm-2', mockWs, 'eng-2', 'Bob');
    const removed = removeConnection('rm-2');
    expect(removed).toBeDefined();
    expect(removed!.id).toBe('rm-2');
  });

  it('returns undefined for an unknown id', () => {
    const removed = removeConnection('no-such-id');
    expect(removed).toBeUndefined();
  });

  it('auto-leaves the project room if the connection was in one', () => {
    addConnection('rm-3', mockWs, 'eng-3', 'Charlie');
    joinProjectRoom('rm-3', 'project-A', 'session-A');
    expect(hasProjectConnections('project-A')).toBe(true);

    removeConnection('rm-3');
    expect(hasProjectConnections('project-A')).toBe(false);
  });
});

describe('joinProjectRoom', () => {
  it('returns true for a valid connection', () => {
    addConnection('jp-1', mockWs, 'eng-1', 'Alice');
    const result = joinProjectRoom('jp-1', 'project-1', 'session-1');
    expect(result).toBe(true);
  });

  it('sets projectId on the connection', () => {
    addConnection('jp-2', mockWs, 'eng-2', 'Bob');
    joinProjectRoom('jp-2', 'project-2', 'session-2');
    const conn = getConnection('jp-2');
    expect(conn!.projectId).toBe('project-2');
  });

  it('sets sessionId on the connection', () => {
    addConnection('jp-3', mockWs, 'eng-3', 'Charlie');
    joinProjectRoom('jp-3', 'project-3', 'session-3');
    const conn = getConnection('jp-3');
    expect(conn!.sessionId).toBe('session-3');
  });

  it('returns false for an unknown connectionId', () => {
    const result = joinProjectRoom('ghost', 'project-1', 'session-1');
    expect(result).toBe(false);
  });

  it('auto-leaves the previous room when joining a different project', () => {
    addConnection('jp-4', mockWs, 'eng-4', 'Dana');
    joinProjectRoom('jp-4', 'project-old', 'session-old');
    expect(hasProjectConnections('project-old')).toBe(true);

    joinProjectRoom('jp-4', 'project-new', 'session-new');
    expect(hasProjectConnections('project-old')).toBe(false);
    expect(hasProjectConnections('project-new')).toBe(true);

    const conn = getConnection('jp-4');
    expect(conn!.projectId).toBe('project-new');
    expect(conn!.sessionId).toBe('session-new');
  });

  it('does not leave the room when re-joining the same project', () => {
    addConnection('jp-5', mockWs, 'eng-5', 'Eve');
    joinProjectRoom('jp-5', 'project-same', 'session-1');
    joinProjectRoom('jp-5', 'project-same', 'session-2');

    expect(hasProjectConnections('project-same')).toBe(true);
    const conns = getProjectConnections('project-same');
    expect(conns.length).toBe(1);
  });
});

describe('leaveProjectRoom', () => {
  it('removes the connection from the room', () => {
    addConnection('lp-1', mockWs, 'eng-1', 'Alice');
    joinProjectRoom('lp-1', 'project-1', 'session-1');
    leaveProjectRoom('lp-1', 'project-1');
    expect(hasProjectConnections('project-1')).toBe(false);
  });

  it('clears projectId and sessionId on the connection', () => {
    addConnection('lp-2', mockWs, 'eng-2', 'Bob');
    joinProjectRoom('lp-2', 'project-2', 'session-2');
    leaveProjectRoom('lp-2', 'project-2');

    const conn = getConnection('lp-2');
    expect(conn!.projectId).toBeNull();
    expect(conn!.sessionId).toBeNull();
  });

  it('deletes the room from the map when the last connection leaves', () => {
    addConnection('lp-3', mockWs, 'eng-3', 'Charlie');
    joinProjectRoom('lp-3', 'project-3', 'session-3');
    leaveProjectRoom('lp-3', 'project-3');

    // Verify the room is fully cleaned up by checking getProjectConnections
    expect(getProjectConnections('project-3')).toEqual([]);
  });

  it('does not affect other connections in the same room', () => {
    addConnection('lp-4a', mockWs, 'eng-4', 'Dana');
    addConnection('lp-4b', mockWs, 'eng-5', 'Eve');
    joinProjectRoom('lp-4a', 'project-4', 'session-4a');
    joinProjectRoom('lp-4b', 'project-4', 'session-4b');

    leaveProjectRoom('lp-4a', 'project-4');
    expect(hasProjectConnections('project-4')).toBe(true);

    const remaining = getProjectConnections('project-4');
    expect(remaining.length).toBe(1);
    expect(remaining[0]!.id).toBe('lp-4b');
  });
});

describe('getProjectConnections', () => {
  it('returns all connections in a room', () => {
    addConnection('gpc-1', mockWs, 'eng-1', 'Alice');
    addConnection('gpc-2', mockWs, 'eng-2', 'Bob');
    joinProjectRoom('gpc-1', 'project-x', 'session-1');
    joinProjectRoom('gpc-2', 'project-x', 'session-2');

    const conns = getProjectConnections('project-x');
    expect(conns.length).toBe(2);
    const ids = conns.map((c) => c.id).sort();
    expect(ids).toEqual(['gpc-1', 'gpc-2']);
  });

  it('returns empty array for unknown project', () => {
    expect(getProjectConnections('no-such-project')).toEqual([]);
  });
});

describe('hasProjectConnections', () => {
  it('returns true when a project has connections', () => {
    addConnection('hpc-1', mockWs, 'eng-1', 'Alice');
    joinProjectRoom('hpc-1', 'project-yes', 'session-1');
    expect(hasProjectConnections('project-yes')).toBe(true);
  });

  it('returns false when the project has no connections', () => {
    addConnection('hpc-2', mockWs, 'eng-2', 'Bob');
    joinProjectRoom('hpc-2', 'project-temp', 'session-2');
    leaveProjectRoom('hpc-2', 'project-temp');
    expect(hasProjectConnections('project-temp')).toBe(false);
  });

  it('returns false for an unknown project', () => {
    expect(hasProjectConnections('unknown-project')).toBe(false);
  });
});

describe('getTotalConnectionCount', () => {
  it('returns 0 when no connections exist', () => {
    expect(getTotalConnectionCount()).toBe(0);
  });

  it('reflects the number of added connections', () => {
    addConnection('tc-1', mockWs, 'eng-1', 'Alice');
    addConnection('tc-2', mockWs, 'eng-2', 'Bob');
    expect(getTotalConnectionCount()).toBe(2);
  });

  it('decrements after a removal', () => {
    addConnection('tc-3', mockWs, 'eng-3', 'Charlie');
    addConnection('tc-4', mockWs, 'eng-4', 'Dana');
    removeConnection('tc-3');
    expect(getTotalConnectionCount()).toBe(1);
  });
});

describe('getAllConnections', () => {
  it('returns an empty array when no connections exist', () => {
    expect(getAllConnections()).toEqual([]);
  });

  it('returns all stored connections', () => {
    addConnection('all-1', mockWs, 'eng-1', 'Alice');
    addConnection('all-2', mockWs, 'eng-2', 'Bob');
    const all = getAllConnections();
    expect(all.length).toBe(2);
    const ids = all.map((c) => c.id).sort();
    expect(ids).toEqual(['all-1', 'all-2']);
  });
});

describe('clearAllConnections', () => {
  it('empties all connections', () => {
    addConnection('cl-1', mockWs, 'eng-1', 'Alice');
    addConnection('cl-2', mockWs, 'eng-2', 'Bob');
    clearAllConnections();
    expect(getTotalConnectionCount()).toBe(0);
    expect(getAllConnections()).toEqual([]);
  });

  it('empties all project rooms', () => {
    addConnection('cl-3', mockWs, 'eng-3', 'Charlie');
    joinProjectRoom('cl-3', 'project-clear', 'session-clear');
    clearAllConnections();
    expect(hasProjectConnections('project-clear')).toBe(false);
    expect(getProjectConnections('project-clear')).toEqual([]);
  });
});
