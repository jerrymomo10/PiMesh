import { createHash, timingSafeEqual } from 'node:crypto';
import { createAuth, createLimiter, digest, failure } from './auth.mjs';

export function basicMatches(header, hash) {
  if (!/^[a-f0-9]{64}$/.test(hash || '')) return false;
  const supplied = (header || '').startsWith('Basic ') ? Buffer.from(header.slice(6), 'base64').toString('utf8') : '';
  return timingSafeEqual(createHash('sha256').update(supplied).digest(), Buffer.from(hash, 'hex'));
}
async function json(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw failure(415, 'json_required');
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8192) throw failure(413, 'request_too_large');
    chunks.push(chunk);
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    return data;
  } catch { throw failure(400, 'invalid_json'); }
}
const sessionCookie = '__Host-meshpi_session';
function token(req) {
  return (req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${sessionCookie}=`))?.slice(sessionCookie.length + 1);
}
function cookie(value, seconds) { return `${sessionCookie}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${seconds}`; }

export function createAuthHttp(pool, { origin, adminHash, limiter = createLimiter() }) {
  const auth = createAuth(pool);
  return async (req, res, path) => {
    if (!path.startsWith('/api/v1/auth/') && !path.startsWith('/api/v1/admin/invites')) return false;
    const send = (status, body) => { res.writeHead(status); res.end(JSON.stringify(body)); };
    try {
      const admin = path.startsWith('/api/v1/admin/');
      // Use socket address, never untrusted X-Forwarded-For. Single-process limits.
      const address = req.socket.remoteAddress || 'unknown';
      limiter(`${admin ? 'admin' : 'auth'}:${address}`, admin ? 120 : 120);
      if (admin && !basicMatches(req.headers.authorization, adminHash)) {
        res.setHeader('WWW-Authenticate', 'Basic realm="PiMesh invitations", charset="UTF-8"');
        throw failure(401, 'admin_authentication_required');
      }
      const routes = new Map([
        ['/api/v1/auth/register', 'POST'], ['/api/v1/auth/login', 'POST'],
        ['/api/v1/auth/me', 'GET'], ['/api/v1/auth/logout', 'POST'],
        ['/api/v1/admin/invites', req.method === 'GET' ? 'GET' : 'POST'],
      ]);
      const revoke = /^\/api\/v1\/admin\/invites\/([a-f0-9-]{36})\/revoke$/.exec(path);
      const method = revoke ? 'POST' : routes.get(path);
      if (!method) throw failure(404, 'not_found');
      if (req.method !== method) throw failure(405, 'method_not_allowed');
      let data;
      if (method === 'POST') {
        // Custom header + JSON forbid cross-site form submits, including login CSRF.
        if (req.headers['x-pimesh-request'] !== '1' ||
            (req.headers.origin && req.headers.origin !== origin) ||
            req.headers['sec-fetch-site'] === 'cross-site') throw failure(403, 'origin_rejected');
        data = await json(req);
      }
      if (path === '/api/v1/auth/register') {
        limiter(`register:${address}`, 10);
        send(201, { user: await auth.register(data) });
      } else if (path === '/api/v1/auth/login') {
        limiter(`login:${address}`, 30);
        if (typeof data.login === 'string') limiter(`account:${digest(data.login.trim().toLowerCase())}`, 15);
        const result = await auth.login(data);
        await auth.logout(token(req));
        res.setHeader('Set-Cookie', cookie(result.token, 7 * 86400));
        send(200, { user: result.user });
      } else if (path === '/api/v1/auth/me') {
        send(200, { user: await auth.me(token(req)) });
      } else if (path === '/api/v1/auth/logout') {
        await auth.logout(token(req));
        res.setHeader('Set-Cookie', cookie('', 0)); send(200, { ok: true });
      } else if (revoke) {
        await auth.revoke(revoke[1]); send(200, { ok: true });
      } else if (method === 'POST') {
        send(201, { items: await auth.generate(data) });
      } else { send(200, { items: await auth.invites() }); }
    } catch (error) {
      const expected = Number.isInteger(error.status) && error.status >= 400 && error.status <= 499;
      if (error.status === 429) res.setHeader('Retry-After', '900');
      send(expected ? error.status : 503, { error: expected ? error.code : 'service_unavailable' });
    }
    return true;
  };
}
