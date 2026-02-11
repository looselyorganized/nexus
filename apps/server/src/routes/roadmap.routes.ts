import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { projectMiddleware } from '../middleware/project';
import { getRoadmap, reorderFeatures, moveToLane } from '../services/roadmap.service';

export const roadmapRoutes = new Hono();

roadmapRoutes.use('*', authMiddleware, projectMiddleware);

const reorderSchema = z.record(
  z.string(),
  z.array(z.string())
);

const moveLaneSchema = z.object({
  lane: z.enum(['now', 'next', 'later', 'icebox']),
  priority: z.number().int().positive().optional(),
});

// GET /api/projects/:projectId/roadmap
roadmapRoutes.get('/', async (c) => {
  const project = c.get('project');
  const roadmap = await getRoadmap(project.id);
  return c.json({ data: roadmap });
});

// PATCH /api/projects/:projectId/roadmap/reorder
roadmapRoutes.patch('/reorder', async (c) => {
  const project = c.get('project');
  const body = await c.req.json();
  const input = reorderSchema.parse(body);
  const roadmap = await reorderFeatures(project.id, input);
  return c.json({ data: roadmap });
});

// PATCH /api/projects/:projectId/features/:slug/lane
roadmapRoutes.patch('/:slug/lane', async (c) => {
  const project = c.get('project');
  const slug = c.req.param('slug');
  const body = await c.req.json();
  const { lane, priority } = moveLaneSchema.parse(body);

  const feature = await moveToLane({
    projectId: project.id,
    slug,
    lane,
    priority,
  });

  return c.json({ data: feature });
});
