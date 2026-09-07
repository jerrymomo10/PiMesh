import pg from 'pg';
import { readFileSync } from 'node:fs';
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
const dashboardEnabled = process.env.DIRECTORY_ENABLED === 'true';
const accessHash = process.env.DIRECTORY_ACCESS_HASH;
const certFile = process.env.TLS_CERT_FILE;
const keyFile = process.env.TLS_KEY_FILE;
if (Boolean(certFile) !== Boolean(keyFile)) throw new Error('Both TLS certificate and key are required');
if (dashboardEnabled && (!/^[a-f0-9]{64}$/.test(accessHash || '') || !certFile)) {
  throw new Error('Directory requires TLS and DIRECTORY_ACCESS_HASH');
}
const tlsOptions = certFile ? { cert: readFileSync(certFile), key: readFileSync(keyFile), minVersion: 'TLSv1.2' } : undefined;
const authEnabled = process.env.AUTH_ENABLED === 'true';
const publicOrigin = process.env.PUBLIC_ORIGIN;
const adminHash = process.env.INVITE_ADMIN_HASH;
if (authEnabled) {
  if (!tlsOptions || !/^[a-f0-9]{64}$/.test(adminHash || '') || !publicOrigin) throw new Error('Auth requires TLS, PUBLIC_ORIGIN and INVITE_ADMIN_HASH');
  const parsed = new URL(publicOrigin);
  if (parsed.protocol !== 'https:' || parsed.origin !== publicOrigin) throw new Error('PUBLIC_ORIGIN must be an HTTPS origin without a trailing slash');
  const schema = await pool.query("SELECT 1 FROM schema_migrations WHERE version='002-invite-auth'");
  if (!schema.rows.length) throw new Error('Apply 002-invite-auth before enabling auth');
}
const server = createApp(pool, { dashboardEnabled, accessHash, tlsOptions, authEnabled, publicOrigin, adminHash });
server.requestTimeout = 15000;
server.headersTimeout = 10000;
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
