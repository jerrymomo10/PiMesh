import { createServer } from 'node:http';

export function createApp(pool) {
  return createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    const send = (status, body) => {
      res.writeHead(status);
      res.end(JSON.stringify(body));
    };
    if (req.method !== 'GET') return send(405, { error: 'method_not_allowed' });
    if (req.url === '/api/v1/health/live') return send(200, { status: 'ok' });
    if (req.url === '/api/v1/health/ready') {
      try {
        await pool.query('SELECT 1');
        return send(200, { status: 'ready' });
      } catch {
        return send(503, { status: 'unavailable' });
      }
    }
    return send(404, { error: 'not_found' });
  });
}
