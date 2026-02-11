import { Registry, Counter, Gauge, Histogram, collectDefaultMetrics } from 'prom-client';
import { config } from '../config';

export const registry = new Registry();

registry.setDefaultLabels({ app: 'nexus', env: config.nodeEnv });

collectDefaultMetrics({ register: registry, prefix: 'nexus_' });

// HTTP
export const httpRequestsTotal = new Counter({
  name: 'nexus_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [registry],
});

export const httpRequestDuration = new Histogram({
  name: 'nexus_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

// WebSocket
export const wsConnectionsActive = new Gauge({
  name: 'nexus_websocket_connections_active',
  help: 'Active WebSocket connections',
  labelNames: ['project'] as const,
  registers: [registry],
});

// Business
export const claimsActive = new Gauge({
  name: 'nexus_claims_active',
  help: 'Active file claims',
  labelNames: ['project'] as const,
  registers: [registry],
});

export const sessionsActive = new Gauge({
  name: 'nexus_sessions_active',
  help: 'Active sessions',
  registers: [registry],
});

export const featuresTotal = new Gauge({
  name: 'nexus_features_total',
  help: 'Features by status',
  labelNames: ['status'] as const,
  registers: [registry],
});

// Helpers
export function recordHttpRequest(
  method: string,
  route: string,
  status: number,
  durationMs: number
): void {
  const labels = { method, route, status: String(status) };
  httpRequestsTotal.inc(labels);
  httpRequestDuration.observe(labels, durationMs / 1000);
}

export async function getMetricsOutput(): Promise<string> {
  return registry.metrics();
}

export function getMetricsContentType(): string {
  return registry.contentType;
}
