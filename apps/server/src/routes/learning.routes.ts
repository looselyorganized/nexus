import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { projectMiddleware } from '../middleware/project';
import { addLearning, listLearnings } from '../services/learning.service';

export const learningRoutes = new Hono();

learningRoutes.use('*', authMiddleware, projectMiddleware);

// POST /api/projects/:projectId/features/:slug/learnings
learningRoutes.post('/', async (c) => {
  const project = c.get('project');
  const engineer = c.get('engineer');
  const slug = c.req.param('slug')!;
  const body = await c.req.json();
  const { content } = z.object({ content: z.string().min(1) }).parse(body);

  const learning = await addLearning({
    projectId: project.id,
    featureSlug: slug,
    engineerId: engineer.id,
    content,
  });

  return c.json({ data: learning }, 201);
});

// GET /api/projects/:projectId/features/:slug/learnings
learningRoutes.get('/', async (c) => {
  const project = c.get('project');
  const slug = c.req.param('slug')!;
  const limitParam = c.req.query('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : undefined;
  const cursor = c.req.query('cursor');

  const result = await listLearnings({
    projectId: project.id,
    featureSlug: slug,
    limit,
    cursor,
  });

  return c.json({ data: result });
});
