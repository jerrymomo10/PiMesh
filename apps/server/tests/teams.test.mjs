import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.mjs';
import { digest } from '../src/auth.mjs';
import { createTeams, pageOffset } from '../src/teams.mjs';

test('team creation rolls back if owner membership fails and releases connection', async () => {
  const calls = []; let released = false;
  const teams = createTeams({ connect: async () => ({
    query: async (sql) => {
      calls.push(sql);
      if (sql.startsWith('SELECT user_id')) return { rows: [{ user_id: 'synthetic-owner' }] };
      if (sql.startsWith('INSERT INTO teams')) return { rows: [{ team_id: 'synthetic-team' }] };
      if (sql.startsWith('INSERT INTO memberships')) throw new Error('fixture failure');
      return { rows: [] };
    }, release: () => { released = true; },
  }) });
  await assert.rejects(teams.create({ name: 'Synthetic', owner: 'owner' }), /fixture failure/);
  assert.equal(calls.at(-1), 'ROLLBACK'); assert.equal(released, true);
  assert.equal(pageOffset('2'), 25);
  for (const page of ['0', '-1', '1.2', '100000', '1 OR 1=1']) assert.throws(() => pageOffset(page), { status: 400 });
});

test('workspace routes separate public pages, admin credentials and directory credentials', async (t) => {
  let queries = 0;
  const app = createApp({ query: async () => { queries++; throw new Error('database-secret'); } }, {
    authEnabled: true, dashboardEnabled: true, publicOrigin: 'https://example.test',
    adminHash: digest('admin:synthetic'), accessHash: digest('viewer:synthetic'),
  });
  app.listen(0, '127.0.0.1'); await once(app, 'listening');
  t.after(() => new Promise((resolve) => app.close(resolve)));
  const base = `http://127.0.0.1:${app.address().port}`;
  for (const path of ['/', '/account', '/workspace.js', '/team-api.js']) assert.equal((await fetch(base + path)).status, 200);
  for (const [path, location] of [['/workspace', '/'], ['/directory', '/admin/directory'], ['/admin', '/admin/teams']]) {
    const response = await fetch(base + path, { redirect: 'manual' });
    assert.equal(response.status, 302); assert.equal(response.headers.get('location'), location);
  }
  const admin = { Authorization: 'Basic ' + Buffer.from('admin:synthetic').toString('base64') };
  const viewer = { Authorization: 'Basic ' + Buffer.from('viewer:synthetic').toString('base64') };
  assert.equal((await fetch(base + '/admin/teams', { headers: admin })).status, 200);
  assert.equal((await fetch(base + '/admin/directory', { headers: viewer })).status, 200);
  assert.equal((await fetch(base + '/admin/directory', { headers: admin })).status, 401);
  assert.equal((await fetch(base + '/admin/teams', { headers: viewer })).status, 401);
  for (const path of ['/api/v1/teams', '/api/v1/teams/join', '/api/v1/admin/teams']) {
    assert.equal((await fetch(base + path)).status, 401);
  }
  const post = (extra, body = '{}') => fetch(base + '/api/v1/admin/teams', {
    method: 'POST', headers: { ...admin, 'Content-Type': 'application/json', ...extra }, body,
  });
  assert.equal((await post({})).status, 403);
  assert.equal((await post({ 'X-PiMesh-Request': '1', Origin: 'https://evil.test' })).status, 403);
  assert.equal((await post({ 'X-PiMesh-Request': '1', 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await post({ 'X-PiMesh-Request': '1' }, JSON.stringify({ name: 'x'.repeat(9000) }))).status, 413);
  assert.equal(queries, 0);
  const failed = await fetch(base + '/api/v1/admin/teams', { headers: admin });
  assert.equal(failed.status, 503); assert.deepEqual(await failed.json(), { error: 'service_unavailable' });
});
