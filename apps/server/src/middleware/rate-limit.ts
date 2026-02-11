import { rateLimiter } from 'hono-rate-limiter';
import type { Context } from 'hono';
import { config } from '../config';

function getApiKeyFromContext(c: Context): string {
  const authHeader = c.req.header('Authorization');
  if (!authHeader) return 'anonymous';
  const key = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  return key.slice(0, 20);
}

function getIpFromContext(c: Context): string {
  if (config.trustProxy) {
    const forwarded = c.req.header('X-Forwarded-For');
    if (forwarded) {
      return forwarded.split(',')[0]?.trim() || 'unknown';
    }
    const realIp = c.req.header('X-Real-IP');
    if (realIp) return realIp;
  }

  // Bun's native requestIP passed via env in index.ts
  const bunIp = (c.env as Record<string, unknown>)?.ip as { address: string } | null;
  if (bunIp?.address) return bunIp.address;

  return 'unknown';
}

export const globalRateLimiter = rateLimiter({
  windowMs: 60 * 1000,
  limit: config.rateLimitGlobal,
  keyGenerator: getApiKeyFromContext,
  standardHeaders: 'draft-6',
  message: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests' } },
});

export const authFailureRateLimiter = rateLimiter({
  windowMs: 60 * 1000,
  limit: config.rateLimitAuthFailures,
  keyGenerator: getIpFromContext,
  standardHeaders: 'draft-6',
  skipSuccessfulRequests: true,
  message: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many authentication failures' } },
});
