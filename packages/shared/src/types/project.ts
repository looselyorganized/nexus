/**
 * Project entity
 */
export interface Project {
  id: string;
  name: string;
  slug: string;
  repoUrl: string | null;
  repoPath: string | null;
  defaultBranch: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Project creation input
 */
export interface CreateProjectInput {
  name: string;
  slug: string;
  repoUrl?: string;
  repoPath?: string;
  defaultBranch?: string;
}

/**
 * Project member
 */
export interface ProjectMember {
  projectId: string;
  engineerId: string;
  role: 'lead' | 'member';
}
