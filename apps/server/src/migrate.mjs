import pg from 'pg';
import { readFileSync } from 'node:fs';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000 });
try {
  await pool.query(readFileSync(new URL('../migrations/001-directory.sql', import.meta.url), 'utf8'));
  process.stdout.write('Directory schema ready\n');
} catch {
  process.stderr.write('Directory migration failed; inspect database schema and permissions\n');
  process.exitCode = 1;
} finally { await pool.end(); }
