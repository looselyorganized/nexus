/**
 * Session status
 */
export type SessionStatus = 'active' | 'disconnected';

/**
 * Session metadata
 */
export interface SessionMetadata {
  gitBranch?: string;
  workingDir?: string;
  clientVersion?: string;
}

/**
 * Session entity
 */
export interface Session {
  id: string;
  projectId: string;
  engineerId: string;
  featureId: string | null;
  status: SessionStatus;
  lastHeartbeat: Date;
  metadata: SessionMetadata | null;
  createdAt: Date;
}

/**
 * Checkpoint entity
 */
export interface Checkpoint {
  id: string;
  sessionId: string;
  featureId: string;
  engineerId: string;
  type: 'auto_periodic' | 'manual' | 'crash_recovery';
  stateHash: string | null;
  activeClaims: unknown;
  context: unknown;
  notes: string | null;
  isLatest: boolean;
  createdAt: Date;
}

/**
 * Session constants
 */
export const SessionConstants = {
  HEARTBEAT_INTERVAL_MS: 30_000,
  HEARTBEAT_TIMEOUT_MS: 90_000,
  CLEANUP_INTERVAL_MS: 60_000,
  SESSION_GRACE_PERIOD_MS: 300_000,
} as const;
