import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { projectMiddleware } from '../middleware/project';
import { createDecision, listDecisions } from '../services/decision.service';

export const decisionRoutes = new Hono();

decisionRoutes.use('*', authMiddleware, projectMiddleware);

const createDecisionSchema = z.object({
  title: z.string().min(1).max(200),
  decision: z.string().min(1),
  rationale: z.string().optional(),
  alternatives: z.string().optional(),
  featureSlug: z.string().optional(),
  supersedes: z.string().uuid().optional(),
});

// POST /api/projects/:projectId/decisions
decisionRoutes.post('/', async (c) => {
  const project = c.get('project');
  const engineer = c.get('engineer');
  const body = await c.req.json();
  const input = createDecisionSchema.parse(body);

  const result = await createDecision({
    projectId: project.id,
    engineerId: engineer.id,
    ...input,
  });

  return c.json({ data: result }, 201);
});

// GET /api/projects/:projectId/decisions
decisionRoutes.get('/', async (c) => {
  const project = c.get('project');
  const featureSlug = c.req.query('feature');
  const limitParam = c.req.query('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : undefined;
  const cursor = c.req.query('cursor');

  const result = await listDecisions({
    projectId: project.id,
    featureSlug,
    limit,
    cursor,
  });

  return c.json({ data: result });
});
