import { Hono } from 'hono';
import { checkReadiness, checkLiveness } from '../lib/health';
import { getMetricsOutput, getMetricsContentType } from '../lib/prometheus';

export const healthRoutes = new Hono();

// GET /api/health
healthRoutes.get('/health', async (c) => {
  const readiness = await checkReadiness();
  const status = readiness.status === 'ready' ? 200 : 503;
  return c.json(readiness, status as 200);
});

// GET /api/health/live
healthRoutes.get('/health/live', (c) => {
  return c.json(checkLiveness());
});

// GET /api/health/ready
healthRoutes.get('/health/ready', async (c) => {
  const readiness = await checkReadiness();
  const status = readiness.status === 'ready' ? 200 : 503;
  return c.json(readiness, status as 200);
});

// GET /api/metrics
healthRoutes.get('/metrics', async () => {
  const metrics = await getMetricsOutput();
  return new Response(metrics, {
    headers: { 'Content-Type': getMetricsContentType() },
  });
});
