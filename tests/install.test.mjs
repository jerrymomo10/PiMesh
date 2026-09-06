import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { inferenceArgs, root, run, sandbox, transcriptRows } from './helpers.mjs';

test('package installs into a clean prefix and runs the real Pi recorder offline', { timeout: 120000 }, () => {
  const box = sandbox();
  // Model inference stays offline. npm may need registry metadata even after npm ci.
  const npmEnv = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: box.base };
  if (process.env.npm_config_cache) npmEnv.npm_config_cache = process.env.npm_config_cache;
  function npm(args, cwd = root) {
    const result = spawnSync('npm', args, { cwd, env: npmEnv, encoding: 'utf8', timeout: 90000 });
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
    return result;
  }
  const packed = JSON.parse(npm(['pack', '--json', '--ignore-scripts', '--pack-destination', box.base]).stdout)[0];
  for (const path of ['bin/meshpi.mjs', 'src/transcript.mjs', 'extensions/transcript.mjs', 'npm-shrinkwrap.json']) {
    assert.ok(packed.files.some((file) => file.path === path), path);
  }
  assert.ok(packed.files.every((file) => !/^(tests|node_modules|\.git|\.meshpi)\//.test(file.path)));
  const prefix = join(box.base, 'installed');
  npm(['install', '--global', '--prefer-offline', '--ignore-scripts', '--no-audit', '--no-fund',
    '--prefix', prefix, join(box.base, packed.filename)]);
  const executable = join(prefix, 'bin', 'meshpi');
  assert.ok(existsSync(executable));
  const direct = spawnSync(executable, ['--version'], { cwd: box.cwd, env: box.env, encoding: 'utf8' });
  assert.equal(direct.status, 0, direct.stderr);
  assert.match(direct.stdout, /meshpi 0.1.0/);
  assert.ok(!existsSync(join(prefix, 'bin', 'pi')), 'Do not register an upstream pi command');
  assert.equal(run(box, ['--version'], executable).stdout.trim(), 'meshpi 0.1.0');
  const started = run(box, [...inferenceArgs, 'Read the evidence.'], executable);
  assert.equal(started.status, 0, `${started.stderr}\n${started.stdout}`);
  assert.match(started.stdout, /Fixture complete/);
  const paths = JSON.parse(run(box, ['paths'], executable).stdout);
  assert.equal(readdirSync(paths.sessionDir).length, 1);
  assert.ok(transcriptRows(paths.transcriptDir).some((r) => r.event.type === 'tool_execution_end'));
  const installedManifest = JSON.parse(readFileSync(join(prefix, 'lib/node_modules/@pimesh/meshpi/package.json')));
  assert.deepEqual(Object.keys(installedManifest.bin), ['meshpi']);
  // Exercise the exact source-directory install command documented in README too.
  const sourcePrefix = join(box.base, 'source-install');
  npm(['install', '--global', '--install-links', '--prefer-offline', '--ignore-scripts',
    '--no-audit', '--no-fund', '--prefix', sourcePrefix, '.']);
  const sourceCommand = join(sourcePrefix, 'bin', 'meshpi');
  const doctor = run(box, ['doctor'], sourceCommand);
  assert.equal(doctor.status, 0, doctor.stderr);
});
