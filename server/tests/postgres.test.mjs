import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { createDirectory } from '../directory.mjs';

test('directory PostgreSQL migration, constraints, pagination and field selection', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  try {
    const { rows } = await pool.query('SELECT current_database() AS name');
    assert.match(rows[0].name, /^pimesh_test_/, 'Only a disposable test database is allowed');
    const sql = readFileSync(new URL('../migrations/001-directory.sql', import.meta.url), 'utf8');
    await pool.query(sql); await pool.query(sql);
    await pool.query(`INSERT INTO users(user_id,email,display_name)
      SELECT 'fixture' || n, 'fixture' || n || '@example.test', '<script>fixture</script>' FROM generate_series(1,26) AS n`);
    await assert.rejects(pool.query("INSERT INTO users(user_id,email,display_name) VALUES ('fixture1','fixture1@other.test','duplicate')"), { code: '23505' });
    await pool.query("INSERT INTO teams(team_id,name,created_by) VALUES ('00000000-0000-0000-0000-000000000001','Synthetic team','fixture1')");
    await pool.query("INSERT INTO memberships(team_id,user_id,role) VALUES ('00000000-0000-0000-0000-000000000001','fixture1','owner')");
    await assert.rejects(pool.query("INSERT INTO devices(device_id,user_id,name) VALUES ('00000000-0000-0000-0000-000000000002','missing','test')"), { code: '23503' });
    const directory = createDirectory(pool);
    assert.equal((await directory.summary()).counts.users, 26);
    const first = await directory.list('users', new URLSearchParams());
    const second = await directory.list('users', new URLSearchParams({ page: '2' }));
    assert.equal(first.items.length, 25); assert.equal(second.items.length, 1);
    assert.equal(first.total, 26);
    assert.equal(new Set([...first.items, ...second.items].map((r) => r.user_id)).size, 26);
    assert.deepEqual(Object.keys(first.items[0]).sort(), ['created_at','display_name','email','status','user_id']);
    assert.equal((await directory.list('users', new URLSearchParams({ q: "' OR 1=1 --" }))).total, 0);
    assert.equal((await directory.list('users', new URLSearchParams({ q: '%' }))).total, 0);
    for (const type of ['teams','memberships','devices','projects']) assert.ok(Array.isArray((await directory.list(type, new URLSearchParams())).items));
  } finally { await pool.end(); }
});
