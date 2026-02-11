import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/connection';
import { projects, projectMembers, engineers } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth';
import { projectMiddleware } from '../middleware/project';
import { ConflictError, ForbiddenError, NotFoundError } from '../lib/errors';

export const projectRoutes = new Hono();

projectRoutes.use('*', authMiddleware);

const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  repoUrl: z.string().url().optional(),
  repoPath: z.string().optional(),
  defaultBranch: z.string().optional(),
});

// POST /api/projects
projectRoutes.post('/', async (c) => {
  const engineer = c.get('engineer');
  const body = await c.req.json();
  const input = createProjectSchema.parse(body);

  // Check slug uniqueness
  const existing = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.slug, input.slug))
    .limit(1);

  if (existing.length > 0) {
    throw new ConflictError(`Project with slug '${input.slug}' already exists`);
  }

  const result = await db.transaction(async (tx) => {
    const [project] = await tx
      .insert(projects)
      .values({
        name: input.name,
        slug: input.slug,
        repoUrl: input.repoUrl,
        repoPath: input.repoPath,
        defaultBranch: input.defaultBranch ?? 'main',
      })
      .returning();

    // Add creator as lead
    await tx.insert(projectMembers).values({
      projectId: project!.id,
      engineerId: engineer.id,
      role: 'lead',
    });

    return project!;
  });

  return c.json({ data: result }, 201);
});

// GET /api/projects
projectRoutes.get('/', async (c) => {
  const engineer = c.get('engineer');

  // Admins see all, others see their projects
  if (engineer.role === 'admin') {
    const allProjects = await db.select().from(projects);
    return c.json({ data: allProjects });
  }

  const memberProjects = await db
    .select({ project: projects })
    .from(projectMembers)
    .innerJoin(projects, eq(projectMembers.projectId, projects.id))
    .where(eq(projectMembers.engineerId, engineer.id));

  return c.json({ data: memberProjects.map((r) => r.project) });
});

// GET /api/projects/:projectId
projectRoutes.get('/:projectId', projectMiddleware, async (c) => {
  const project = c.get('project');

  // Get members
  const members = await db
    .select({
      engineerId: projectMembers.engineerId,
      role: projectMembers.role,
      name: engineers.name,
      email: engineers.email,
    })
    .from(projectMembers)
    .innerJoin(engineers, eq(projectMembers.engineerId, engineers.id))
    .where(eq(projectMembers.projectId, project.id));

  return c.json({ data: { ...project, members } });
});

// POST /api/projects/:projectId/members
projectRoutes.post('/:projectId/members', projectMiddleware, async (c) => {
  const project = c.get('project');
  const projectMember = c.get('projectMember');

  if (projectMember.role !== 'lead') {
    throw new ForbiddenError('Only project leads can add members');
  }

  const body = await c.req.json();
  const { engineerId, role = 'member' } = z
    .object({
      engineerId: z.string().uuid(),
      role: z.enum(['lead', 'member']).optional(),
    })
    .parse(body);

  // Check engineer exists
  const [engineer] = await db
    .select({ id: engineers.id })
    .from(engineers)
    .where(eq(engineers.id, engineerId))
    .limit(1);

  if (!engineer) {
    throw new NotFoundError('Engineer', engineerId);
  }

  // Check not already a member
  const [existing] = await db
    .select()
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, project.id),
        eq(projectMembers.engineerId, engineerId)
      )
    )
    .limit(1);

  if (existing) {
    throw new ConflictError('Engineer is already a member of this project');
  }

  await db.insert(projectMembers).values({
    projectId: project.id,
    engineerId,
    role,
  });

  return c.json({ data: { projectId: project.id, engineerId, role } }, 201);
});
