import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  DB_POOL_SIZE: z.coerce.number().default(25),
  DB_IDLE_TIMEOUT: z.coerce.number().default(20),
  DB_CONNECT_TIMEOUT: z.coerce.number().default(10),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  API_KEY_SALT: z.string().min(16),
  RATE_LIMIT_GLOBAL: z.coerce.number().default(1000),
  RATE_LIMIT_AUTH_FAILURES: z.coerce.number().default(10),
  CLAIM_TTL_SECONDS: z.coerce.number().default(300),
  CLAIM_CLEANUP_INTERVAL_MS: z.coerce.number().default(60000),
  HEARTBEAT_TIMEOUT_SECONDS: z.coerce.number().default(90),
  SESSION_GRACE_PERIOD_SECONDS: z.coerce.number().default(300),
  HEARTBEAT_SYNC_INTERVAL_SECONDS: z.coerce.number().default(60),
  CHECKPOINT_RETENTION_DAYS: z.coerce.number().default(7),
  BROADCAST_DEBOUNCE_MS: z.coerce.number().default(100),
  BROADCAST_MAX_BATCH_SIZE: z.coerce.number().default(50),
  ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((s) => s === 'true'),
});

function loadConfig() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('Invalid environment variables:');
    console.error(parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment configuration');
  }

  return {
    databaseUrl: parsed.data.DATABASE_URL,
    redisUrl: parsed.data.REDIS_URL,
    port: parsed.data.PORT,
    nodeEnv: parsed.data.NODE_ENV,
    apiKeySalt: parsed.data.API_KEY_SALT,
    isDevelopment: parsed.data.NODE_ENV === 'development',
    isProduction: parsed.data.NODE_ENV === 'production',
    isTest: parsed.data.NODE_ENV === 'test',
    logLevel: parsed.data.LOG_LEVEL,
    dbPoolSize: parsed.data.DB_POOL_SIZE,
    dbIdleTimeout: parsed.data.DB_IDLE_TIMEOUT,
    dbConnectTimeout: parsed.data.DB_CONNECT_TIMEOUT,
    rateLimitGlobal: parsed.data.RATE_LIMIT_GLOBAL,
    rateLimitAuthFailures: parsed.data.RATE_LIMIT_AUTH_FAILURES,
    claimTtlSeconds: parsed.data.CLAIM_TTL_SECONDS,
    claimCleanupIntervalMs: parsed.data.CLAIM_CLEANUP_INTERVAL_MS,
    heartbeatTimeoutMs: parsed.data.HEARTBEAT_TIMEOUT_SECONDS * 1000,
    sessionGracePeriodMs: parsed.data.SESSION_GRACE_PERIOD_SECONDS * 1000,
    heartbeatSyncIntervalMs: parsed.data.HEARTBEAT_SYNC_INTERVAL_SECONDS * 1000,
    checkpointRetentionDays: parsed.data.CHECKPOINT_RETENTION_DAYS,
    broadcastDebounceMs: parsed.data.BROADCAST_DEBOUNCE_MS,
    broadcastMaxBatchSize: parsed.data.BROADCAST_MAX_BATCH_SIZE,
    allowedOrigins: parsed.data.ALLOWED_ORIGINS,
    trustProxy: parsed.data.TRUST_PROXY,
  };
}

export const config = loadConfig();
export type Config = typeof config;
