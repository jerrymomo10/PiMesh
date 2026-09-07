import pg from 'pg';
import { readFileSync, readdirSync } from 'node:fs';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000 });
try {
  const directory = new URL('../migrations/', import.meta.url);
  for (const name of readdirSync(directory).filter((name) => /^\d{3}-[a-z-]+\.sql$/.test(name)).sort()) {
    await pool.query(readFileSync(new URL(name, directory), 'utf8'));
  }
  process.stdout.write('Server schema ready\n');
} catch {
  process.stderr.write('Directory migration failed; inspect database schema and permissions\n');
  process.exitCode = 1;
} finally { await pool.end(); }
