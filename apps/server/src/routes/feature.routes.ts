import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { projectMiddleware } from '../middleware/project';
import {
  createFeature,
  getFeature,
  listFeatures,
  updateFeature,
  deleteFeature,
  markReady,
  pickFeature,
  releaseFeature,
  markDone,
  cancelFeature,
  getAvailableFeatures,
} from '../services/feature.service';

export const featureRoutes = new Hono();

featureRoutes.use('*', authMiddleware, projectMiddleware);

const createFeatureSchema = z.object({
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  title: z.string().min(1).max(200),
  spec: z.string().min(1),
  lane: z.enum(['now', 'next', 'later', 'icebox']).optional(),
  priority: z.number().int().positive().optional(),
  touches: z.array(z.string()).optional(),
});

const updateFeatureSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  spec: z.string().min(1).optional(),
  lane: z.enum(['now', 'next', 'later', 'icebox']).optional(),
  priority: z.number().int().positive().optional(),
  touches: z.array(z.string()).optional(),
});

// POST /api/projects/:projectId/features
featureRoutes.post('/', async (c) => {
  const project = c.get('project');
  const engineer = c.get('engineer');
  const body = await c.req.json();
  const input = createFeatureSchema.parse(body);

  const feature = await createFeature({
    projectId: project.id,
    ...input,
    createdBy: engineer.id,
  });

  return c.json({ data: feature }, 201);
});

// GET /api/projects/:projectId/features
featureRoutes.get('/', async (c) => {
  const project = c.get('project');
  const status = c.req.query('status') as string | undefined;
  const lane = c.req.query('lane') as string | undefined;
  const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : undefined;
  const cursor = c.req.query('cursor');

  const result = await listFeatures({
    projectId: project.id,
    status: status as any,
    lane: lane as any,
    limit,
    cursor,
  });

  return c.json({ data: result });
});

// GET /api/projects/:projectId/features/available
// NOTE: Must be defined before /:slug to avoid "available" being captured as a slug
featureRoutes.get('/available', async (c) => {
  const project = c.get('project');
  const engineer = c.get('engineer');
  const available = await getAvailableFeatures({
    projectId: project.id,
    engineerId: engineer.id,
  });
  return c.json({ data: available });
});

// GET /api/projects/:projectId/features/:slug
featureRoutes.get('/:slug', async (c) => {
  const project = c.get('project');
  const slug = c.req.param('slug');
  const feature = await getFeature(project.id, slug);
  return c.json({ data: feature });
});

// PATCH /api/projects/:projectId/features/:slug
featureRoutes.patch('/:slug', async (c) => {
  const project = c.get('project');
  const slug = c.req.param('slug');
  const body = await c.req.json();
  const input = updateFeatureSchema.parse(body);

  const feature = await updateFeature({
    projectId: project.id,
    slug,
    ...input,
  });

  return c.json({ data: feature });
});

// DELETE /api/projects/:projectId/features/:slug
featureRoutes.delete('/:slug', async (c) => {
  const project = c.get('project');
  const slug = c.req.param('slug');
  await deleteFeature(project.id, slug);
  return c.json({ data: { deleted: true } });
});

// ─── Feature Lifecycle ───

// POST /api/projects/:projectId/features/:slug/ready
featureRoutes.post('/:slug/ready', async (c) => {
  const project = c.get('project');
  const slug = c.req.param('slug');
  const feature = await markReady(project.id, slug);
  return c.json({ data: feature });
});

// POST /api/projects/:projectId/features/:slug/pick
featureRoutes.post('/:slug/pick', async (c) => {
  const project = c.get('project');
  const engineer = c.get('engineer');
  const slug = c.req.param('slug');
  const feature = await pickFeature({
    projectId: project.id,
    slug,
    engineerId: engineer.id,
    engineerName: engineer.name,
  });
  return c.json({ data: feature });
});

// POST /api/projects/:projectId/features/:slug/release
featureRoutes.post('/:slug/release', async (c) => {
  const project = c.get('project');
  const engineer = c.get('engineer');
  const slug = c.req.param('slug');
  const feature = await releaseFeature({
    projectId: project.id,
    slug,
    engineerId: engineer.id,
  });
  return c.json({ data: feature });
});

// POST /api/projects/:projectId/features/:slug/done
featureRoutes.post('/:slug/done', async (c) => {
  const project = c.get('project');
  const engineer = c.get('engineer');
  const slug = c.req.param('slug');
  const feature = await markDone({
    projectId: project.id,
    slug,
    engineerId: engineer.id,
  });
  return c.json({ data: feature });
});

// POST /api/projects/:projectId/features/:slug/cancel
featureRoutes.post('/:slug/cancel', async (c) => {
  const project = c.get('project');
  const engineer = c.get('engineer');
  const slug = c.req.param('slug');
  const feature = await cancelFeature({
    projectId: project.id,
    slug,
    engineerId: engineer.id,
  });
  return c.json({ data: feature });
});
