import { app } from './app';
import { config } from './config';
import { getRedis, closeRedis } from './redis/client';
import { closeDatabase } from './db/connection';
import { initPubSub, closePubSub } from './redis/pubsub';

import { syncHeartbeatsToDb } from './redis/sessions';
import { batchUpdateHeartbeats, cleanupStaleSessions } from './services/session.service';
import { initBroadcast, cleanupBroadcast } from './ws/broadcast';
import { websocketHandler } from './ws/handler';
import { clearAllConnections } from './ws/connections';
import { logger } from './lib/logger';

let claimsCleanupInterval: Timer | null = null;
let heartbeatSyncInterval: Timer | null = null;

async function init() {
  // Connect to Redis
  const redis = getRedis();
  await redis.connect();

  // Initialize pub/sub and broadcast
  await initPubSub();
  initBroadcast();

  // Start periodic cleanup jobs
  claimsCleanupInterval = setInterval(async () => {
    try {
      await cleanupStaleSessions();
    } catch (err) {
      logger.error({ err }, 'Session cleanup error');
    }
  }, config.claimCleanupIntervalMs);

  // Sync heartbeats from Redis to DB periodically
  heartbeatSyncInterval = setInterval(async () => {
    try {
      await syncHeartbeatsToDb(batchUpdateHeartbeats);
    } catch (err) {
      logger.error({ err }, 'Heartbeat sync error');
    }
  }, config.heartbeatSyncIntervalMs);
}

async function shutdown() {
  logger.info('Shutting down...');

  if (claimsCleanupInterval) {
    clearInterval(claimsCleanupInterval);
    claimsCleanupInterval = null;
  }
  if (heartbeatSyncInterval) {
    clearInterval(heartbeatSyncInterval);
    heartbeatSyncInterval = null;
  }

  cleanupBroadcast();
  clearAllConnections();
  await closePubSub();
  await closeRedis();
  await closeDatabase();

  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

init()
  .then(() => {
    logger.info({ port: config.port, env: config.nodeEnv }, 'Server starting');

    Bun.serve({
      port: config.port,
      fetch: async (request, server) => {
        // Handle WebSocket upgrade
        const url = new URL(request.url);
        if (url.pathname === '/ws') {
          const result = await websocketHandler.upgrade(request);
          if (!result.success) {
            return new Response(JSON.stringify({ error: result.error?.message }), {
              status: 401,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          const upgraded = server.upgrade(request, { data: result.data! });
          if (upgraded) return undefined as any;
          return new Response('WebSocket upgrade failed', { status: 500 });
        }

        return app.fetch(request, { ip: server.requestIP(request) });
      },
      websocket: {
        open: websocketHandler.onOpen,
        message: websocketHandler.onMessage as any,
        close: websocketHandler.onClose as any,
      },
    });

    logger.info({ url: `http://localhost:${config.port}` }, 'Server ready (HTTP + WebSocket)');
  })
  .catch((error) => {
    logger.fatal({ err: error }, 'Failed to start server');
    process.exit(1);
  });
