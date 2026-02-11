import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '../config';
import * as schema from './schema';

const client = postgres(config.databaseUrl, {
  max: config.dbPoolSize,
  idle_timeout: config.dbIdleTimeout,
  connect_timeout: config.dbConnectTimeout,
});

export const db = drizzle(client, { schema });

export async function isDatabaseConnected(): Promise<boolean> {
  try {
    await client`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export async function closeDatabase(): Promise<void> {
  await client.end();
}

export { schema };
