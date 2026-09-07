import { $, api, element, form, pager, run } from '/team-api.js';
async function load(page = 1) {
  const result = await api(`/api/v1/admin/teams?page=${page}`);
  $('teams').replaceChildren();
  if (!result.items.length) element('p', '暂无团队。', $('teams'));
  for (const team of result.items) {
    const row = element('div', '', $('teams')); row.className = 'invite';
    element('strong', team.name, row); element('p', `负责人：${team.owner_username || '历史用户'}`, row);
    element('small', `团队 ID：${team.team_id}`, row);
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
