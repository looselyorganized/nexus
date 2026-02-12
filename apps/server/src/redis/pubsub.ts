import Redis from 'ioredis';
import { config } from '../config';
import type { BroadcastEvent, ServerEventType } from '@nexus/shared';
import { logger } from '../lib/logger';

let subscriber: Redis | null = null;
let publisher: Redis | null = null;
const instanceId = crypto.randomUUID();

type MessageHandler = (channel: string, event: BroadcastEvent) => void;
const messageHandlers: Set<MessageHandler> = new Set();
const subscribedChannels: Set<string> = new Set();

export function getProjectChannel(projectId: string): string {
  return `nexus:project:${projectId}`;
}

export function getInstanceId(): string {
  return instanceId;
}

function createConnection(name: string): Redis {
  const redis = new Redis(config.redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      return Math.min(times * 50, 2000);
    },
    lazyConnect: true,
  });

  redis.on('error', (err) => {
    logger.error({ err, connection: name }, 'Redis pub/sub error');
  });
  redis.on('connect', () => {
    logger.info({ connection: name }, 'Redis pub/sub connected');
  });

  return redis;
}

export async function initPubSub(): Promise<void> {
  if (!subscriber) {
    subscriber = createConnection('subscriber');
    await subscriber.connect();

    subscriber.on('message', (channel: string, message: string) => {
      try {
        const event = JSON.parse(message) as BroadcastEvent;
        if (event.sourceInstanceId === instanceId) return;
        for (const handler of messageHandlers) {
          try {
            handler(channel, event);
          } catch (err) {
            logger.error({ err, channel }, 'Message handler error');
          }
        }
      } catch (err) {
        logger.error({ err, channel }, 'Failed to parse pub/sub message');
      }
    });
  }

  if (!publisher) {
    publisher = createConnection('publisher');
    await publisher.connect();
  }
}

export async function publish<T>(
  projectId: string,
  type: ServerEventType,
  payload: T
): Promise<void> {
  if (!publisher) {
    logger.warn('Publisher not initialized, skipping publish');
    return;
  }
  const channel = getProjectChannel(projectId);
  const event: BroadcastEvent<T> = {
    type, projectId, payload,
    sourceInstanceId: instanceId,
    timestamp: Date.now(),
  };
  try {
    await publisher.publish(channel, JSON.stringify(event));
  } catch (err) {
    logger.error({ err, channel, type }, 'Failed to publish event');
  }
}

export async function subscribe(projectId: string): Promise<void> {
  if (!subscriber) return;
  const channel = getProjectChannel(projectId);
  if (subscribedChannels.has(channel)) return;
  try {
    await subscriber.subscribe(channel);
    subscribedChannels.add(channel);
  } catch (err) {
    logger.error({ err, channel }, 'Failed to subscribe');
  }
}

export function onMessage(handler: MessageHandler): () => void {
  messageHandlers.add(handler);
  return () => {
    messageHandlers.delete(handler);
  };
}

export async function closePubSub(): Promise<void> {
  for (const channel of subscribedChannels) {
    try {
      await subscriber?.unsubscribe(channel);
    } catch {
      // Ignore unsubscribe errors during shutdown
    }
  }
  subscribedChannels.clear();
  messageHandlers.clear();

  if (subscriber) {
    await subscriber.quit();
    subscriber = null;
  }
  if (publisher) {
    await publisher.quit();
    publisher = null;
  }
}

export function isPubSubInitialized(): boolean {
  return subscriber !== null && publisher !== null;
}
