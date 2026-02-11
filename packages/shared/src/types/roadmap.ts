import type { Feature, Lane } from './feature';

/**
 * Roadmap lane with features
 */
export interface RoadmapLane {
  lane: Lane;
  features: Feature[];
}

/**
 * Full roadmap view
 */
export interface Roadmap {
  projectId: string;
  lanes: RoadmapLane[];
}

/**
 * Reorder input — ordered list of slugs per lane
 */
export interface ReorderInput {
  [lane: string]: string[];
}
