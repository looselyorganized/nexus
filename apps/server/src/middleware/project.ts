import { createMiddleware } from 'hono/factory';
import { db } from '../db/connection';
import { projects, projectMembers } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { ForbiddenError, ValidationError, NotFoundError } from '../lib/errors';
import { ErrorCodes } from '@nexus/shared';
import type { Project, ProjectMember } from '../db/schema';

declare module 'hono' {
  interface ContextVariableMap {
    project: Project;
    projectMember: ProjectMember;
  }
}

export const projectMiddleware = createMiddleware(async (c, next) => {
  const engineer = c.get('engineer');
  if (!engineer) {
    throw new ForbiddenError('Authentication required', ErrorCodes.FORBIDDEN);
  }

  const projectId = c.req.param('projectId') || c.req.header('X-Nexus-Project');

  if (!projectId) {
    throw new ValidationError('Project ID required (route param or X-Nexus-Project header)');
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(projectId)) {
    throw new ValidationError('Invalid project ID format');
  }

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) {
    throw new NotFoundError('Project', projectId);
  }

  // Admins access all projects
  if (engineer.role !== 'admin') {
    const [membership] = await db
      .select()
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.engineerId, engineer.id)
        )
      )
      .limit(1);

    if (!membership) {
      throw new ForbiddenError('Not a member of this project', ErrorCodes.NOT_PROJECT_MEMBER);
    }

    c.set('projectMember', membership);
  } else {
    c.set('projectMember', {
      projectId: project.id,
      engineerId: engineer.id,
      role: 'lead',
    } as ProjectMember);
  }

  c.set('project', project);
  await next();
});
