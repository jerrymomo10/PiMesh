import { spawnSync } from 'node:child_process';

// Invoked by an administrator-owned systemd transient unit with EnvironmentFile.
// Never pass the connection URL/password in argv or print it in errors.
try {
  const url = new URL(process.env.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw new Error();
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!/^[a-zA-Z0-9_]+$/.test(database) || !process.argv[2]) throw new Error();
  const { DATABASE_URL, ...environment } = process.env;
  const child = spawnSync('pg_dump', ['--format=custom', '--file', process.argv[2]], {
    env: { ...environment, PGHOST: url.hostname.replace(/^\[|\]$/g, ''), PGPORT: url.port || '5432',
      PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: database,
      PGCONNECT_TIMEOUT: '10', PGSSLMODE: url.searchParams.get('sslmode') || 'prefer' },
    stdio: ['ignore','ignore','pipe'], timeout: 300000,
  });
  if (child.status !== 0) throw new Error();
  process.stdout.write('Database backup completed\n');
} catch { process.stderr.write('Database backup failed; check local PostgreSQL tools, connection and backup directory permissions.\n'); process.exitCode = 1; }
