import { createMiddleware } from 'hono/factory';
import { recordHttpRequest } from '../lib/prometheus';

function normalizeRoutePath(path: string): string {
  return path
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .replace(/\/\d+(?=\/|$)/g, '/:num');
}

export const requestMetricsMiddleware = createMiddleware(async (c, next) => {
  const startTime = performance.now();
  await next();
  const durationMs = performance.now() - startTime;
  const route = normalizeRoutePath(c.req.path);
  recordHttpRequest(c.req.method, route, c.res.status, durationMs);
});
