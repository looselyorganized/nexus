import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { projectMiddleware } from '../middleware/project';
import {
  getOrCreateSession,
  updateHeartbeat,
  getActiveSessions,
} from '../services/session.service';
import {
  createCheckpoint,
  getLatestCheckpoint,
} from '../services/checkpoint.service';

export const sessionRoutes = new Hono();

sessionRoutes.use('*', authMiddleware, projectMiddleware);

const createSessionSchema = z.object({
  featureId: z.string().uuid().optional(),
  metadata: z
    .object({
      gitBranch: z.string().optional(),
      workingDir: z.string().optional(),
      clientVersion: z.string().optional(),
    })
    .optional(),
});

const createCheckpointSchema = z.object({
  sessionId: z.string().uuid(),
  featureId: z.string().uuid(),
  context: z.record(z.unknown()).default({}),
  type: z.enum(['auto_periodic', 'manual', 'crash_recovery']).optional(),
  notes: z.string().optional(),
});

// POST /api/projects/:projectId/sessions
sessionRoutes.post('/', async (c) => {
  const project = c.get('project');
  const engineer = c.get('engineer');
  const body = await c.req.json();
  const { featureId, metadata } = createSessionSchema.parse(body);

  const session = await getOrCreateSession(
    project.id,
    engineer.id,
    featureId,
    metadata
  );

  return c.json({ data: session }, 201);
});

// GET /api/projects/:projectId/sessions/active
sessionRoutes.get('/active', async (c) => {
  const project = c.get('project');
  const result = await getActiveSessions(project.id);
  return c.json({ data: result });
});

// POST /api/projects/:projectId/sessions/:sessionId/heartbeat
sessionRoutes.post('/:sessionId/heartbeat', async (c) => {
  const sessionId = c.req.param('sessionId');
  await updateHeartbeat(sessionId);
  return c.json({ data: { ok: true } });
});

// POST /api/projects/:projectId/checkpoints
sessionRoutes.post('/checkpoints', async (c) => {
  const project = c.get('project');
  const engineer = c.get('engineer');
  const body = await c.req.json();
  const input = createCheckpointSchema.parse(body);

  const checkpoint = await createCheckpoint(project.id, engineer.id, input);
  if (!checkpoint) {
    return c.json({ data: null, message: 'Duplicate checkpoint skipped' });
  }

  return c.json({ data: checkpoint }, 201);
});

// GET /api/projects/:projectId/checkpoints/latest
sessionRoutes.get('/checkpoints/latest', async (c) => {
  const engineer = c.get('engineer');
  const featureId = c.req.query('featureId');

  if (!featureId) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'featureId query parameter required' } }, 400);
  }

  const checkpoint = await getLatestCheckpoint(engineer.id, featureId);
  return c.json({ data: checkpoint });
});
