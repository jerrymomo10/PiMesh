import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import pg from 'pg';
import { createApp } from '../src/app.mjs';
import { createAuth, digest, hashPassword } from '../src/auth.mjs';
import { createTeams } from '../src/teams.mjs';

test('real PostgreSQL: admin-only creation, team isolation, invitation lifecycle and removal', { skip: !process.env.TEST_DATABASE_URL, timeout: 60000 }, async () => {
  const control = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const schema = `teams_${randomUUID().replaceAll('-', '')}`;
  let pool, app, created = false;
  try {
    assert.match((await control.query('SELECT current_database() AS name')).rows[0].name, /^pimesh_test_/);
    await control.query(`CREATE SCHEMA ${schema}`); created = true;
    pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}` });
    const directory = new URL('../migrations/', import.meta.url);
    for (let repeat = 0; repeat < 2; repeat++) {
      for (const file of readdirSync(directory).filter((n) => n.endsWith('.sql')).sort()) await pool.query(readFileSync(new URL(file, directory), 'utf8'));
    }
    const password = 'Test-123', hash = await hashPassword(password), ids = {};
    for (const username of ['owner_one', 'owner_two', 'member_one', 'outsider', 'disabled']) {
      ids[username] = randomUUID();
      await pool.query(`INSERT INTO users(user_id,username,email,display_name,password_hash,status) VALUES ($1,$2,$3,$2,$4,$5)`,
        [ids[username], username, `${username}@example.test`, hash, username === 'disabled' ? 'disabled' : 'active']);
    }
    const auth = createAuth(pool), teams = createTeams(pool);
    const sessions = {};
    for (const name of ['owner_one', 'owner_two', 'member_one', 'outsider']) sessions[name] = (await auth.login({ login: name, password })).token;
    app = createApp(pool, { authEnabled: true, dashboardEnabled: true, publicOrigin: 'https://example.test',
      adminHash: digest('admin:synthetic'), accessHash: digest('viewer:synthetic') });
    app.listen(0, '127.0.0.1'); await once(app, 'listening');
    const base = `http://127.0.0.1:${app.address().port}`;
    const request = (path, who, data) => fetch(base + path, {
      method: data === undefined ? 'GET' : 'POST',
      headers: { ...(who === 'admin' ? { Authorization: 'Basic ' + Buffer.from('admin:synthetic').toString('base64') }
        : { Cookie: `__Host-meshpi_session=${sessions[who]}` }),
      ...(data === undefined ? {} : { 'Content-Type': 'application/json', 'X-PiMesh-Request': '1', Origin: 'https://example.test' }) },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    assert.equal((await request('/api/v1/teams', 'owner_one', { name: 'Forbidden', owner: 'owner_one' })).status, 403);
    assert.equal((await request('/api/v1/admin/teams', 'owner_one', { name: 'Forbidden', owner: 'owner_one' })).status, 401);
    const count = async (table) => Number((await pool.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n);
    for (const owner of ['missing', 'disabled']) assert.equal((await request('/api/v1/admin/teams', 'admin', { name: 'Invalid', owner })).status, 400);
    assert.equal(await count('teams'), 0);
    const createdTeam = await request('/api/v1/admin/teams', 'admin', { name: 'Synthetic A', owner: 'owner_one' });
    assert.equal(createdTeam.status, 201); const a = (await createdTeam.json()).team;
    const b = (await teams.create({ name: 'Synthetic B', owner: 'owner_two' }));
    assert.equal((await teams.detail(ids.owner_one, a.team_id)).role, 'owner');
    assert.equal((await teams.list(ids.owner_one)).items.length, 1);
    const list = await request('/api/v1/teams', 'outsider'); assert.deepEqual((await list.json()).items, []);
    for (const section of ['', '/members', '/projects', '/invites']) {
      assert.equal((await request(`/api/v1/teams/${a.team_id}${section}`, 'owner_two')).status, 404);
    }
    const invite = await teams.invite(ids.owner_one, a.team_id, {});
    const joined = await request('/api/v1/teams/join', 'member_one', { code: invite.code }); assert.equal(joined.status, 200);
    assert.equal((await teams.detail(ids.member_one, a.team_id)).role, 'member');
    assert.equal((await request(`/api/v1/teams/${a.team_id}/members`, 'member_one')).status, 200);
    for (const [section, data] of [['projects', { name: 'Denied', slug: 'denied' }], ['invites', {}], [`members/${ids.owner_one}/remove`, {}]]) {
      assert.equal((await request(`/api/v1/teams/${a.team_id}/${section}`, 'member_one', data)).status, 403);
    }
    assert.equal((await request(`/api/v1/teams/${a.team_id}/invites`, 'member_one')).status, 403);
    const project = await request(`/api/v1/teams/${a.team_id}/projects`, 'owner_one', { name: '<script>Synthetic</script>', slug: 'research' });
    assert.equal(project.status, 201);
    assert.equal((await request(`/api/v1/teams/${a.team_id}/projects`, 'owner_one', { name: 'Duplicate', slug: 'research' })).status, 409);
    await teams.createProject(ids.owner_two, b.team_id, { name: 'Other', slug: 'research' });
    assert.equal((await teams.projects(ids.member_one, a.team_id)).items.length, 1);
    assert.equal((await teams.members(ids.member_one, a.team_id)).items.some((m) => 'email' in m || 'password_hash' in m), false);
    await assert.rejects(teams.remove(ids.owner_one, a.team_id, ids.owner_one), { code: 'owner_cannot_be_removed' });
    await assert.rejects(teams.remove(ids.owner_one, b.team_id, ids.owner_two), { status: 404 });
    const duplicate = await teams.invite(ids.owner_one, a.team_id, {});
    await assert.rejects(teams.join(ids.member_one, { code: duplicate.code }), { code: 'already_member' });
    assert.equal((await pool.query('SELECT used_at FROM team_invites WHERE invite_id=$1', [duplicate.invite_id])).rows[0].used_at, null);
    await teams.revoke(ids.owner_one, a.team_id, duplicate.invite_id);
    await assert.rejects(teams.join(ids.outsider, { code: duplicate.code }), { code: 'invalid_team_invite' });
    const expired = await teams.invite(ids.owner_one, a.team_id, {});
    await pool.query("UPDATE team_invites SET expires_at=now()-interval '1 second' WHERE invite_id=$1", [expired.invite_id]);
    await assert.rejects(teams.join(ids.outsider, { code: expired.code }), { code: 'invalid_team_invite' });
    const otherInvite = await teams.invite(ids.owner_two, b.team_id, {});
    await assert.rejects(teams.revoke(ids.owner_one, a.team_id, otherInvite.invite_id), { status: 404 });
    const race = await teams.invite(ids.owner_one, a.team_id, {});
    const outcomes = await Promise.allSettled([teams.join(ids.outsider, { code: race.code }), teams.join(ids.owner_two, { code: race.code })]);
    assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(outcomes.find((r) => r.status === 'rejected').reason.code, 'invalid_team_invite');
    assert.ok((await teams.invites(ids.owner_one, a.team_id)).every((i) => !('code' in i) && !('code_hash' in i)));
    const registrationInvite = (await auth.generate({}))[0];
    await assert.rejects(teams.join(ids.member_one, { code: registrationInvite.code }), { code: 'invalid_team_invite' });
    const removed = await request(`/api/v1/teams/${a.team_id}/members/${ids.member_one}/remove`, 'owner_one', {});
    assert.equal(removed.status, 200);
    for (const section of ['', '/members', '/projects']) assert.equal((await request(`/api/v1/teams/${a.team_id}${section}`, 'member_one')).status, 404);
    const rejoin = await teams.invite(ids.owner_one, a.team_id, {});
    await teams.join(ids.member_one, { code: rejoin.code });
    assert.equal((await teams.detail(ids.member_one, a.team_id)).role, 'member');
    await auth.logout(sessions.member_one);
    assert.equal((await request('/api/v1/teams', 'member_one')).status, 401);
    await pool.query("UPDATE users SET status='disabled' WHERE user_id=$1", [ids.owner_one]);
    assert.equal((await request(`/api/v1/teams/${a.team_id}/projects`, 'owner_one')).status, 401);
    assert.equal((await request('/api/v1/admin/teams?page=0', 'admin')).status, 400);
  } finally {
    if (app) await new Promise((resolve) => app.close(resolve));
    if (pool) await pool.end();
    if (created) await control.query(`DROP SCHEMA ${schema} CASCADE`);
    await control.end();
  }
});
