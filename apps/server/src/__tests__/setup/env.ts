/**
 * Test environment setup - runs before any test modules load.
 *
 * Converts Supabase pooler URL (port 6543) to direct connection (port 5432).
 * The pooler uses transaction-mode pooling which causes visibility issues
 * between connections in test scenarios where we truncate and re-seed data.
 */
const url = process.env.DATABASE_URL;
if (url && url.includes(':6543/')) {
  process.env.DATABASE_URL = url.replace(':6543/', ':5432/');
}
