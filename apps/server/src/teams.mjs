import { randomBytes, randomUUID } from 'node:crypto';
import { digest, failure } from './auth.mjs';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function name(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 100) throw failure(400, 'invalid_name');
  return value.trim();
}
export function pageOffset(page = '1') {
  if (!/^[1-9][0-9]{0,4}$/.test(String(page))) throw failure(400, 'invalid_page');
  return (Number(page) - 1) * 25;
}
const paged = (rows) => ({ items: rows.slice(0, 25), has_more: rows.length > 25 });

export function createTeams(pool) {
  async function transaction(work) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (error.code === '23505') throw failure(409, 'already_exists');
      throw error;
    } finally { client.release(); }
  }
  // Serialize team operations, including permission checks and invite redemption.
  // Removal cannot race a previously checked owner/member operation.
  async function lockTeam(client, id, allowArchived = false) {
    if (!uuid.test(id || '')) throw failure(404, 'team_not_found');
    const { rows } = await client.query('SELECT * FROM teams WHERE team_id=$1 FOR UPDATE', [id]);
    if (!rows.length) throw failure(404, 'team_not_found');
    if (rows[0].archived_at && !allowArchived) throw failure(404, 'team_not_found');
    return rows[0];
  }
  async function withTeam(user, id, owner, work) {
    return transaction(async (client) => {
      const team = await lockTeam(client, id);
      const { rows } = await client.query(`SELECT m.role FROM memberships m JOIN users u USING(user_id)
        WHERE m.team_id=$1 AND m.user_id=$2 AND m.status='active' AND u.status='active'`, [id, user]);
      if (!rows.length) throw failure(404, 'team_not_found');
      if (owner && rows[0].role !== 'owner') throw failure(403, 'owner_required');
      return work(client, { ...team, role: rows[0].role });
    });
  }
  return {
    async create(input) {
      const teamName = name(input.name);
      if (typeof input.owner !== 'string' || !/^[a-z][a-z0-9_-]{2,31}$/i.test(input.owner)) throw failure(400, 'invalid_owner');
      return transaction(async (client) => {
        const { rows } = await client.query(`SELECT user_id FROM users
          WHERE lower(username)=$1 AND status='active' AND password_hash IS NOT NULL FOR SHARE`, [input.owner.toLowerCase()]);
        if (!rows.length) throw failure(400, 'invalid_owner');
        const owner = rows[0].user_id;
        const result = await client.query(`INSERT INTO teams(team_id,name,created_by) VALUES ($1,$2,$3) RETURNING *`, [randomUUID(), teamName, owner]);
        await client.query(`INSERT INTO memberships(team_id,user_id,role) VALUES ($1,$2,'owner')`, [result.rows[0].team_id, owner]);
        return result.rows[0];
      });
    },
    async adminList(page) {
      const result = await pool.query(`SELECT t.*, u.username AS owner_username FROM teams t
        JOIN users u ON u.user_id=t.created_by ORDER BY t.created_at DESC,t.team_id LIMIT 26 OFFSET $1`, [pageOffset(page)]);
      return paged(result.rows);
    },
    async update(id, input) {
      if (!('name' in input) && !('owner' in input) && !('archived' in input)) throw failure(400, 'invalid_update');
      const teamName = 'name' in input ? name(input.name) : null;
      if ('archived' in input && typeof input.archived !== 'boolean') throw failure(400, 'invalid_update');
      return transaction(async (client) => {
        await lockTeam(client, id, true);
        if ('owner' in input) {
          if (typeof input.owner !== 'string' || !/^[a-z][a-z0-9_-]{2,31}$/i.test(input.owner)) throw failure(400, 'invalid_owner');
          const found = (await client.query(`SELECT user_id FROM users WHERE lower(username)=$1 AND status='active' AND password_hash IS NOT NULL FOR SHARE`, [input.owner.toLowerCase()])).rows[0];
          if (!found) throw failure(400, 'invalid_owner');
          await client.query(`UPDATE memberships SET role='member' WHERE team_id=$1 AND role='owner'`, [id]);
          await client.query(`INSERT INTO memberships(team_id,user_id,role) VALUES ($1,$2,'owner')
            ON CONFLICT (team_id,user_id) DO UPDATE SET role='owner',status='active'`, [id, found.user_id]);
          await client.query('UPDATE teams SET created_by=$2 WHERE team_id=$1', [id, found.user_id]);
          await client.query('UPDATE projects SET owner_id=$2 WHERE team_id=$1', [id, found.user_id]);
          await client.query('UPDATE team_invites SET revoked_at=now() WHERE team_id=$1 AND used_at IS NULL AND revoked_at IS NULL', [id]);
        }
        if (teamName !== null) await client.query('UPDATE teams SET name=$2 WHERE team_id=$1', [id, teamName]);
        if ('archived' in input) {
          await client.query('UPDATE teams SET archived_at=CASE WHEN $2 THEN now() ELSE NULL END WHERE team_id=$1', [id, input.archived]);
          if (input.archived) await client.query('UPDATE team_invites SET revoked_at=now() WHERE team_id=$1 AND used_at IS NULL AND revoked_at IS NULL', [id]);
        }
        return { ok: true };
      });
    },
    async list(user, page) {
      const result = await pool.query(`SELECT t.*,m.role FROM teams t JOIN memberships m USING(team_id)
        WHERE m.user_id=$1 AND m.status='active' AND t.archived_at IS NULL ORDER BY t.created_at DESC,t.team_id LIMIT 26 OFFSET $2`, [user, pageOffset(page)]);
      return paged(result.rows);
    },
    async detail(user, id) { return withTeam(user, id, false, async (_, team) => team); },
    async members(user, id, page) {
      const offset = pageOffset(page);
      return withTeam(user, id, false, async (client) => paged((await client.query(`SELECT m.user_id,m.role,m.joined_at,u.username,u.display_name
        FROM memberships m JOIN users u USING(user_id) WHERE m.team_id=$1 AND m.status='active'
        ORDER BY m.joined_at,m.user_id LIMIT 26 OFFSET $2`, [id, offset])).rows));
    },
    async projects(user, id, page, archived = false) {
      const offset = pageOffset(page);
      return withTeam(user, id, false, async (client) => paged((await client.query(`SELECT project_id,name,slug,owner_id,created_at,archived_at
        FROM projects WHERE team_id=$1 AND (archived_at IS NULL OR $3::boolean) ORDER BY created_at DESC,project_id LIMIT 26 OFFSET $2`, [id, offset, archived])).rows));
    },
    async project(user, id, project) {
      if (!uuid.test(project || '')) throw failure(404, 'project_not_found');
      return withTeam(user, id, false, async (client) => {
        const { rows } = await client.query('SELECT * FROM projects WHERE team_id=$1 AND project_id=$2 AND archived_at IS NULL', [id, project]);
        if (!rows.length) throw failure(404, 'project_not_found');
        return rows[0];
      });
    },
    async createProject(user, id, input) {
      const projectName = name(input.name);
      if (typeof input.slug !== 'string' || !/^[a-z][a-z0-9-]{2,47}$/.test(input.slug)) throw failure(400, 'invalid_slug');
      return withTeam(user, id, true, async (client) => (await client.query(`INSERT INTO projects(project_id,team_id,name,slug,owner_id)
        VALUES ($1,$2,$3,$4,$5) RETURNING project_id,team_id,name,slug,owner_id,created_at`, [randomUUID(), id, projectName, input.slug, user])).rows[0]);
    },
    async updateProject(user, id, project, input) {
      if (!uuid.test(project || '') || (!('name' in input) && !('archived' in input))) throw failure(400, 'invalid_update');
      const projectName = 'name' in input ? name(input.name) : null;
      if ('archived' in input && typeof input.archived !== 'boolean') throw failure(400, 'invalid_update');
      return withTeam(user, id, true, async (client) => {
        const result = await client.query(`UPDATE projects SET name=COALESCE($3,name),
          archived_at=CASE WHEN $4::boolean IS NULL THEN archived_at WHEN $4 THEN now() ELSE NULL END
          WHERE team_id=$1 AND project_id=$2 RETURNING project_id`, [id, project, projectName, input.archived ?? null]);
        if (!result.rows.length) throw failure(404, 'project_not_found');
        return { ok: true };
      });
    },
    async remove(user, id, target) {
      if (typeof target !== 'string' || target.length > 128) throw failure(400, 'invalid_member');
      return withTeam(user, id, true, async (client) => {
        const { rows } = await client.query(`SELECT role FROM memberships WHERE team_id=$1 AND user_id=$2 AND status='active'`, [id, target]);
        if (!rows.length) throw failure(404, 'member_not_found');
        if (rows[0].role === 'owner') throw failure(409, 'owner_cannot_be_removed');
        await client.query(`UPDATE memberships SET status='removed' WHERE team_id=$1 AND user_id=$2`, [id, target]);
        return { ok: true };
      });
    },
    async invite(user, id, { days = 7 }) {
      if (!Number.isInteger(days) || days < 1 || days > 30) throw failure(400, 'invalid_invite_options');
      return withTeam(user, id, true, async (client) => {
        const code = randomBytes(32).toString('base64url');
        const { rows } = await client.query(`INSERT INTO team_invites(invite_id,team_id,code_hash,created_by,expires_at)
          VALUES ($1,$2,$3,$4,now()+$5*interval '1 day') RETURNING invite_id,expires_at`, [randomUUID(), id, digest(code), user, days]);
        return { ...rows[0], code };
      });
    },
    async invites(user, id) {
      return withTeam(user, id, true, async (client) => (await client.query(`SELECT invite_id,created_at,expires_at,revoked_at,used_at
        FROM team_invites WHERE team_id=$1 ORDER BY created_at DESC,invite_id LIMIT 100`, [id])).rows);
    },
    async revoke(user, id, invite) {
      if (!uuid.test(invite || '')) throw failure(404, 'invite_not_available');
      return withTeam(user, id, true, async (client) => {
        const { rows } = await client.query(`UPDATE team_invites SET revoked_at=now()
          WHERE team_id=$1 AND invite_id=$2 AND used_at IS NULL AND revoked_at IS NULL RETURNING invite_id`, [id, invite]);
        if (!rows.length) throw failure(404, 'invite_not_available');
        return { ok: true };
      });
    },
    async join(user, { code }) {
      if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(code)) throw failure(400, 'invalid_team_invite');
      return transaction(async (client) => {
        const hash = digest(code);
        const found = await client.query('SELECT team_id FROM team_invites WHERE code_hash=$1', [hash]);
        if (!found.rows.length) throw failure(400, 'invalid_team_invite');
        const id = found.rows[0].team_id;
        const team = await lockTeam(client, id);
        const { rows } = await client.query(`SELECT invite_id FROM team_invites WHERE code_hash=$1 AND used_at IS NULL
          AND revoked_at IS NULL AND expires_at>now() FOR UPDATE`, [hash]);
        if (!rows.length) throw failure(400, 'invalid_team_invite');
        const member = await client.query(`SELECT status FROM memberships WHERE team_id=$1 AND user_id=$2`, [id, user]);
        if (member.rows[0]?.status === 'active') throw failure(409, 'already_member');
        await client.query(`INSERT INTO memberships(team_id,user_id,role) VALUES ($1,$2,'member')
          ON CONFLICT (team_id,user_id) DO UPDATE SET status='active',role='member',joined_at=now()`, [id, user]);
        await client.query('UPDATE team_invites SET used_at=now(),used_by=$1 WHERE invite_id=$2', [user, rows[0].invite_id]);
        return team;
      });
    },
  };
}
