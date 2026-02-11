import { z } from 'zod';
import type { ClientMessage, ServerEvent } from '@nexus/shared';

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('join'), projectId: z.string().uuid() }),
  z.object({ type: z.literal('heartbeat') }),
  z.object({ type: z.literal('leave') }),
]);

export type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export function parseClientMessage(message: string): ParseResult<ClientMessage> {
  let data: unknown;
  try {
    data = JSON.parse(message);
  } catch {
    return { success: false, error: 'Invalid JSON' };
  }

  const result = clientMessageSchema.safeParse(data);
  if (!result.success) {
    return { success: false, error: result.error.issues.map((i) => i.message).join('; ') };
  }
  return { success: true, data: result.data };
}

export function serializeServerEvent(event: ServerEvent): string {
  return JSON.stringify(event);
}

export function createErrorEvent(code: string, message: string): ServerEvent {
  return { type: 'error', code, message };
}

export function createConnectedEvent(connectionId: string): ServerEvent {
  return { type: 'connected', connectionId };
}

export function createJoinedEvent(sessionId: string, projectId: string): ServerEvent {
  return { type: 'joined', sessionId, projectId };
}

export function createLeftEvent(projectId: string): ServerEvent {
  return { type: 'left', projectId };
}
