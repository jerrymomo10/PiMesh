import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { inferenceArgs, jsonLines, run, sandbox, transcriptRows } from './helpers.mjs';

test('setup is idempotent; paths and doctor work without credentials', () => {
  const box = sandbox();
  for (const command of ['--help', '--version', 'setup', 'setup', 'doctor']) {
    const result = run(box, [command]);
    assert.equal(result.status, 0, result.stderr);
  }
  const paths = JSON.parse(run(box, ['paths']).stdout);
  assert.equal(statSync(paths.stateDir).mode & 0o777, 0o700);
  assert.equal(run(box, ['--no-session']).status, 1);
  assert.equal(run(box, ['--session-dir=/tmp/elsewhere']).status, 1);
  const blocked = sandbox();
  writeFileSync(blocked.env.MESHPI_HOME, 'not a directory');
  assert.equal(run(blocked, ['setup']).status, 1);
});

test('real Pi CLI records a tool roundtrip and resumes the same native session offline', () => {
  const box = sandbox();
  const first = run(box, [...inferenceArgs, 'Read evidence.txt and report.']);
  assert.equal(first.status, 0, `${first.stderr}\n${first.stdout}`);
  assert.match(first.stdout, /Fixture complete/);
  assert.doesNotMatch(first.stderr, /Failed to load extension|Error in extension/);
  const paths = JSON.parse(run(box, ['paths']).stdout);
  const files = readdirSync(paths.sessionDir);
  assert.equal(files.length, 1);
  const before = jsonLines(join(paths.sessionDir, files[0]));
  assert.equal(statSync(join(paths.sessionDir, files[0])).mode & 0o777, 0o600);
  const second = run(box, [...inferenceArgs, '--continue', 'Read it again.']);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(readdirSync(paths.sessionDir).length, 1);
  const after = jsonLines(join(paths.sessionDir, files[0]));
  assert.ok(after.length > before.length);
  assert.equal(after[0].id, before[0].id);
  const rows = transcriptRows(paths.transcriptDir);
  for (const type of ['session_start', 'message_end', 'message_update', 'tool_execution_start', 'tool_execution_end', 'session_snapshot']) {
    assert.ok(rows.some((r) => r.event.type === type), type);
  }
  const messages = rows.filter((r) => r.event.type === 'message_end').map((r) => r.event.message);
  assert.ok(messages.some((m) => m.role === 'user'));
  assert.ok(messages.some((m) => m.role === 'assistant'));
  assert.ok(messages.some((m) => m.role === 'toolResult' && JSON.stringify(m).includes('SYNTHETIC EVIDENCE')));
});

test('default home uses .meshpi without changing legacy storage; override still works', () => {
  const box = sandbox();
  const override = box.env.MESHPI_HOME;
  delete box.env.MESHPI_HOME;
  const legacy = join(box.base, '.local', 'state', 'meshpi');
  mkdirSync(legacy, { recursive: true });
  const sentinel = join(legacy, 'synthetic.txt');
  writeFileSync(sentinel, 'legacy evidence');
  assert.equal(run(box, ['setup']).status, 0);
  const paths = JSON.parse(run(box, ['paths']).stdout);
  assert.equal(paths.stateDir, join(box.base, '.meshpi'));
  assert.equal(paths.agentDir, join(paths.stateDir, 'agent'));
  assert.equal(statSync(paths.stateDir).mode & 0o777, 0o700);
  assert.equal(readFileSync(sentinel, 'utf8'), 'legacy evidence');
  assert.deepEqual(readdirSync(paths.agentDir), []);
  box.env.MESHPI_HOME = override;
  assert.equal(JSON.parse(run(box, ['paths']).stdout).stateDir, override);
  box.env.MESHPI_HOME = 'relative';
  const invalid = run(box, ['setup']);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /absolute/);
});
