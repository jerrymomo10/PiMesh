import { request } from 'node:https';
import { readFileSync, writeFileSync, mkdirSync, renameSync, unlinkSync, lstatSync, openSync, closeSync, constants, rmdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { hostname } from 'node:os';
import { createInterface } from 'node:readline/promises';
import { randomUUID } from 'node:crypto';

export const teamHelp = `meshpi team — team account and project connection

meshpi team login --server https://host:8080 --user USER [--ca FILE] [--name DEVICE]
meshpi team whoami
meshpi team teams [--page N]
meshpi team join                       Prompt for a team invitation
meshpi team projects --team TEAM_ID [--page N]
meshpi team bind --team TEAM_ID --project PROJECT_ID
meshpi team status                    Verify current login and directory binding
meshpi team unbind                    Remove only the current directory binding
meshpi team devices [--page N]
meshpi team revoke --device DEVICE_ID
meshpi team logout [--local-only]

Passwords are prompted without echo; --password-stdin supports non-interactive login.
Login reuses this device when possible; --new-device registers a replacement.
Use a trusted CA certificate for self-signed servers. TLS verification is always on.
No code, file content, or transcripts are uploaded. /login inside Pi configures models,
and is separate from this team login.
`;

export function serverOrigin(input) {
  let url;
  try { url = new URL(input); } catch { throw new Error('Provide an HTTPS server origin.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Server must be an HTTPS origin without credentials or a path.');
  return url.origin;
}
export function teamRequest(config, path, data, anonymous = false) {
  const origin = serverOrigin(config.origin);
  if (!path.startsWith('/api/v1/') || path.startsWith('//')) throw new Error('Invalid API path.');
  return new Promise((resolvePromise, reject) => {
    const body = data === undefined ? undefined : JSON.stringify(data);
    const req = request(new URL(path, origin), {
      method: body === undefined ? 'GET' : 'POST', ca: config.ca || undefined, minVersion: 'TLSv1.2', rejectUnauthorized: true,
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'X-PiMesh-Request': '1', 'Content-Length': Buffer.byteLength(body) }),
        ...(!anonymous && config.token ? { Authorization: `Bearer ${config.token}` } : {}) },
    }, (res) => {
      let size = 0; const chunks = [];
      res.on('data', (chunk) => { size += chunk.length; if (size > 1024 * 1024) req.destroy(new Error('Response too large')); else chunks.push(chunk); });
      res.on('error', () => reject(new Error('Server response interrupted; check status before retrying.')));
      res.on('end', () => {
        let result;
        try { result = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return reject(new Error('Server returned an invalid response.')); }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const safe = /^[a-z_]+$/.test(result.error || '') ? result.error : 'request_failed';
          const hint = res.statusCode === 401 ? ' Run meshpi team login again.' : safe === 'device_unavailable' ? ' Use login --new-device to register a replacement.' : safe === 'device_limit' ? ' Revoke an unused device in /devices first.' : '';
          return reject(Object.assign(new Error(`Team request failed (${res.statusCode}: ${safe}).${hint}`), { status: res.statusCode, code: safe }));
        }
        resolvePromise(result);
      });
    });
    const deadline = setTimeout(() => req.destroy(new Error('timeout')), 15000);
    req.on('close', () => clearTimeout(deadline));
    req.on('error', (error) => reject(new Error(`Cannot connect to team server (${error.code || 'network_error'}). Verify address, connectivity and the trusted CA; no TLS bypass is supported.`)));
    req.end(body);
  });
}
function readJson(path) {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || (process.platform !== 'win32' && (stat.mode & 0o077))) throw new Error('Team state must be a private regular file (0600).');
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function atomicJson(path, data) {
  const tmp = `${path}.${randomUUID()}.tmp`;
  const fd = openSync(tmp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
  try { writeFileSync(fd, JSON.stringify(data, null, 2) + '\n'); } finally { closeSync(fd); }
  try { renameSync(tmp, path); } finally { try { unlinkSync(tmp); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
}
const files = (paths) => ({ dir: join(paths.stateDir, 'team'), credentials: join(paths.stateDir, 'team', 'credentials.json'), binding: join(paths.stateDir, 'workspaces', paths.workspaceId, 'team-project.json') });
export function readBinding(paths) { return readJson(files(paths).binding); }
async function secret(prompt, stdin = false) {
  if (stdin) {
    let text = '';
    for await (const chunk of process.stdin) { text += chunk; if (text.length > 1024) throw new Error('Password input too long.'); }
    return text.replace(/\r?\n$/, '');
  }
  if (!process.stdin.isTTY) throw new Error('Interactive input required; use --password-stdin for login.');
  process.stderr.write(prompt);
  const input = process.stdin; const wasRaw = input.isRaw;
  input.setRawMode(true); input.resume(); input.setEncoding('utf8');
  return new Promise((resolvePromise, reject) => {
    let value = '';
    const done = (error) => {
      input.off('data', onData); input.setRawMode(wasRaw); input.pause(); process.stderr.write('\n');
      if (error) reject(error); else resolvePromise(value);
    };
    function onData(chunk) {
      for (const c of chunk) {
        if (c === '\u0003' || c === '\u0004') return done(new Error('Input cancelled.'));
        if (c === '\r' || c === '\n') return done();
        if (c === '\u007f' || c === '\b') value = value.slice(0, -1);
        else if (c >= ' ' && value.length < 1024) value += c;
      }
    }
    input.on('data', onData);
  });
}
function parse(args) {
  const result = {};
  const flags = new Set(['password-stdin', 'new-device', 'local-only']);
  const values = new Set(['server', 'user', 'ca', 'name', 'team', 'project', 'device', 'page']);
  for (let i = 0; i < args.length; i++) {
    const key = args[i].replace(/^--/, '');
    if (!args[i].startsWith('--') || key in result) throw new Error('Invalid or duplicate team option.');
    if (flags.has(key)) result[key] = true;
    else if (values.has(key) && args[i + 1] && !args[i + 1].startsWith('--')) result[key] = args[++i];
    else throw new Error(`Unknown or missing team option: ${args[i]}`);
  }
  return result;
}
const requiredId = (value, label) => { if (!/^[a-f0-9-]{36}$/.test(value || '')) throw new Error(`Provide --${label} with a UUID from the list.`); return value; };
export async function runTeam(args, paths) {
  const command = args[0];
  if (!command || ['help', '--help', '-h'].includes(command)) { process.stdout.write(teamHelp); return; }
  const options = parse(args.slice(1)), f = files(paths);
  mkdirSync(f.dir, { recursive: true, mode: 0o700 });
  // Fail closed on concurrent CLI mutations; do not silently overwrite credentials/binding.
  const lock = join(f.dir, '.lock');
  try { mkdirSync(lock, { mode: 0o700 }); } catch (error) { if (error.code === 'EEXIST') throw new Error(`Another team command may be running. If interrupted, inspect and remove ${lock} before retrying.`); throw error; }
  try {
    let config = readJson(f.credentials);
    const print = (data) => process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    if (command === 'login') {
      const origin = serverOrigin(options.server || config?.origin);
      if (!options.user) throw new Error('Provide --user (username or email).');
      const ca = options.ca ? readFileSync(resolve(options.ca), 'utf8') : config?.origin === origin ? config.ca : undefined;
      const password = await secret('Team password: ', options['password-stdin']);
      const same = config?.origin === origin && config?.login === options.user;
      const result = await teamRequest({ origin, ca }, '/api/v1/cli/login', {
        login: options.user, password, name: options.name || hostname(),
        ...(same && !options['new-device'] ? { device_id: config.device.device_id } : {}),
      }, true);
      if (!/^[A-Za-z0-9_-]{43}$/.test(result.token || '') || !result.device?.device_id || !result.user?.user_id) throw new Error('Invalid login response.');
      config = { origin, ca, login: options.user, ...result };
      atomicJson(f.credentials, config);
      print({ logged_in: true, server: origin, user: result.user, device: result.device, expires_at: result.expires_at }); return;
    }
    if (command === 'unbind') { try { unlinkSync(f.binding); } catch (error) { if (error.code !== 'ENOENT') throw error; } print({ unbound: true }); return; }
    if (!config) throw new Error('Not logged in. Run meshpi team login --server URL --user USER.');
    if (command === 'logout') {
      if (!options['local-only']) {
        try { await teamRequest(config, '/api/v1/cli/logout', {}); }
        catch (error) { if (error.status !== 401) throw error; }
      }
      unlinkSync(f.credentials);
      print({ logged_out: true, remote_revocation: !options['local-only'], note: 'Local project bindings are retained; transcripts are unchanged.' }); return;
    }
    const page = options.page || '1';
    if (!/^[1-9][0-9]{0,4}$/.test(page)) throw new Error('Invalid --page.');
    if (command === 'whoami') print(await teamRequest(config, '/api/v1/cli/me'));
    else if (command === 'teams') print(await teamRequest(config, `/api/v1/teams?page=${page}`));
    else if (command === 'devices') print(await teamRequest(config, `/api/v1/devices?page=${page}`));
    else if (command === 'revoke') print(await teamRequest(config, `/api/v1/devices/${requiredId(options.device, 'device')}/revoke`, {}));
    else if (command === 'projects') print(await teamRequest(config, `/api/v1/teams/${requiredId(options.team, 'team')}/projects?page=${page}`));
    else if (command === 'join') {
      if (!process.stdin.isTTY) throw new Error('Run join in an interactive terminal.');
      const reader = createInterface({ input: process.stdin, output: process.stderr });
      let code; try { code = (await reader.question('Team invitation: ')).trim(); } finally { reader.close(); }
      print(await teamRequest(config, '/api/v1/teams/join', { code }));
    } else if (command === 'bind') {
      const teamId = requiredId(options.team, 'team'), projectId = requiredId(options.project, 'project');
      const identity = (await teamRequest(config, '/api/v1/cli/me')).user;
      const team = (await teamRequest(config, `/api/v1/teams/${teamId}`)).team;
      const project = (await teamRequest(config, `/api/v1/teams/${teamId}/projects/${projectId}`)).project;
      const binding = { server: config.origin, user_id: identity.user_id, team_id: teamId, team_name: team.name, project_id: projectId, project_name: project.name, verified_at: new Date().toISOString() };
      mkdirSync(join(paths.stateDir, 'workspaces', paths.workspaceId), { recursive: true, mode: 0o700 });
      const previous = readBinding(paths);
      if (previous && (previous.server !== binding.server || previous.project_id !== binding.project_id || previous.user_id !== binding.user_id)) throw new Error('This directory is already bound. Run meshpi team unbind before changing its project.');
      atomicJson(f.binding, binding); print(binding);
    } else if (command === 'status') {
      const identity = (await teamRequest(config, '/api/v1/cli/me')).user;
      const binding = readBinding(paths);
      if (binding) {
        if (binding.server !== config.origin || binding.user_id !== identity.user_id) throw new Error('Binding belongs to another server/account; unbind or log in to that account.');
        await teamRequest(config, `/api/v1/teams/${binding.team_id}/projects/${binding.project_id}`);
      }
      print({ user: identity, binding, status: 'verified' });
    } else throw new Error('Unknown team command. Run meshpi team --help.');
  } finally { rmdirSync(lock); }
}
