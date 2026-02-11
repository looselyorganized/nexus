import { getRedis } from '../redis/client';
import { db } from '../db/connection';
import { sql } from 'drizzle-orm';

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy';
  latencyMs: number;
  error?: string;
}

export interface ReadinessResponse {
  status: 'ready' | 'not_ready';
  checks: {
    database: HealthCheckResult;
    redis: HealthCheckResult;
  };
  timestamp: string;
}

export interface LivenessResponse {
  status: 'alive';
  timestamp: string;
}

export async function checkDatabaseHealth(): Promise<HealthCheckResult> {
  const start = performance.now();
  try {
    await db.execute(sql`SELECT 1`);
    return { status: 'healthy', latencyMs: Math.round(performance.now() - start) };
  } catch (error) {
    return {
      status: 'unhealthy',
      latencyMs: Math.round(performance.now() - start),
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function checkRedisHealth(): Promise<HealthCheckResult> {
  const start = performance.now();
  try {
    const client = getRedis();
    const result = await client.ping();
    const latencyMs = Math.round(performance.now() - start);
    if (result === 'PONG') {
      return { status: 'healthy', latencyMs };
    }
    return { status: 'unhealthy', latencyMs, error: 'Unexpected PING response' };
  } catch (error) {
    return {
      status: 'unhealthy',
      latencyMs: Math.round(performance.now() - start),
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function checkReadiness(): Promise<ReadinessResponse> {
  const [database, redis] = await Promise.all([checkDatabaseHealth(), checkRedisHealth()]);
  const allHealthy = database.status === 'healthy' && redis.status === 'healthy';
  return {
    status: allHealthy ? 'ready' : 'not_ready',
    checks: { database, redis },
    timestamp: new Date().toISOString(),
  };
}

export function checkLiveness(): LivenessResponse {
  return { status: 'alive', timestamp: new Date().toISOString() };
}
