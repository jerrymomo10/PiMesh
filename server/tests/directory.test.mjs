import { createHash } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../app.mjs';
import { createDirectory } from '../directory.mjs';

test('directory uses bound search values and releases connections on failure', async () => {
  const calls = [];
  let released = false;
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.startsWith('SELECT count')) return { rows: [{ total: 0 }] };
      if (sql.startsWith('SELECT user_id')) throw new Error('private connection details');
      return { rows: [] };
    },
    release() { released = true; },
  };
  const directory = createDirectory({ connect: async () => client });
  await assert.rejects(directory.list('users', new URLSearchParams({ q: "' OR 1=1 --" })));
  assert.ok(released);
  assert.equal(calls.at(-1).sql, 'ROLLBACK');
  assert.ok(calls.find((c) => c.values?.[0] === "%' OR 1=1 --%"));
  assert.ok(calls.every((c) => !c.sql.includes("' OR 1=1 --")));
  assert.equal(await directory.list('auth_sessions', new URLSearchParams()), null);
  await assert.rejects(directory.list('users', new URLSearchParams({ page: '-1' })), { status: 400 });
});

test('dashboard is opt-in, static assets are allowlisted and errors are generic', async (t) => {
  const app = createApp({ query: async () => { throw new Error('secret'); } }, { dashboardEnabled: true });
  app.listen(0, '127.0.0.1'); await once(app, 'listening');
  t.after(() => new Promise((resolve) => app.close(resolve)));
  const base = `http://127.0.0.1:${app.address().port}`;
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /团队目录/);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal((await fetch(`${base}/package.json`)).status, 404);
  const error = await fetch(`${base}/api/v1/directory/summary`);
  assert.equal(error.status, 503);
  assert.deepEqual(await error.json(), { error: 'directory_unavailable' });
  const invalid = await fetch(`${base}/api/v1/directory/users?page=0`);
  assert.equal(invalid.status, 400);
});


test('protected directory rejects missing and incorrect credentials before database access', async (t) => {
  let queried = false;
  const app = createApp({ query: async () => { queried = true; return { rows: [{ users: 0 }] }; } }, {
    dashboardEnabled: true,
    accessHash: createHash('sha256').update('viewer:synthetic-test-password').digest('hex'),
  });
  app.listen(0, '127.0.0.1'); await once(app, 'listening');
  t.after(() => new Promise((resolve) => app.close(resolve)));
  const base = `http://127.0.0.1:${app.address().port}`;
  assert.equal((await fetch(base)).status, 401);
  assert.equal((await fetch(`${base}/api/v1/directory/summary`, { headers: { Authorization: 'Basic '+Buffer.from('viewer:wrong').toString('base64') } })).status, 401);
  assert.equal(queried, false);
  const result = await fetch(`${base}/api/v1/directory/summary`, { headers: { Authorization: 'Basic '+Buffer.from('viewer:synthetic-test-password').toString('base64') } });
  assert.equal(result.status, 200);
  assert.equal(queried, true);
});
