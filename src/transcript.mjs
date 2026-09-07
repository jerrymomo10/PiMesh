import { closeSync, fsyncSync, openSync, writeSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

// Each extension activation gets its own file: concurrent processes never share a writer.
export function createTranscript(directory, metadata) {
  const activationId = randomUUID();
  const path = join(directory, `${Date.now()}-${activationId}.jsonl`);
  const fd = openSync(path, 'wx', 0o600);
  let sequence = 0;
  let closed = false;
  function append(event, context = {}) {
    if (closed) throw new Error('Transcript is already closed.');
    const line = Buffer.from(`${JSON.stringify({
      schemaVersion: 1,
      activationId,
      sequence: sequence++,
      recordedAt: new Date().toISOString(),
      ...context,
      event,
    })}\n`);
    let offset = 0;
    while (offset < line.length) offset += writeSync(fd, line, offset, line.length - offset);
    fsyncSync(fd);
  }
  function close() {
    if (closed) return;
    closed = true;
    closeSync(fd);
  }
  try {
    append({ type: 'transcript_open', ...metadata });
  } catch (error) {
    close();
    throw error;
  }
  return { path, append, close };
}
