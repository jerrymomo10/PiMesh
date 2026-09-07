import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.mjs';

test('health checks distinguish process liveness from database readiness', async (t) => {
  let fail = false;
  const app = createApp({ query: async (sql) => {
    assert.equal(sql, 'SELECT 1');
    if (fail) throw new Error('secret database connection details');
  } });
  app.listen(0, '127.0.0.1');
  await once(app, 'listening');
  t.after(() => new Promise((resolve) => app.close(resolve)));
  const base = `http://127.0.0.1:${app.address().port}`;
  assert.equal((await fetch(`${base}/api/v1/health/ready`)).status, 200);
  fail = true;
  const response = await fetch(`${base}/api/v1/health/ready`);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: 'unavailable' });
  const live = await fetch(`${base}/api/v1/health/live`);
  assert.equal(live.status, 200);
  assert.equal(live.headers.get('x-pimesh-version'), '0.2.0');
  assert.deepEqual(await live.json(), { status: 'ok', version: '0.2.0' });
  assert.equal((await fetch(`${base}/api/v1/users`)).status, 404);
  assert.equal((await fetch(`${base}/api/v1/health/live`, { method: 'POST' })).status, 405);
});
