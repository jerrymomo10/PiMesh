import { createHash } from 'node:crypto';
import { mkdirSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';

export function resolvePaths(cwd = process.cwd(), env = process.env) {
  const workspace = realpathSync(cwd);
  const stateDir = env.MESHPI_HOME || join(homedir(), '.local', 'state', 'meshpi');
  if (!isAbsolute(stateDir)) throw new Error('MESHPI_HOME must be an absolute path.');
  // Local workspace identity only. Team project identity is a separate future contract.
  const workspaceId = createHash('sha256').update(workspace).digest('hex').slice(0, 24);
  return {
    workspace,
    workspaceId,
    stateDir,
    agentDir: join(stateDir, 'agent'),
    sessionDir: join(stateDir, 'workspaces', workspaceId, 'sessions'),
    transcriptDir: join(stateDir, 'workspaces', workspaceId, 'transcripts'),
  };
}

export function preparePaths(paths) {
  for (const key of ['stateDir', 'agentDir', 'sessionDir', 'transcriptDir']) {
    mkdirSync(paths[key], { recursive: true, mode: 0o700 });
  }
}
