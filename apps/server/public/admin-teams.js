import { $, api, element, action, form, pager, run } from '/team-api.js';
async function load(page = 1) {
  const result = await api(`/api/v1/admin/teams?page=${page}`);
  $('teams').replaceChildren();
  if (!result.items.length) element('p', '暂无团队。', $('teams'));
  for (const team of result.items) {
    const row = element('div', '', $('teams')); row.className = 'invite';
    element('strong', team.name, row); element('p', `负责人：${team.owner_username || '历史用户'}`, row);
    element('small', `团队 ID：${team.team_id}`, row);
    element('p', team.archived_at ? '已归档' : '使用中', row);
    action('更改名称', async () => {
      const name = prompt('团队新名称', team.name); if (name === null) return;
      await api(`/api/v1/admin/teams/${team.team_id}`, { name }); await load(page);
    }, row);
    action('更换负责人', async () => {
      const owner = prompt('新负责人已注册的用户名'); if (!owner) return;
      if (!confirm('更换负责人将撤销未使用的团队邀请，原负责人变为普通成员。继续？')) return;
      await api(`/api/v1/admin/teams/${team.team_id}`, { owner }); await load(page);
    }, row);
    action(team.archived_at ? '恢复团队' : '归档团队', async () => {
      if (!confirm('归档后所有成员无法访问团队与项目，未使用的邀请将撤销；可恢复团队。继续？')) return;
      await api(`/api/v1/admin/teams/${team.team_id}`, { archived: !team.archived_at }); await load(page);
    }, row);
  }
  pager($('teams'), page, result.has_more, load);
  $('message').textContent = '团队列表已更新。';
}
form('create', async (data, target) => {
  if (!confirm(`创建团队“${data.name}”，并指定 ${data.owner} 为负责人？`)) { $('message').textContent = '已取消。'; return; }
  await api('/api/v1/admin/teams', data); target.reset(); await load(); $('message').textContent = '团队已创建，负责人可在用户工作台查看。';
});
$('refresh').addEventListener('click', () => run($('refresh'), () => load()));
try { await load(); } catch (error) { $('message').textContent = error.message; }
