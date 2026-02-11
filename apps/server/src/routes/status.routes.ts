import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { projectMiddleware } from '../middleware/project';
import { listFeatures } from '../services/feature.service';
import { getProjectClaims } from '../redis/claims';
import { getActiveSessions } from '../services/session.service';

export const statusRoutes = new Hono();

statusRoutes.use('*', authMiddleware, projectMiddleware);

// GET /api/projects/:projectId/status
statusRoutes.get('/', async (c) => {
  const project = c.get('project');

  const [activeFeatures, claims, sessions] = await Promise.all([
    listFeatures({ projectId: project.id, status: 'active' as any }),
    getProjectClaims(project.id),
    getActiveSessions(project.id),
  ]);

  return c.json({
    data: {
      activeFeatures: activeFeatures.items,
      claims,
      sessions: sessions.map((s) => ({
        ...s.session,
        engineer: s.engineer,
      })),
    },
  });
});
