import { createLimiter, failure } from './auth.mjs';
import { basicMatches, json } from './auth-http.mjs';
import { createTeams } from './teams.mjs';
import { requestIdentity } from './devices.mjs';

export function createTeamsHttp(pool, { origin, adminHash, limiter = createLimiter() }) {
  const teams = createTeams(pool);
  return async (req, res, url) => {
    const path = url.pathname;
    if (!path.startsWith('/api/v1/teams') && !path.startsWith('/api/v1/admin/teams')) return false;
    const send = (status, result) => { res.writeHead(status); res.end(JSON.stringify(result)); };
    try {
      const admin = path.startsWith('/api/v1/admin/');
      limiter(`teams:${req.socket.remoteAddress || 'unknown'}`, 120);
      let user;
      if (admin) {
        if (!basicMatches(req.headers.authorization, adminHash)) {
          res.setHeader('WWW-Authenticate', 'Basic realm="PiMesh invitations", charset="UTF-8"');
          throw failure(401, 'admin_authentication_required');
        }
      } else { user = (await requestIdentity(pool, req)).user_id; }
      if (!['GET', 'POST'].includes(req.method)) throw failure(405, 'method_not_allowed');
      let data;
      if (req.method === 'POST') {
        if (req.headers['x-pimesh-request'] !== '1' ||
            (req.headers.origin && req.headers.origin !== origin) ||
            req.headers['sec-fetch-site'] === 'cross-site') throw failure(403, 'origin_rejected');
        data = await json(req);
      }
      const post = req.method === 'POST', page = url.searchParams.get('page') ?? '1';
      const projectMatch = /^\/api\/v1\/teams\/([a-f0-9-]{36})\/projects\/([a-f0-9-]{36})$/.exec(path);
      const adminTeam = /^\/api\/v1\/admin\/teams\/([a-f0-9-]{36})$/.exec(path);
      const match = /^\/api\/v1\/teams\/([a-f0-9-]{36})(?:\/(members|projects|invites)(?:\/([a-zA-Z0-9_-]{1,128})\/(remove|revoke))?)?$/.exec(path);
      if (adminTeam && post) {
        send(200, await teams.update(adminTeam[1], data));
      } else if (path === '/api/v1/admin/teams') {
        send(post ? 201 : 200, post ? { team: await teams.create(data) } : await teams.adminList(page));
      } else if (path === '/api/v1/teams') {
        if (post) throw failure(403, 'admin_required');
        send(200, await teams.list(user, page));
      } else if (path === '/api/v1/teams/join') {
        if (!post) throw failure(405, 'method_not_allowed');
        send(200, { team: await teams.join(user, data) });
      } else if (projectMatch) {
        send(200, post ? await teams.updateProject(user, projectMatch[1], projectMatch[2], data) : { project: await teams.project(user, projectMatch[1], projectMatch[2]) });
      } else if (match) {
        const [, id, section, target, action] = match;
        if (target) {
          if (!post) throw failure(405, 'method_not_allowed');
          if (section === 'members' && action === 'remove') send(200, await teams.remove(user, id, target));
          else if (section === 'invites' && action === 'revoke') send(200, await teams.revoke(user, id, target));
          else throw failure(404, 'not_found');
        } else if (!section) {
          if (post) throw failure(405, 'method_not_allowed');
          send(200, { team: await teams.detail(user, id) });
        } else if (section === 'members') {
          if (post) throw failure(405, 'method_not_allowed');
          send(200, await teams.members(user, id, page));
        } else if (section === 'projects') {
          send(post ? 201 : 200, post ? { project: await teams.createProject(user, id, data) } : await teams.projects(user, id, page, url.searchParams.get('include_archived') === '1'));
        } else {
          send(post ? 201 : 200, post ? { invite: await teams.invite(user, id, data) } : { items: await teams.invites(user, id) });
        }
      } else { throw failure(404, 'not_found'); }
    } catch (error) {
      const expected = Number.isInteger(error.status) && error.status >= 400 && error.status < 500;
      if (error.status === 429) res.setHeader('Retry-After', '900');
      send(expected ? error.status : 503, { error: expected ? error.code : 'service_unavailable' });
    }
    return true;
  };
}
