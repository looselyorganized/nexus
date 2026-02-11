/**
 * Learning entity — append-only log per feature
 */
export interface Learning {
  id: string;
  featureId: string;
  engineerId: string;
  content: string;
  createdAt: Date;
}

/**
 * Create learning input
 */
export interface CreateLearningInput {
  content: string;
}
