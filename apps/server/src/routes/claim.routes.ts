import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { projectMiddleware } from '../middleware/project';
import {
  getProjectClaims,
  getEngineerClaims,
  refreshClaims,
} from '../redis/claims';

export const claimRoutes = new Hono();

claimRoutes.use('*', authMiddleware, projectMiddleware);

// GET /api/projects/:projectId/claims
claimRoutes.get('/', async (c) => {
  const project = c.get('project');
  const claims = await getProjectClaims(project.id);
  return c.json({ data: claims });
});

// GET /api/projects/:projectId/claims/mine
claimRoutes.get('/mine', async (c) => {
  const project = c.get('project');
  const engineer = c.get('engineer');
  const claims = await getEngineerClaims({
    projectId: project.id,
    engineerId: engineer.id,
  });
  return c.json({ data: claims });
});

// POST /api/projects/:projectId/claims/refresh
claimRoutes.post('/refresh', async (c) => {
  const project = c.get('project');
  const engineer = c.get('engineer');
  const claims = await getEngineerClaims({
    projectId: project.id,
    engineerId: engineer.id,
  });

  if (claims.length === 0) {
    return c.json({ data: { refreshed: [], notOwned: [] } });
  }

  const result = await refreshClaims({
    projectId: project.id,
    engineerId: engineer.id,
    files: claims.map((c) => c.filePath),
  });

  return c.json({ data: result });
});
