import { createDevices, requestIdentity } from './devices.mjs';
import { createLimiter, digest, failure } from './auth.mjs';
import { basicMatches, json } from './auth-http.mjs';

export function createManagementHttp(pool, { origin, adminHash, limiter = createLimiter() }) {
  const devices = createDevices(pool);
  return async (req, res, url) => {
    const path = url.pathname;
    if (!['/api/v1/cli/', '/api/v1/devices', '/api/v1/admin/users', '/api/v1/account/password'].some((prefix) => path.startsWith(prefix))) return false;
    const send = (status, data) => { res.writeHead(status); res.end(JSON.stringify(data)); };
    try {
      const address = req.socket.remoteAddress || 'unknown', admin = path.startsWith('/api/v1/admin/');
      limiter(`management:${address}`, 120);
      if (!['GET', 'POST'].includes(req.method)) throw failure(405, 'method_not_allowed');
      let data, identity;
      if (admin) {
        if (!basicMatches(req.headers.authorization, adminHash)) {
          res.setHeader('WWW-Authenticate', 'Basic realm="PiMesh invitations", charset="UTF-8"');
          throw failure(401, 'admin_authentication_required');
        }
      } else if (path !== '/api/v1/cli/login') { identity = await requestIdentity(pool, req); }
      const post = req.method === 'POST';
      if (post) {
        if (req.headers['x-pimesh-request'] !== '1' || (req.headers.origin && req.headers.origin !== origin) || req.headers['sec-fetch-site'] === 'cross-site') throw failure(403, 'origin_rejected');
        data = await json(req);
      }
      const userRoute = /^\/api\/v1\/admin\/users\/([a-zA-Z0-9_-]{1,128})\/(status|password|devices)(?:\/([a-f0-9-]{36})\/revoke)?$/.exec(path);
      const deviceRoute = /^\/api\/v1\/devices\/([a-f0-9-]{36})\/revoke$/.exec(path);
      if (path === '/api/v1/cli/login' && post) {
        limiter(`login:${address}`, 30);
        if (typeof data.login === 'string') limiter(`account:${digest(data.login.trim().toLowerCase())}`, 15);
        send(201, await devices.login(data));
      } else if (path === '/api/v1/cli/me' && !post) { send(200, { user: identity }); }
      else if (path === '/api/v1/cli/logout' && post && identity.device_id) { send(200, await devices.revoke(identity.user_id, identity.device_id)); }
      else if (path === '/api/v1/devices' && !post) { send(200, await devices.list(identity.user_id, url.searchParams.get('page') ?? '1')); }
      else if (deviceRoute && post) { send(200, await devices.revoke(identity.user_id, deviceRoute[1])); }
      else if (path === '/api/v1/account/password' && post) { send(200, await devices.password(identity.user_id, data)); }
      else if (path === '/api/v1/admin/users' && !post) { send(200, await devices.users(url.searchParams.get('page') ?? '1')); }
      else if (userRoute) {
        const [, user, operation, id] = userRoute;
        if (operation === 'devices' && id && post) {
          // Scope by supplied user too; an administrator chooses an explicit device.
          send(200, await devices.revoke(user, id));
        } else if (operation === 'devices' && !id && !post) send(200, await devices.list(user, url.searchParams.get('page') ?? '1'));
        else if (operation === 'status' && post) send(200, await devices.status(user, data.status));
        else if (operation === 'password' && post) send(200, await devices.password(user, data, true));
        else throw failure(405, 'method_not_allowed');
      } else throw failure(404, 'not_found');
    } catch (error) {
      const expected = Number.isInteger(error.status) && error.status >= 400 && error.status < 500;
      if (error.status === 429) res.setHeader('Retry-After', '900');
      send(expected ? error.status : 503, { error: expected ? error.code : 'service_unavailable' });
    }
    return true;
  };
}
