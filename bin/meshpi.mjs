#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { accessSync, readFileSync } from 'node:fs';
import { preparePaths, resolvePaths } from '../src/paths.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const args = process.argv.slice(2);
const help = `meshpi — PiMesh local research client

Usage: meshpi [Pi options] [prompt]
       meshpi setup       Create local storage (no credentials required)
       meshpi paths       Show storage paths for the current workspace
       meshpi doctor      Check Node, pinned Pi, and writable storage

meshpi --continue        Continue this workspace's last session
meshpi --resume          Select a previous session
meshpi --pi-help         Show upstream Pi options
meshpi --version         Show client version

Transcripts are saved locally and are never uploaded by this version.
Use MESHPI_HOME (absolute path) to choose a different storage root.
`;

try {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 19)) throw new Error('Node.js >=22.19.0 is required.');
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    process.stdout.write(help);
  } else if (args.length === 1 && ['--version', '-v'].includes(args[0])) {
    process.stdout.write(`meshpi ${manifest.version}\n`);
  } else {
    process.umask(process.umask() | 0o077);
    const paths = resolvePaths();
    if (args.length === 1 && args[0] === 'paths') {
      process.stdout.write(`${JSON.stringify(paths, null, 2)}\n`);
    } else if (args.length === 1 && args[0] === 'setup') {
      preparePaths(paths);
      process.stdout.write(`meshpi storage ready: ${paths.stateDir}\nRun meshpi in your project, then /login to configure a provider.\n`);
    } else {
      for (const arg of args) {
        if (/^--(?:no-session|session-dir)(?:=|$)/.test(arg)) {
          throw new Error(`${arg} is managed by meshpi; persistent recording cannot be disabled.`);
        }
      }
      const coreCli = join(dirname(fileURLToPath(import.meta.resolve('@earendil-works/pi-coding-agent'))), 'cli.js');
      accessSync(coreCli);
      accessSync(join(root, 'extensions', 'transcript.mjs'));
      preparePaths(paths);
      if (args.length === 1 && args[0] === 'doctor') {
        const check = spawnSync(process.execPath, [coreCli, '--version'], {
          encoding: 'utf8', timeout: 15000,
          env: { ...process.env, PI_CODING_AGENT_DIR: paths.agentDir, PI_OFFLINE: '1', PI_TELEMETRY: '0' },
        });
        if (check.status !== 0) throw new Error(`Pi startup check failed: ${check.error?.message || check.stderr}`);
        if (check.stdout.trim() !== manifest.dependencies['@earendil-works/pi-coding-agent']) {
          throw new Error(`Unexpected Pi version: ${check.stdout.trim()}`);
        }
        const { createTranscript } = await import('../src/transcript.mjs');
        const probe = createTranscript(paths.transcriptDir, { type: 'doctor_check', workspace: paths.workspace });
        probe.close();
        process.stdout.write(`OK Node ${process.versions.node}\nOK Pi ${manifest.dependencies['@earendil-works/pi-coding-agent']}\nOK durable storage ${paths.stateDir}\n`);
      } else {
        const forwarded = args.length === 1 && args[0] === '--pi-help' ? ['--help'] : args;
        const child = spawn(process.execPath, [
          coreCli, ...forwarded,
          '--session-dir', paths.sessionDir,
          '--extension', join(root, 'extensions', 'transcript.mjs'),
        ], {
          stdio: 'inherit',
          env: { PI_TELEMETRY: '0', ...process.env, PI_CODING_AGENT_DIR: paths.agentDir },
        });
        const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
        const handlers = signals.map((signal) => {
          const handler = () => child.kill(signal);
          process.on(signal, handler);
          return [signal, handler];
        });
        child.on('error', (error) => {
          process.stderr.write(`meshpi: ${error.message}\n`);
          process.exitCode = 1;
        });
        child.on('close', (code, signal) => {
          for (const [name, handler] of handlers) process.off(name, handler);
          process.exitCode = code ?? ({ SIGINT: 130, SIGTERM: 143, SIGHUP: 129 }[signal] || 1);
        });
      }
    }
  }
} catch (error) {
  process.stderr.write(`meshpi: ${error.message}\n`);
  process.exitCode = 1;
}
