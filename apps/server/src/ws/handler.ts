import type { ServerWebSocket } from 'bun';
import { WsCloseCodes, type ClientMessage } from '@nexus/shared';
import { verifyApiKey, extractApiKey } from '../middleware/auth';
import {
  addConnection,
  removeConnection,
  getConnection,
  generateConnectionId,
  joinProjectRoom,
  leaveProjectRoom,
  type ConnectionData,
} from './connections';
import {
  parseClientMessage,
  serializeServerEvent,
  createErrorEvent,
  createConnectedEvent,
  createJoinedEvent,
  createLeftEvent,
} from './messages';
import { getOrCreateSession, updateHeartbeat } from '../services/session.service';
import { broadcastToProject, subscribeToProjectIfNeeded } from './broadcast';
import { logger } from '../lib/logger';
import { db } from '../db/connection';
import { projectMembers, engineers as engineersTable } from '../db/schema';
import { eq, and } from 'drizzle-orm';

export const websocketHandler = {
  async upgrade(request: Request): Promise<{
    success: boolean;
    data?: ConnectionData;
    error?: { code: number; message: string };
  }> {
    const authHeader = request.headers.get('Authorization');
    const apiKey = extractApiKey(authHeader ?? undefined);

    if (!apiKey) {
      return { success: false, error: { code: WsCloseCodes.UNAUTHORIZED, message: 'API key required' } };
    }

    const engineer = await verifyApiKey(apiKey);
    if (!engineer) {
      return { success: false, error: { code: WsCloseCodes.UNAUTHORIZED, message: 'Invalid API key' } };
    }

    return {
      success: true,
      data: {
        connectionId: generateConnectionId(),
        engineerId: engineer.id,
        engineerName: engineer.name,
      },
    };
  },

  onOpen(ws: ServerWebSocket<ConnectionData>): void {
    const { connectionId, engineerId, engineerName } = ws.data;
    addConnection(connectionId, ws, engineerId, engineerName);
    ws.send(serializeServerEvent(createConnectedEvent(connectionId)));
    logger.info({ connectionId, engineerId }, 'WebSocket connected');
  },

  async onMessage(ws: ServerWebSocket<ConnectionData>, message: string): Promise<void> {
    const { connectionId } = ws.data;
    const connection = getConnection(connectionId);
    if (!connection) {
      ws.send(serializeServerEvent(createErrorEvent('CONNECTION_NOT_FOUND', 'Connection not registered')));
      return;
    }

    const result = parseClientMessage(message);
    if (!result.success) {
      ws.send(serializeServerEvent(createErrorEvent('INVALID_MESSAGE', result.error)));
      return;
    }

    await handleMessage(ws, connection.engineerId, connection.engineerName, result.data);
  },

  async onClose(ws: ServerWebSocket<ConnectionData>): Promise<void> {
    const { connectionId, engineerId } = ws.data;
    const connection = removeConnection(connectionId);
    if (!connection) return;

    logger.info({ connectionId }, 'WebSocket closed');

    if (connection.projectId) {
      await broadcastToProject(connection.projectId, 'session_ended', {
        engineerId,
        engineerName: connection.engineerName,
      });
    }
  },

  onError(ws: ServerWebSocket<ConnectionData>, error: Error): void {
    logger.error({ connectionId: ws.data.connectionId, err: error }, 'WebSocket error');
  },
};

async function handleMessage(
  ws: ServerWebSocket<ConnectionData>,
  engineerId: string,
  engineerName: string,
  message: ClientMessage
): Promise<void> {
  const { connectionId } = ws.data;

  switch (message.type) {
    case 'join':
      await handleJoin(ws, connectionId, engineerId, engineerName, message.projectId);
      break;
    case 'heartbeat':
      await handleHeartbeat(connectionId);
      break;
    case 'leave':
      await handleLeave(ws, connectionId, engineerId);
      break;
  }
}

async function verifyProjectMembership(engineerId: string, projectId: string): Promise<boolean> {
  const [engineer] = await db
    .select({ role: engineersTable.role })
    .from(engineersTable)
    .where(eq(engineersTable.id, engineerId))
    .limit(1);
  if (engineer?.role === 'admin') return true;

  const [membership] = await db
    .select({ engineerId: projectMembers.engineerId })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.engineerId, engineerId)))
    .limit(1);
  return !!membership;
}

async function handleJoin(
  ws: ServerWebSocket<ConnectionData>,
  connectionId: string,
  engineerId: string,
  engineerName: string,
  projectId: string
): Promise<void> {
  const isMember = await verifyProjectMembership(engineerId, projectId);
  if (!isMember) {
    ws.send(serializeServerEvent(createErrorEvent('FORBIDDEN', 'Not a member of this project')));
    return;
  }

  const session = await getOrCreateSession(projectId, engineerId);
  joinProjectRoom(connectionId, projectId, session.id);
  await subscribeToProjectIfNeeded(projectId);

  ws.send(serializeServerEvent(createJoinedEvent(session.id, projectId)));

  await broadcastToProject(projectId, 'session_started', {
    engineerId,
    engineerName,
    sessionId: session.id,
  });

  logger.info({ engineerId, projectId, sessionId: session.id }, 'Engineer joined project');
}

async function handleHeartbeat(connectionId: string): Promise<void> {
  const connection = getConnection(connectionId);
  if (!connection?.sessionId) return;
  try {
    await updateHeartbeat(connection.sessionId);
  } catch (err) {
    logger.error({ err }, 'Heartbeat error');
  }
}

async function handleLeave(
  ws: ServerWebSocket<ConnectionData>,
  connectionId: string,
  engineerId: string
): Promise<void> {
  const connection = getConnection(connectionId);
  if (!connection?.projectId) {
    ws.send(serializeServerEvent(createErrorEvent('NOT_IN_PROJECT', 'Not in a project')));
    return;
  }

  const { projectId } = connection;
  leaveProjectRoom(connectionId, projectId);
  ws.send(serializeServerEvent(createLeftEvent(projectId)));

  await broadcastToProject(projectId, 'session_ended', { engineerId, engineerName: connection.engineerName });
  logger.info({ connectionId, projectId }, 'Left project');
}
