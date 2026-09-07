import { createServer } from 'node:http';
import { createServer as createSecureServer } from 'node:https';
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createDirectory } from './directory.mjs';

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
].map(([path, [file, type]]) => [path, { type, body: readFileSync(new URL(`./public/${file}`, import.meta.url)) }]));

export function createApp(pool, { dashboardEnabled = false, accessHash, tlsOptions } = {}) {
  const directory = createDirectory(pool);
  const handler = async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    const send = (status, body) => {
      res.writeHead(status);
      res.end(JSON.stringify(body));
    };
    if (req.method !== 'GET') return send(405, { error: 'method_not_allowed' });
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/v1/health/live') return send(200, { status: 'ok' });
    if (url.pathname === '/api/v1/health/ready') {
      try { await pool.query('SELECT 1'); return send(200, { status: 'ready' }); }
      catch { return send(503, { status: 'unavailable' }); }
    }
    if (accessHash) {
      const header = req.headers.authorization || '';
      const supplied = header.startsWith('Basic ') ? Buffer.from(header.slice(6), 'base64').toString('utf8') : '';
      const digest = createHash('sha256').update(supplied).digest();
      const expected = Buffer.from(accessHash, 'hex');
      if (expected.length !== digest.length || !timingSafeEqual(digest, expected)) {
        res.setHeader('WWW-Authenticate', 'Basic realm="PiMesh directory", charset="UTF-8"');
        return send(401, { error: 'authentication_required' });
      }
    }
    {
      const asset = assets.get(url.pathname);
      if (asset) {
        res.writeHead(200, { 'Content-Type': asset.type });
        return res.end(asset.body);
      }
      if (!dashboardEnabled && url.pathname.startsWith('/api/v1/directory/')) return send(403, { error: 'directory_access_disabled' });
      try {
        if (url.pathname === '/api/v1/directory/summary') return send(200, await directory.summary());
        const match = url.pathname.match(/^\/api\/v1\/directory\/([a-z]+)$/);
        if (match) {
          const result = await directory.list(match[1], url.searchParams);
          if (result) return send(200, result);
        }
      } catch (error) {
        return send(error.status === 400 ? 400 : 503, { error: error.status === 400 ? 'invalid_query' : 'directory_unavailable' });
      }
    }
    return send(404, { error: 'not_found' });
  };
  return tlsOptions ? createSecureServer(tlsOptions, handler) : createServer(handler);
}
