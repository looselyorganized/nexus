import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is required');
    process.exit(1);
  }

  console.info('Connecting to database...');
  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client);

  console.info('Running migrations...');

  try {
    await migrate(db, { migrationsFolder: './src/db/migrations' });
    console.info('Migrations completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
