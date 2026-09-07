import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
const parameters = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
let activeHashes = 0;
export function failure(status, code) { return Object.assign(new Error(code), { status, code }); }
export const digest = (value) => createHash('sha256').update(value).digest('hex');
const secret = () => randomBytes(32).toString('base64url');
const publicUser = (row) => ({ user_id: row.user_id, username: row.username, email: row.email,
  email_verified: row.email_verified, display_name: row.display_name, created_at: row.created_at });

async function key(password, salt) {
  // Bound memory/CPU use on the 256 MiB server, with no unbounded work queue.
  if (activeHashes >= 2) throw failure(429, 'try_later');
  activeHashes++;
  try { return await derive(password, salt, 32, parameters); }
  finally { activeHashes--; }
}
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt-v1$${salt}$${(await key(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password, stored) {
  const valid = /^scrypt-v1\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(stored || '');
  const [, salt, expected] = valid ? stored.split('$') : ['', '0'.repeat(32), '0'.repeat(64)];
  const actual = await key(password, salt);
  return timingSafeEqual(actual, Buffer.from(expected, 'hex')) && valid;
}
export function registration(input) {
  const username = typeof input.username === 'string' ? input.username.trim().toLowerCase() : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (!/^[a-z][a-z0-9_-]{2,31}$/.test(username) || email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof input.password !== 'string' || input.password.length < 15 || input.password.length > 128 ||
      typeof input.invite !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(input.invite)) {
    throw failure(400, 'invalid_registration');
  }
  return { username, email, password: input.password, invite: input.invite };
}

export function createAuth(pool) {
  return {
    async register(input) {
      const data = registration(input);
      const passwordHash = await hashPassword(data.password);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Lock before creating a user. Failure rolls back both the user and redemption.
        const invite = await client.query(`SELECT invite_id FROM registration_invites
          WHERE code_hash=$1 AND revoked_at IS NULL AND used_at IS NULL AND expires_at>now() FOR UPDATE`, [digest(data.invite)]);
        if (!invite.rows.length) throw failure(400, 'invalid_invite');
        const result = await client.query(`INSERT INTO users(user_id,username,email,display_name,password_hash)
          VALUES ($1,$2,$3,$2,$4) RETURNING *`, [randomUUID(), data.username, data.email, passwordHash]);
        await client.query('UPDATE registration_invites SET used_at=now(), used_by=$1 WHERE invite_id=$2',
          [result.rows[0].user_id, invite.rows[0].invite_id]);
        await client.query('COMMIT');
        return publicUser(result.rows[0]);
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        if (error.code === '23505') throw failure(409, 'account_unavailable');
        throw error;
      } finally { client.release(); }
    },
    async login(input) {
      if (typeof input.login !== 'string' || input.login.length > 254 ||
          typeof input.password !== 'string' || input.password.length > 128) throw failure(400, 'invalid_login');
      const result = await pool.query('SELECT * FROM users WHERE lower(username)=$1 OR lower(email)=$1', [input.login.trim().toLowerCase()]);
      const user = result.rows[0];
      if (!await verifyPassword(input.password, user?.password_hash) || user?.status !== 'active') throw failure(401, 'invalid_credentials');
      const token = secret();
      await pool.query('DELETE FROM auth_sessions WHERE expires_at<=now()');
      await pool.query(`INSERT INTO auth_sessions(token_hash,user_id,expires_at)
        VALUES ($1,$2,now()+interval '7 days')`, [digest(token), user.user_id]);
      return { token, user: publicUser(user) };
    },
    async me(token) {
      if (!/^[A-Za-z0-9_-]{43}$/.test(token || '')) throw failure(401, 'authentication_required');
      const result = await pool.query(`SELECT u.* FROM auth_sessions s JOIN users u ON u.user_id=s.user_id
        WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active'`, [digest(token)]);
      if (!result.rows.length) throw failure(401, 'authentication_required');
      return publicUser(result.rows[0]);
    },
    async logout(token) {
      if (token) await pool.query('DELETE FROM auth_sessions WHERE token_hash=$1', [digest(token)]);
    },
    async generate({ count = 1, days = 7 }) {
      if (!Number.isInteger(count) || count < 1 || count > 50 || !Number.isInteger(days) || days < 1 || days > 30) throw failure(400, 'invalid_invite_options');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const items = [];
        for (let i = 0; i < count; i++) {
          const code = secret();
          const result = await client.query(`INSERT INTO registration_invites(invite_id,code_hash,expires_at)
            VALUES ($1,$2,now()+$3*interval '1 day') RETURNING invite_id,created_at,expires_at`, [randomUUID(), digest(code), days]);
          items.push({ ...result.rows[0], code });
        }
        await client.query('COMMIT');
        return items;
      } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
      finally { client.release(); }
    },
    async invites() {
      const result = await pool.query(`SELECT invite_id,created_at,expires_at,revoked_at,used_at,used_by
        FROM registration_invites ORDER BY created_at DESC,invite_id LIMIT 100`);
      return result.rows;
    },
    async revoke(id) {
      if (!/^[a-f0-9-]{36}$/.test(id || '')) throw failure(400, 'invalid_invite_id');
      const result = await pool.query(`UPDATE registration_invites SET revoked_at=now()
        WHERE invite_id=$1 AND used_at IS NULL AND revoked_at IS NULL RETURNING invite_id`, [id]);
      if (!result.rows.length) throw failure(404, 'invite_not_available');
    },
  };
}

export function createLimiter({ now = Date.now, maximum = 10000 } = {}) {
  const entries = new Map();
  return (key, limit = 20) => {
    const time = now();
    for (const [name, value] of entries) if (value.until <= time) entries.delete(name);
    let entry = entries.get(key);
    if (!entry) {
      if (entries.size >= maximum) throw failure(429, 'try_later');
      entry = { count: 0, until: time + 15 * 60 * 1000 }; entries.set(key, entry);
    }
    if (++entry.count > limit) throw failure(429, 'try_later');
  };
}
