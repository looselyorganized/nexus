import type { ServerEvent, ServerEventType, BroadcastEvent } from '@nexus/shared';
import { getProjectConnections, hasProjectConnections } from './connections';
import { serializeServerEvent } from './messages';
import { publish, subscribe, onMessage } from '../redis/pubsub';
import { logger } from '../lib/logger';

/**
 * Broadcast event to all connections in a project (local + Redis)
 */
export async function broadcastToProject<T>(
  projectId: string,
  type: ServerEventType,
  payload: T
): Promise<void> {
  const event: ServerEvent = { type, ...payload as any };
  sendToLocalConnections(projectId, event);
  await publish(projectId, type, payload);
}

function sendToLocalConnections(projectId: string, event: ServerEvent): void {
  const connections = getProjectConnections(projectId);
  const message = serializeServerEvent(event);
  for (const conn of connections) {
    try {
      conn.ws.send(message);
    } catch (err) {
      logger.error({ err, connectionId: conn.id }, 'Error sending to connection');
    }
  }
}

function handleRemoteEvent(_channel: string, event: BroadcastEvent): void {
  if (!hasProjectConnections(event.projectId)) return;
  const serverEvent: ServerEvent = { type: event.type, ...event.payload as any };
  sendToLocalConnections(event.projectId, serverEvent);
}

/**
 * Subscribe to project channel if we have connections
 */
export async function subscribeToProjectIfNeeded(projectId: string): Promise<void> {
  if (hasProjectConnections(projectId)) {
    await subscribe(projectId);
  }
}

let cleanupHandler: (() => void) | null = null;

export function initBroadcast(): void {
  cleanupHandler = onMessage(handleRemoteEvent);
  logger.info('Broadcast system initialized');
}

export function cleanupBroadcast(): void {
  if (cleanupHandler) {
    cleanupHandler();
    cleanupHandler = null;
  }
}
