/**
 * Decision entity — architectural decisions
 */
export interface Decision {
  id: string;
  projectId: string;
  featureId: string | null;
  engineerId: string;
  title: string;
  decision: string;
  rationale: string | null;
  alternatives: string | null;
  supersedes: string | null;
  createdAt: Date;
}

/**
 * Create decision input
 */
export interface CreateDecisionInput {
  title: string;
  decision: string;
  rationale?: string;
  alternatives?: string;
  featureId?: string;
  supersedes?: string;
}
