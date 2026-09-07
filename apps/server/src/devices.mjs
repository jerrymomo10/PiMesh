import { randomBytes, randomUUID } from 'node:crypto';
import { createAuth, digest, failure, hashPassword, verifyPassword } from './auth.mjs';
import { token } from './auth-http.mjs';
import { pageOffset } from './teams.mjs';

export function createDevices(pool) {
  async function transaction(work) {
    const client = await pool.connect();
    try { await client.query('BEGIN'); const result = await work(client); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
    finally { client.release(); }
  }
  async function invalidate(client, user) {
    await client.query('DELETE FROM auth_sessions WHERE user_id=$1', [user]);
    await client.query('DELETE FROM device_sessions WHERE device_id IN (SELECT device_id FROM devices WHERE user_id=$1)', [user]);
  }
  const api = {
    async login(input) {
      if (typeof input.login !== 'string' || input.login.length > 254 || typeof input.password !== 'string' || input.password.length > 128 ||
          typeof input.name !== 'string' || !input.name.trim() || input.name.length > 100) throw failure(400, 'invalid_login');
      const result = await pool.query('SELECT * FROM users WHERE lower(username)=$1 OR lower(email)=$1', [input.login.trim().toLowerCase()]);
      const user = result.rows[0];
      if (!await verifyPassword(input.password, user?.password_hash) || user?.status !== 'active') throw failure(401, 'invalid_credentials');
      return transaction(async (client) => {
        // Serialize device registration with account disabling/password changes.
        const fresh = (await client.query('SELECT status,password_hash FROM users WHERE user_id=$1 FOR UPDATE', [user.user_id])).rows[0];
        if (fresh.status !== 'active' || fresh.password_hash !== user.password_hash) throw failure(401, 'invalid_credentials');
        await client.query('DELETE FROM device_sessions WHERE expires_at<=now()');
        let device;
        if (input.device_id) {
          if (!/^[a-f0-9-]{36}$/.test(input.device_id)) throw failure(400, 'invalid_device');
          device = (await client.query('SELECT * FROM devices WHERE device_id=$1 AND user_id=$2 AND revoked_at IS NULL FOR UPDATE', [input.device_id, user.user_id])).rows[0];
          if (!device) throw failure(409, 'device_unavailable');
          await client.query('DELETE FROM device_sessions WHERE device_id=$1', [device.device_id]);
        } else {
          const total = Number((await client.query(`SELECT count(*) AS n FROM devices WHERE user_id=$1 AND revoked_at IS NULL`, [user.user_id])).rows[0].n);
          if (total >= 20) throw failure(409, 'device_limit');
          device = (await client.query('INSERT INTO devices(device_id,user_id,name) VALUES ($1,$2,$3) RETURNING *', [randomUUID(), user.user_id, input.name.trim()])).rows[0];
        }
        const secret = randomBytes(32).toString('base64url');
        const session = (await client.query(`INSERT INTO device_sessions(token_hash,device_id,expires_at)
          VALUES ($1,$2,now()+interval '30 days') RETURNING expires_at`, [digest(secret), device.device_id])).rows[0];
        return { token: secret, expires_at: session.expires_at, device, user: { user_id: user.user_id, username: user.username } };
      });
    },
    async authenticate(secret) {
      if (!/^[A-Za-z0-9_-]{43}$/.test(secret || '')) throw failure(401, 'authentication_required');
      const { rows } = await pool.query(`SELECT u.user_id,u.username,d.device_id,d.name AS device_name,s.expires_at FROM device_sessions s
        JOIN devices d USING(device_id) JOIN users u USING(user_id)
        WHERE s.token_hash=$1 AND s.expires_at>now() AND d.revoked_at IS NULL AND u.status='active'`, [digest(secret)]);
      if (!rows.length) throw failure(401, 'authentication_required');
      return rows[0];
    },
    async list(user, page) {
      const { rows } = await pool.query(`SELECT device_id,name,created_at,revoked_at FROM devices WHERE user_id=$1
        ORDER BY created_at DESC,device_id LIMIT 26 OFFSET $2`, [user, pageOffset(page)]);
      return { items: rows.slice(0, 25), has_more: rows.length > 25 };
    },
    async revoke(user, id, admin = false) {
      if (!/^[a-f0-9-]{36}$/.test(id || '')) throw failure(404, 'device_not_found');
      return transaction(async (client) => {
        const result = await client.query(`UPDATE devices SET revoked_at=COALESCE(revoked_at,now())
          WHERE device_id=$1 AND ($3::boolean OR user_id=$2) RETURNING device_id`, [id, user, admin]);
        if (!result.rows.length) throw failure(404, 'device_not_found');
        await client.query('DELETE FROM device_sessions WHERE device_id=$1', [id]);
        return { ok: true };
      });
    },
    async users(page) {
      const { rows } = await pool.query(`SELECT user_id,username,email,display_name,status,created_at FROM users
        ORDER BY created_at DESC,user_id LIMIT 26 OFFSET $1`, [pageOffset(page)]);
      return { items: rows.slice(0, 25), has_more: rows.length > 25 };
    },
    async status(user, status) {
      if (!['active', 'disabled'].includes(status)) throw failure(400, 'invalid_status');
      return transaction(async (client) => {
        const result = await client.query('UPDATE users SET status=$2 WHERE user_id=$1 RETURNING user_id', [user, status]);
        if (!result.rows.length) throw failure(404, 'user_not_found');
        if (status === 'disabled') await invalidate(client, user);
        return { ok: true };
      });
    },
    async password(user, data, admin = false) {
      if (typeof data.password !== 'string' || data.password.length < 8 || data.password.length > 128) throw failure(400, 'invalid_password');
      const row = (await pool.query('SELECT password_hash,status FROM users WHERE user_id=$1', [user])).rows[0];
      if (!row) throw failure(404, 'user_not_found');
      if (!admin && (typeof data.current_password !== 'string' || data.current_password.length > 128 ||
          !await verifyPassword(data.current_password, row.password_hash))) throw failure(401, 'invalid_credentials');
      const hash = await hashPassword(data.password);
      return transaction(async (client) => {
        const fresh = (await client.query('SELECT password_hash FROM users WHERE user_id=$1 FOR UPDATE', [user])).rows[0];
        if (!fresh || fresh.password_hash !== row.password_hash) throw failure(409, 'account_changed');
        await client.query('UPDATE users SET password_hash=$2 WHERE user_id=$1', [user, hash]);
        await invalidate(client, user);
        return { ok: true };
      });
    },
  };
  return api;
}

export async function requestIdentity(pool, req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return createDevices(pool).authenticate(header.slice(7));
  return createAuth(pool).me(token(req));
}
