import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createAuth, createLimiter, digest, hashPassword, verifyPassword, registration } from '../src/auth.mjs';
import { createApp } from '../src/app.mjs';

const fixture = { username: 'Researcher', email: 'Researcher@example.test', password: 'Synthetic-password-123', invite: 'x'.repeat(43) };
test('passwords use independent salts and verify without plaintext storage', async () => {
  const first = await hashPassword(fixture.password), second = await hashPassword(fixture.password);
  assert.notEqual(first, second); assert.ok(!first.includes(fixture.password));
  assert.equal(await verifyPassword(fixture.password, first), true);
  assert.equal(await verifyPassword('wrong', first), false);
  assert.equal(await verifyPassword(fixture.password, undefined), false);
});
test('registration validation and bounded rate limiter', () => {
  assert.equal(registration(fixture).username, 'researcher');
  assert.equal(registration(fixture).email, 'researcher@example.test');
  for (const change of [{ username: 'a@b' }, { email: 'invalid' }, { password: 'short' }, { invite: 'bad' }, { username: {} }]) {
    assert.throws(() => registration({ ...fixture, ...change }), { status: 400 });
  }
  let time = 0; const limiter = createLimiter({ now: () => time, maximum: 1 });
  limiter('one', 1); assert.throws(() => limiter('one', 1), { status: 429 });
  assert.throws(() => limiter('two'), { status: 429 });
  time += 900001; limiter('two');
});
test('duplicate registration rolls back redemption and releases connection', async () => {
  const calls = []; let released = false;
  const auth = createAuth({ connect: async () => ({
    query: async (sql) => {
      calls.push(sql);
      if (sql.startsWith('SELECT invite_id')) return { rows: [{ invite_id: 'fixture' }] };
      if (sql.startsWith('INSERT INTO users')) throw Object.assign(new Error('private sql'), { code: '23505' });
      return { rows: [] };
    }, release: () => { released = true; },
  }) });
  await assert.rejects(auth.register(fixture), { status: 409, code: 'account_unavailable' });
  assert.equal(calls.at(-1), 'ROLLBACK'); assert.ok(released);
  assert.ok(!calls.some((sql) => sql.startsWith('UPDATE registration_invites')));
});
test('HTTP auth boundaries: opt-in, admin isolation, CSRF, body limits and safe errors', async (t) => {
  let calls = 0;
  const pool = { query: async () => { calls++; throw new Error('database-secret'); } };
  const app = createApp(pool, { authEnabled: true, publicOrigin: 'https://example.test',
    adminHash: digest('admin:synthetic-password'), accessHash: digest('viewer:another-password') });
  app.listen(0, '127.0.0.1'); await once(app, 'listening');
  t.after(() => new Promise((resolve) => app.close(resolve)));
  const base = `http://127.0.0.1:${app.address().port}`;
  const headers = { 'Content-Type': 'application/json', 'X-PiMesh-Request': '1' };
  const post = (path, data = {}, extra = headers) => fetch(base + path, { method: 'POST', headers: extra, body: JSON.stringify(data) });
  assert.equal((await fetch(base + '/account')).status, 200);
  assert.equal((await fetch(base + '/admin/invites')).status, 401);
  assert.equal((await post('/api/v1/admin/invites')).status, 401);
  assert.equal((await post('/api/v1/admin/invites', {}, { ...headers, Authorization: 'Basic '+Buffer.from('viewer:another-password').toString('base64') })).status, 401);
  assert.equal((await post('/api/v1/auth/register', fixture, { ...headers, Origin: 'https://evil.test' })).status, 403);
  assert.equal((await post('/api/v1/auth/register', fixture, { 'Content-Type': 'application/json' })).status, 403);
  assert.equal((await post('/api/v1/auth/register', {}, { ...headers, 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await post('/api/v1/auth/register', { large: 'x'.repeat(9000) })).status, 413);
  assert.equal((await fetch(base + '/api/v1/auth/login')).status, 405);
  assert.equal((await fetch(base + '/api/v1/auth/me')).status, 401);
  assert.equal(calls, 0);
  const failed = await post('/api/v1/auth/login', { login: 'synthetic', password: fixture.password });
  assert.equal(failed.status, 503); assert.deepEqual(await failed.json(), { error: 'service_unavailable' });
  const logout = await post('/api/v1/auth/logout');
  assert.equal(logout.status, 200); assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
});
