import pg from 'pg';
import { createApp } from './app.mjs';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');
const port = Number(process.env.PORT || 8080);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
const pool = new pg.Pool({
  connectionString, max: 5, connectionTimeoutMillis: 2000,
  idleTimeoutMillis: 30000, query_timeout: 3000, statement_timeout: 3000,
});
pool.on('error', () => process.stderr.write('Database pool connection failed\n'));
const server = createApp(pool);
server.listen(port, process.env.HOST || '127.0.0.1', () => {
  process.stdout.write(`PiMesh team service listening on port ${port}\n`);
});
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(1), 10000);
  deadline.unref();
  server.close(async () => { await pool.end(); clearTimeout(deadline); });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
