/**
 * Feature status — simplified lifecycle
 */
export type FeatureStatus = 'draft' | 'ready' | 'active' | 'done' | 'cancelled';

/**
 * Roadmap lane
 */
export type Lane = 'now' | 'next' | 'later' | 'icebox';

/**
 * Lane priority (lower = higher priority)
 */
export const LanePriority: Record<Lane, number> = {
  now: 0,
  next: 1,
  later: 2,
  icebox: 3,
};

/**
 * Feature entity
 */
export interface Feature {
  id: string;
  projectId: string;
  slug: string;
  title: string;
  spec: string;
  status: FeatureStatus;
  lane: Lane;
  priority: number;
  touches: string[];
  createdBy: string | null;
  claimedBy: string | null;
  claimedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create feature input
 */
export interface CreateFeatureInput {
  slug: string;
  title: string;
  spec: string;
  lane?: Lane;
  priority?: number;
  touches?: string[];
}

/**
 * Update feature input
 */
export interface UpdateFeatureInput {
  title?: string;
  spec?: string;
  lane?: Lane;
  priority?: number;
  touches?: string[];
}

/**
 * Feature with collision info for available endpoint
 */
export interface AvailableFeature extends Feature {
  blockedBy?: {
    engineerId: string;
    engineerName?: string;
    featureSlug: string;
  };
}

/**
 * Valid status transitions
 */
export const FeatureTransitions: Record<FeatureStatus, FeatureStatus[]> = {
  draft: ['ready'],
  ready: ['active', 'draft'],
  active: ['done', 'cancelled', 'ready'],
  done: [],
  cancelled: [],
};
