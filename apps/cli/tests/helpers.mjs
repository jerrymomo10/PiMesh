import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const cli = join(root, 'bin', 'meshpi.mjs');
export function sandbox() {
  const base = mkdtempSync(join(tmpdir(), 'meshpi-test-'));
  const cwd = join(base, 'research project');
  mkdirSync(cwd);
  writeFileSync(join(cwd, 'evidence.txt'), 'SYNTHETIC EVIDENCE 中文\n');
  return {
    base, cwd,
    env: {
      PATH: process.env.PATH, HOME: base, TMPDIR: base,
      MESHPI_HOME: join(base, 'state'), PI_OFFLINE: '1', PI_TELEMETRY: '0',
    },
  };
}
export function run(box, args, entry = cli) {
  return spawnSync(process.execPath, [entry, ...args], {
    cwd: box.cwd, env: box.env, encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024,
  });
}
export const inferenceArgs = [
  '--print', '--provider', 'meshpi-test', '--model', 'fixture',
  '--extension', join(root, 'tests', 'fixtures', 'provider.mjs'),
  '--no-extensions', '--no-skills', '--no-prompt-templates', '--tools', 'read',
];
export function jsonLines(path) {
  return readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
}
export function transcriptRows(directory) {
  return readdirSync(directory).filter((name) => name.endsWith('.jsonl')).flatMap((name) => jsonLines(join(directory, name)));
}
