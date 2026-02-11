/**
 * Client -> Server message types
 */
export type ClientMessageType = 'join' | 'heartbeat' | 'leave';

export interface JoinMessage {
  type: 'join';
  projectId: string;
}

export interface HeartbeatMessage {
  type: 'heartbeat';
}

export interface LeaveMessage {
  type: 'leave';
}

export type ClientMessage = JoinMessage | HeartbeatMessage | LeaveMessage;

/**
 * Server -> Client event types
 */
export type ServerEventType =
  | 'connected'
  | 'joined'
  | 'left'
  | 'error'
  | 'feature_created'
  | 'feature_updated'
  | 'feature_claimed'
  | 'feature_released'
  | 'feature_completed'
  | 'files_claimed'
  | 'files_released'
  | 'learning_added'
  | 'decision_added'
  | 'session_started'
  | 'session_ended';

/**
 * Redis pub/sub broadcast event wrapper
 */
export interface BroadcastEvent<T = unknown> {
  type: ServerEventType;
  projectId: string;
  payload: T;
  sourceInstanceId: string;
  timestamp: number;
}

/**
 * Server event (sent to client)
 */
export interface ServerEvent {
  type: string;
  [key: string]: unknown;
}

/**
 * WebSocket close codes
 */
export const WsCloseCodes = {
  NORMAL: 1000,
  GOING_AWAY: 1001,
  UNAUTHORIZED: 4001,
  FORBIDDEN: 4003,
  TRY_AGAIN_LATER: 4029,
  INVALID_MESSAGE: 4400,
} as const;
