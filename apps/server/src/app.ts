import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { bodyLimit } from 'hono/body-limit';
import { config } from './config';
import { requestIdMiddleware } from './middleware/request-id';
import { requestMetricsMiddleware } from './middleware/metrics';
import { globalRateLimiter } from './middleware/rate-limit';
import { errorHandler, notFoundHandler } from './middleware/error';
import { healthRoutes } from './routes/health.routes';
import { authRoutes } from './routes/auth.routes';
import { projectRoutes } from './routes/project.routes';
import { featureRoutes } from './routes/feature.routes';
import { learningRoutes } from './routes/learning.routes';
import { decisionRoutes } from './routes/decision.routes';
import { roadmapRoutes } from './routes/roadmap.routes';
import { claimRoutes } from './routes/claim.routes';
import { sessionRoutes } from './routes/session.routes';
import { statusRoutes } from './routes/status.routes';

const app = new Hono();

// Global middleware
app.use('*', secureHeaders());
app.use('*', requestIdMiddleware);
app.use('*', requestMetricsMiddleware);
app.use('*', logger());
app.use(
  '*',
  cors({
    origin: config.allowedOrigins,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Nexus-Project', 'X-Request-ID'],
  })
);
app.use(
  '/api/*',
  bodyLimit({
    maxSize: 1024 * 1024,
    onError: (c) =>
      c.json(
        { error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large (max 1MB)' } },
        413
      ),
  })
);
app.use('/api/*', globalRateLimiter);

// Routes
app.route('/api', healthRoutes);
app.route('/api/auth', authRoutes);
app.route('/api/projects', projectRoutes);
app.route('/api/projects/:projectId/features', featureRoutes);
app.route('/api/projects/:projectId/features/:slug/learnings', learningRoutes);
app.route('/api/projects/:projectId/decisions', decisionRoutes);
app.route('/api/projects/:projectId/roadmap', roadmapRoutes);
app.route('/api/projects/:projectId/claims', claimRoutes);
app.route('/api/projects/:projectId/sessions', sessionRoutes);
app.route('/api/projects/:projectId/status', statusRoutes);

// Error handling
app.onError(errorHandler);
app.notFound(notFoundHandler);

export { app };
