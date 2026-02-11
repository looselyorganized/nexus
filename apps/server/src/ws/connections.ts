import type { ServerWebSocket } from 'bun';

export interface Connection {
  id: string;
  ws: ServerWebSocket<ConnectionData>;
  engineerId: string;
  engineerName: string;
  sessionId: string | null;
  projectId: string | null;
  connectedAt: Date;
}

export interface ConnectionData {
  connectionId: string;
  engineerId: string;
  engineerName: string;
}

const connections = new Map<string, Connection>();
const projectRooms = new Map<string, Set<string>>();

export function generateConnectionId(): string {
  return crypto.randomUUID();
}

export function addConnection(
  id: string,
  ws: ServerWebSocket<ConnectionData>,
  engineerId: string,
  engineerName: string
): Connection {
  const connection: Connection = {
    id, ws, engineerId, engineerName,
    sessionId: null, projectId: null,
    connectedAt: new Date(),
  };
  connections.set(id, connection);
  return connection;
}

export function getConnection(id: string): Connection | undefined {
  return connections.get(id);
}

export function removeConnection(id: string): Connection | undefined {
  const connection = connections.get(id);
  if (!connection) return undefined;
  if (connection.projectId) {
    leaveProjectRoom(id, connection.projectId);
  }
  connections.delete(id);
  return connection;
}

export function joinProjectRoom(connectionId: string, projectId: string, sessionId: string): boolean {
  const connection = connections.get(connectionId);
  if (!connection) return false;

  if (connection.projectId && connection.projectId !== projectId) {
    leaveProjectRoom(connectionId, connection.projectId);
  }

  connection.projectId = projectId;
  connection.sessionId = sessionId;

  let room = projectRooms.get(projectId);
  if (!room) {
    room = new Set();
    projectRooms.set(projectId, room);
  }
  room.add(connectionId);
  return true;
}

export function leaveProjectRoom(connectionId: string, projectId: string): void {
  const room = projectRooms.get(projectId);
  if (room) {
    room.delete(connectionId);
    if (room.size === 0) projectRooms.delete(projectId);
  }
  const connection = connections.get(connectionId);
  if (connection && connection.projectId === projectId) {
    connection.projectId = null;
    connection.sessionId = null;
  }
}

export function getProjectConnections(projectId: string): Connection[] {
  const room = projectRooms.get(projectId);
  if (!room) return [];
  const result: Connection[] = [];
  for (const id of room) {
    const conn = connections.get(id);
    if (conn) result.push(conn);
  }
  return result;
}

export function hasProjectConnections(projectId: string): boolean {
  const room = projectRooms.get(projectId);
  return room !== undefined && room.size > 0;
}

export function getTotalConnectionCount(): number {
  return connections.size;
}

export function getAllConnections(): Connection[] {
  return Array.from(connections.values());
}

export function clearAllConnections(): void {
  connections.clear();
  projectRooms.clear();
}
