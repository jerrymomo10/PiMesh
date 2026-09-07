import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { request as httpsRequest } from 'node:https';
import pg from 'pg';
import { createAuth, digest, hashPassword } from '../src/auth.mjs';
import { createDevices } from '../src/devices.mjs';
import { createTeams } from '../src/teams.mjs';
import { createApp } from '../src/app.mjs';
import { teamRequest } from '../../cli/src/team.mjs';

test('real PostgreSQL and real CLI entry: TLS login, device revoke, binding and account lifecycle', { skip: !process.env.TEST_DATABASE_URL, timeout: 90000 }, async () => {
  const control = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const schema = `devices_${randomUUID().replaceAll('-', '')}`, dir = mkdtempSync(join(tmpdir(), 'pimesh-client-'));
  let pool, app, created = false;
  try {
    assert.match((await control.query('SELECT current_database() AS name')).rows[0].name, /^pimesh_test_/);
    await control.query(`CREATE SCHEMA ${schema}`); created = true;
    pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}` });
    const migrations = new URL('../migrations/', import.meta.url);
    for (const file of readdirSync(migrations).filter((n) => n.endsWith('.sql')).sort()) await pool.query(readFileSync(new URL(file, migrations), 'utf8'));
    const user = randomUUID(), other = randomUUID(), password = 'Test-123', hash = await hashPassword(password);
    for (const [id, username] of [[user, 'cli_owner'], [other, 'cli_other']]) {
      await pool.query('INSERT INTO users(user_id,username,email,display_name,password_hash) VALUES ($1,$2,$3,$2,$4)', [id, username, `${username}@example.test`, hash]);
    }
    const devices = createDevices(pool), teams = createTeams(pool), auth = createAuth(pool);
    const a = await teams.create({ name: 'CLI synthetic team', owner: 'cli_owner' });
    const b = await teams.create({ name: 'Other team', owner: 'cli_other' });
    const project = await teams.createProject(user, a.team_id, { name: 'CLI project', slug: 'cli-project' });
    execFileSync('openssl', ['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(dir,'key.pem'),'-out',join(dir,'cert.pem'),'-days','1','-subj','/CN=localhost','-addext','subjectAltName=IP:127.0.0.1,DNS:localhost'], { stdio: 'ignore' });
    const ca = readFileSync(join(dir, 'cert.pem'), 'utf8');
    app = createApp(pool, { authEnabled: true, publicOrigin: 'https://example.test', adminHash: digest('admin:synthetic'),
      tlsOptions: { cert: ca, key: readFileSync(join(dir, 'key.pem')) } });
    app.listen(0, '127.0.0.1'); await once(app, 'listening');
    const origin = `https://127.0.0.1:${app.address().port}`;
    const http = (path, authorization, data) => new Promise((resolve, reject) => {
      const req = httpsRequest(new URL(path, origin), { ca, method: data === undefined ? 'GET' : 'POST',
        headers: { Authorization: authorization, ...(data === undefined ? {} : { 'Content-Type': 'application/json', 'X-PiMesh-Request': '1' }) } }, (res) => {
        let text = ''; res.on('data', (chunk) => text += chunk); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(text) }));
      });
      req.on('error', reject); req.end(data === undefined ? undefined : JSON.stringify(data));
    });
    const admin = 'Basic ' + Buffer.from('admin:synthetic').toString('base64');
    const cli = (args, input = '') => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [fileURLToPath(new URL('../../cli/bin/meshpi.mjs', import.meta.url)), 'team', ...args], {
        cwd: dir, env: { ...process.env, MESHPI_HOME: join(dir, 'state') }, stdio: ['pipe','pipe','pipe'],
      });
      let stdout = '', stderr = '';
      child.stdout.on('data', (s) => stdout += s); child.stderr.on('data', (s) => stderr += s);
      child.on('error', reject); child.on('close', (code) => resolve({ code, stdout, stderr })); child.stdin.end(input);
    });
    const loginArgs = ['login','--server',origin,'--user','cli_owner','--ca',join(dir,'cert.pem'),'--name','Synthetic CLI','--password-stdin'];
    const logged = await cli(loginArgs, password + '\n'); assert.equal(logged.code, 0, logged.stderr);
    assert.doesNotMatch(logged.stdout, /"token"|Test-123/);
    const credentialPath = join(dir, 'state/team/credentials.json');
    let credentials = JSON.parse(readFileSync(credentialPath));
    assert.equal(statSync(credentialPath).mode & 0o777, 0o600);
    const oldToken = credentials.token;
    assert.equal((await http('/api/v1/admin/users', `Bearer ${oldToken}`)).status, 401);
    const users = await http('/api/v1/admin/users', admin);
    assert.equal(users.status, 200); assert.ok(users.body.items.every((row) => !('password_hash' in row)));
    assert.equal((await http(`/api/v1/admin/users/${user}/devices`, admin)).status, 200);
    assert.equal((await cli(['whoami'])).code, 0);
    assert.equal((await cli(['teams'])).code, 0);
    assert.equal((await cli(['projects','--team',a.team_id])).code, 0);
    assert.equal((await cli(['bind','--team',a.team_id,'--project',project.project_id])).code, 0);
    assert.equal((await cli(['status'])).code, 0);
    await assert.rejects(teamRequest({ origin, token: oldToken }, '/api/v1/cli/me'), /Cannot connect/);
    await assert.rejects(teamRequest(credentials, `/api/v1/teams/${b.team_id}`), { status: 404 });
    assert.equal((await cli(loginArgs, password + '\n')).code, 0);
    credentials = JSON.parse(readFileSync(credentialPath));
    assert.notEqual(credentials.token, oldToken);
    await assert.rejects(devices.authenticate(oldToken), { status: 401 });
    await assert.rejects(devices.revoke(other, credentials.device.device_id), { status: 404 });
    await teams.updateProject(user, a.team_id, project.project_id, { archived: true });
    assert.equal((await cli(['status'])).code, 1);
    await teams.updateProject(user, a.team_id, project.project_id, { archived: false, name: 'Renamed' });
    assert.equal((await cli(['status'])).code, 0);
    await teams.update(a.team_id, { archived: true });
    assert.equal((await cli(['status'])).code, 1);
    await teams.update(a.team_id, { archived: false });
    await teams.update(a.team_id, { owner: 'cli_other' });
    await assert.rejects(teams.createProject(user, a.team_id, { name: 'Denied', slug: 'denied' }), { status: 403 });
    await teams.remove(other, a.team_id, user);
    assert.equal((await cli(['status'])).code, 1);
    const web = await auth.login({ login: 'cli_owner', password });
    assert.equal((await http('/api/v1/account/password', `Bearer ${credentials.token}`, { current_password: 'wrong', password: 'Test-456' })).status, 401);
    assert.equal((await http('/api/v1/account/password', `Bearer ${credentials.token}`, { current_password: password, password: 'Test-456' })).status, 200);
    await assert.rejects(auth.me(web.token), { status: 401 });
    assert.equal((await cli(['whoami'])).code, 1);
    assert.equal((await cli(loginArgs, 'Test-456\n')).code, 0);
    assert.equal((await http(`/api/v1/admin/users/${user}/status`, admin, { status: 'disabled' })).status, 200);
    assert.equal((await cli(['whoami'])).code, 1);
    assert.equal((await cli(loginArgs, 'Test-456\n')).code, 1);
    assert.equal((await http(`/api/v1/admin/users/${user}/status`, admin, { status: 'active' })).status, 200);
    assert.equal((await cli(loginArgs, 'Test-456\n')).code, 0);
    credentials = JSON.parse(readFileSync(credentialPath));
    assert.equal((await http(`/api/v1/admin/users/${other}/devices/${credentials.device.device_id}/revoke`, admin, {})).status, 404);
    assert.equal((await http(`/api/v1/admin/users/${user}/devices/${credentials.device.device_id}/revoke`, admin, {})).status, 200);
    assert.equal((await cli(['whoami'])).code, 1);
    assert.equal((await http(`/api/v1/admin/users/${user}/password`, admin, { password: 'Reset-123' })).status, 200);
    assert.equal((await cli(['logout'])).code, 0);
    assert.equal((await cli(['unbind'])).code, 0);
    assert.equal((await cli(['whoami'])).code, 1);
  } finally {
    if (app) await new Promise((resolve) => app.close(resolve));
    if (pool) await pool.end();
    if (created) await control.query(`DROP SCHEMA ${schema} CASCADE`);
    await control.end(); rmSync(dir, { recursive: true, force: true });
  }
});
