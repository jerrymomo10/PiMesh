// Explicit public fields only. Credentials and local paths never enter these queries.
const tables = {
  users: { source: 'users', columns: ['user_id', 'display_name', 'email', 'status', 'created_at'], order: 'created_at DESC, user_id', search: ['user_id', 'display_name', 'email'] },
  teams: { source: 'teams', columns: ['team_id', 'name', 'created_by', 'created_at'], order: 'created_at DESC, team_id', search: ['name', 'created_by'] },
  memberships: { source: 'memberships', columns: ['team_id', 'user_id', 'role', 'status', 'joined_at'], order: 'joined_at DESC, team_id, user_id', search: ['user_id', 'role', 'team_id::text'] },
  devices: { source: 'devices', columns: ['device_id', 'user_id', 'name', 'created_at', 'revoked_at'], order: 'created_at DESC, device_id', search: ['user_id', 'name'] },
  projects: { source: 'projects', columns: ['project_id', 'team_id', 'name', 'slug', 'owner_id', 'created_at', 'archived_at'], order: 'created_at DESC, project_id', search: ['name', 'slug', 'owner_id'] },
};
export function createDirectory(pool) {
  return {
    async summary() {
      const { rows } = await pool.query(`SELECT
        (SELECT count(*)::int FROM users) AS users,
        (SELECT count(*)::int FROM teams) AS teams,
        (SELECT count(*)::int FROM memberships) AS memberships,
        (SELECT count(*)::int FROM devices) AS devices,
        (SELECT count(*)::int FROM projects) AS projects`);
      return { counts: rows[0], updatedAt: new Date().toISOString() };
    },
    async list(type, params) {
      const table = tables[type];
      if (!table) return null;
      const page = params.get('page') || '1';
      const q = (params.get('q') || '').trim();
      if (!/^[1-9]\d{0,5}$/.test(page) || q.length > 128) {
        const error = new Error('Invalid pagination or query');
        error.status = 400;
        throw error;
      }
      const pageSize = 25;
      const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
      const where = q ? ` WHERE ${table.search.map((column) => `${column} ILIKE $1`).join(' OR ')}` : '';
      const values = q ? [pattern] : [];
      const client = await pool.connect();
      try {
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        const total = await client.query(`SELECT count(*)::int AS total FROM ${table.source}${where}`, values);
        const result = await client.query(`SELECT ${table.columns.join(', ')} FROM ${table.source}${where} ORDER BY ${table.order} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values, pageSize, (Number(page) - 1) * pageSize]);
        await client.query('COMMIT');
        return { items: result.rows, total: total.rows[0].total, page: Number(page), pageSize };
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally { client.release(); }
    },
  };
}
