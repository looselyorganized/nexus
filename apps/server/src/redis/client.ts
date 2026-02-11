import Redis from 'ioredis';
import { config } from '../config';
import { logger } from '../lib/logger';

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        return Math.min(times * 50, 2000);
      },
      lazyConnect: true,
    });

    redis.on('error', (err) => {
      logger.error({ err }, 'Redis connection error');
    });

    redis.on('connect', () => {
      logger.info('Redis connected');
    });
  }

  return redis;
}

export async function isRedisConnected(): Promise<boolean> {
  try {
    const client = getRedis();
    const result = await client.ping();
    return result === 'PONG';
  } catch {
    return false;
  }
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
