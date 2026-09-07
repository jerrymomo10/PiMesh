import test from 'node:test';
import assert from 'node:assert/strict';
import { serverOrigin } from '../src/team.mjs';
import { run, sandbox } from './helpers.mjs';

test('team CLI validates transport and runs without model credentials', () => {
  for (const url of ['http://example.test', 'https://u:p@example.test', 'https://example.test/path', 'https://example.test/?token=x']) {
    assert.throws(() => serverOrigin(url));
  }
  assert.equal(serverOrigin('https://example.test:8080/'), 'https://example.test:8080');
  const box = sandbox();
  const help = run(box, ['team','--help']); assert.equal(help.status, 0); assert.match(help.stdout, /password-stdin/);
  const who = run(box, ['team','whoami']); assert.equal(who.status, 1); assert.match(who.stderr, /Not logged in/);
  assert.equal(run(box, ['team','unbind']).status, 0);
  const bad = run(box, ['team','login','--password','synthetic']); assert.equal(bad.status, 1); assert.doesNotMatch(bad.stderr, /synthetic/);
});
