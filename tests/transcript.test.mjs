import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createTranscript } from '../src/transcript.mjs';
import transcriptExtension from '../extensions/transcript.mjs';
import { jsonLines, sandbox, transcriptRows } from './helpers.mjs';
import { resolvePaths } from '../src/paths.mjs';

test('append log preserves large Unicode/image messages and independent writers', () => {
  const box = sandbox();
  const a = createTranscript(box.base, { workspace: box.cwd });
  const b = createTranscript(box.base, { workspace: box.cwd });
  const event = { type: 'message_end', message: { content: [
    { type: 'text', text: '中'.repeat(100000) }, { type: 'image', data: 'synthetic-base64' },
  ] } };
  a.append(event);
  assert.deepEqual(jsonLines(a.path)[1].event, event); // Durable before close.
  assert.notEqual(a.path, b.path);
  assert.equal(statSync(a.path).mode & 0o777, 0o600);
  a.close(); a.close(); b.close();
  assert.throws(() => a.append(event), /closed/);
  assert.throws(() => createTranscript(join(box.base, 'missing'), {}), /ENOENT/);
});

test('compaction, branching, session replacement and stream deltas retain prior evidence', () => {
  const box = sandbox();
  const prior = process.env.MESHPI_HOME;
  process.env.MESHPI_HOME = box.env.MESHPI_HOME;
  try {
    const hooks = new Map();
    transcriptExtension({ on: (name, callback) => hooks.set(name, callback) });
    let id = 'session-a';
    const entries = [{ id: 'original', type: 'message', message: { role: 'user', content: 'before compact' } }];
    const ctx = { cwd: box.cwd, sessionManager: {
      getSessionId: () => id, getSessionFile: () => `${id}.jsonl`,
      getHeader: () => ({ id, cwd: box.cwd }), getEntries: () => entries,
    } };
    hooks.get('session_start')({ type: 'session_start' }, ctx);
    hooks.get('message_update')({ type: 'message_update', assistantMessageEvent: {
      type: 'text_delta', delta: 'partial response', partial: { content: [] },
    } }, ctx);
    entries.push({ id: 'compact', type: 'compaction', summary: 'short summary' });
    hooks.get('session_compact')({ type: 'session_compact' }, ctx);
    hooks.get('session_tree')({ type: 'session_tree' }, ctx);
    hooks.get('session_shutdown')({ type: 'session_shutdown', reason: 'new' }, ctx);
    id = 'session-b';
    hooks.get('session_start')({ type: 'session_start', reason: 'new' }, ctx);
    hooks.get('session_shutdown')({ type: 'session_shutdown' }, ctx);
    const rows = transcriptRows(resolvePaths(box.cwd, box.env).transcriptDir);
    assert.ok(rows.some((r) => r.sessionId === 'session-a'));
    assert.ok(rows.some((r) => r.sessionId === 'session-b'));
    const snapshots = rows.filter((r) => r.event.type === 'session_snapshot');
    assert.ok(snapshots.some((r) => r.event.entries.some((e) => e.id === 'original')));
    assert.ok(snapshots.some((r) => r.event.entries.some((e) => e.id === 'compact')));
    assert.equal(rows.find((r) => r.event.type === 'message_update').event.assistantMessageEvent.delta, 'partial response');
  } finally {
    if (prior === undefined) delete process.env.MESHPI_HOME;
    else process.env.MESHPI_HOME = prior;
  }
});

test('workspace IDs separate projects and reject relative state roots', () => {
  const box = sandbox();
  const other = join(box.base, 'other'); mkdirSync(other);
  assert.notEqual(resolvePaths(box.cwd, box.env).workspaceId, resolvePaths(other, box.env).workspaceId);
  assert.throws(() => resolvePaths(box.cwd, { MESHPI_HOME: 'relative' }), /absolute/);
});
