import { request } from 'node:https';
import { readFileSync } from 'node:fs';
const expected = process.argv[2];
try {
  const origin = new URL(process.env.PUBLIC_ORIGIN);
  if (origin.protocol !== 'https:' || origin.origin !== process.env.PUBLIC_ORIGIN) throw new Error();
  const ca = readFileSync('/etc/pimesh-deploy/ca.crt');
  const get = (path) => new Promise((resolve, reject) => {
    const req = request(new URL(path, origin), { ca, timeout: 10000, rejectUnauthorized: true }, (res) => {
      let text = ''; res.on('data', (chunk) => { text += chunk; if (text.length > 1024 * 1024) req.destroy(); });
      res.on('end', () => resolve({ status: res.statusCode, text })); res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error())); req.on('error', reject); req.end();
  });
  const live = await get('/api/v1/health/live');
  if (live.status !== 200 || JSON.parse(live.text).version !== expected) throw new Error();
  const ready = await get('/api/v1/health/ready');
  if (ready.status !== 200 || JSON.parse(ready.text).status !== 'ready') throw new Error();
  const home = await get('/');
  if (home.status !== 200 || !home.text.includes('workspace.js')) throw new Error();
  for (const path of ['/account', '/devices']) if ((await get(path)).status !== 200) throw new Error();
  for (const path of ['/api/v1/cli/me','/admin/users','/admin/teams','/admin/invites','/admin/directory']) if ((await get(path)).status !== 401) throw new Error();
  process.stdout.write(`Verified server ${expected}: readiness, workspace, account, devices and protected management routes\n`);
} catch { process.stderr.write('Release verification failed; inspect service status, TLS certificate and configured origin.\n'); process.exitCode = 1; }
