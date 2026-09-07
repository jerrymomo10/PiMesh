import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readdirSync, writeFileSync } from 'node:fs';
import { once } from 'node:events';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { root, sandbox, transcriptRows } from './helpers.mjs';

test('writer survives process kill with all acknowledged events', { timeout: 10000 }, async () => {
  const box = sandbox();
  const source = pathToFileURL(join(root, 'src/transcript.mjs')).href;
  const child = spawn(process.execPath, ['--input-type=module', '-e', `
    import { createTranscript } from ${JSON.stringify(source)};
    const writer = createTranscript(process.env.MESHPI_HOME, { test: true });
    writer.append({ type: 'message_update', delta: 'preserve-before-kill' });
    process.stdout.write('durable\\n');
    setInterval(() => {}, 1000);
  `], { env: { ...box.env, MESHPI_HOME: box.base }, stdio: ['ignore', 'pipe', 'pipe'] });
  const exited = once(child, 'exit');
  try {
    const ready = await Promise.race([
      once(child.stdout, 'data').then(([data]) => data.toString()),
      exited.then(() => { throw new Error('Writer exited before recording'); }),
      setTimeout(5000, 'timeout'),
    ]);
    assert.match(ready, /durable/);
    child.kill('SIGKILL');
    await exited;
    assert.equal(readdirSync(box.base).filter((p) => p.endsWith('.jsonl')).length, 1);
    assert.ok(transcriptRows(box.base).some((r) => r.event.delta === 'preserve-before-kill'));
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
});

test('recording failure exits instead of continuing with a silent gap', () => {
  const box = sandbox();
  writeFileSync(box.env.MESHPI_HOME, 'blocked storage');
  const source = pathToFileURL(join(root, 'extensions/transcript.mjs')).href;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import extension from ${JSON.stringify(source)};
    const hooks = new Map();
    extension({ on: (name, fn) => hooks.set(name, fn) });
    hooks.get('session_start')({ type: 'session_start' }, { cwd: process.cwd() });
    process.stdout.write('must-not-continue');
  `], { cwd: box.cwd, env: box.env, encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Transcript could not be saved/);
  assert.doesNotMatch(result.stdout, /must-not-continue/);
});
