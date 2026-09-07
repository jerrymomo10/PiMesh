import { $, api, element, action, form, pager, run } from '/team-api.js';
let selected = null;
function clearTeam() { selected = null; $('detail').hidden = true; $('generated').replaceChildren(); }
async function teams(page = 1) {
  clearTeam();
  const data = await api(`/api/v1/teams?page=${page}`);
  $('teams').replaceChildren();
  if (!data.items.length) element('p', '暂无团队。可使用负责人提供的邀请码加入。', $('teams'));
  for (const team of data.items) {
    const row = element('div', '', $('teams')); row.className = 'invite';
    action(`${team.name} · ${team.role === 'owner' ? '负责人' : '成员'}`, () => openTeam(team.team_id), row);
    element('small', `团队 ID：${team.team_id}`, row);
  }
  pager($('teams'), page, data.has_more, teams); $('message').textContent = '团队列表已更新。';
}
async function list(section, page = 1) {
  const team = selected;
  if (!team) return;
  const data = await api(`/api/v1/teams/${team.team_id}/${section}?page=${page}${section === 'projects' && team.role === 'owner' ? '&include_archived=1' : ''}`);
  if (selected !== team) return;
  const box = $(section); box.replaceChildren();
  if (!data.items.length) element('p', section === 'members' ? '暂无成员。' : '暂无项目。', box);
  for (const item of data.items) {
    const row = element('div', '', box); row.className = 'invite';
    if (section === 'members') {
      element('span', `${item.username || item.display_name} · ${item.role === 'owner' ? '负责人' : '成员'}`, row);
      if (team.role === 'owner' && item.role !== 'owner') action('移除成员', async () => {
        if (!confirm(`移除 ${item.username || item.display_name}？该成员将失去此团队的访问权限。`)) { $('message').textContent = '已取消。'; return; }
        await api(`/api/v1/teams/${team.team_id}/members/${encodeURIComponent(item.user_id)}/remove`, {});
        await list('members'); $('message').textContent = '成员已移除。';
      }, row);
    } else {
      element('strong', item.name, row); element('small', item.slug, row);
      element('small', `项目 ID：${item.project_id}`, row);
      if (item.archived_at) element('p', '已归档', row);
      if (team.role === 'owner') {
        action('更改名称', async () => {
          const name = prompt('项目新名称', item.name); if (name === null) return;
          await api(`/api/v1/teams/${team.team_id}/projects/${item.project_id}`, { name }); await list('projects'); $('message').textContent = '项目已更新。';
        }, row);
        action(item.archived_at ? '恢复项目' : '归档项目', async () => {
          await api(`/api/v1/teams/${team.team_id}/projects/${item.project_id}`, { archived: !item.archived_at }); await list('projects'); $('message').textContent = '项目已更新。';
        }, row);
      }
    }
  }
  pager(box, page, data.has_more, async (next) => { await list(section, next); $('message').textContent = '列表已更新。'; });
}
async function invitations() {
  const team = selected; if (!team || team.role !== 'owner') return;
  const data = await api(`/api/v1/teams/${team.team_id}/invites`);
  if (selected !== team) return;
  $('invites').replaceChildren();
  if (!data.items.length) element('p', '暂无团队邀请。', $('invites'));
  for (const item of data.items) {
    const expired = new Date(item.expires_at) <= new Date();
    const state = item.used_at ? '已使用' : item.revoked_at ? '已撤销' : expired ? '已过期' : '可使用';
    const row = element('div', '', $('invites')); row.className = 'invite';
    element('p', `${state} · 到期 ${new Date(item.expires_at).toLocaleString()}`, row);
    element('small', `记录 ID（不是邀请码）：${item.invite_id}`, row);
    if (!item.used_at && !item.revoked_at && !expired) action('撤销', async () => {
      await api(`/api/v1/teams/${team.team_id}/invites/${item.invite_id}/revoke`, {});
      await invitations(); $('message').textContent = '团队邀请已撤销。';
    }, row);
  }
}
async function openTeam(id) {
  clearTeam();
  const data = await api(`/api/v1/teams/${id}`);
  selected = data.team;
  $('team-name').textContent = selected.name;
  $('role').textContent = selected.role === 'owner' ? '你是团队负责人，可以管理成员、邀请和项目。' : '你可以查看本团队的成员和项目。';
  $('owner-tools').hidden = selected.role !== 'owner';
  $('members').replaceChildren(); $('projects').replaceChildren(); $('invites').replaceChildren();
  try { await list('members'); await list('projects'); await invitations(); $('detail').hidden = false; $('message').textContent = '团队已打开。'; }
  catch (error) { clearTeam(); throw error; }
}
form('join', async (data, target) => {
  const result = await api('/api/v1/teams/join', data); target.reset(); await teams(); await openTeam(result.team.team_id);
  $('message').textContent = '已加入团队。';
});
form('project', async (data, target) => {
  if (!selected) return;
  await api(`/api/v1/teams/${selected.team_id}/projects`, data); target.reset(); await list('projects'); $('message').textContent = '项目已创建。';
});
form('invite', async (data) => {
  if (!selected) return;
  const team = selected;
  const result = await api(`/api/v1/teams/${team.team_id}/invites`, { days: Number(data.days) });
  if (selected !== team) return;
  const row = element('div', '', $('generated')); row.className = 'invite';
  element('strong', '团队邀请码（复制下方完整内容）', row);
  const input = element('input', '', row); input.readOnly = true; input.value = result.invite.code; input.setAttribute('aria-label', '生成的团队邀请码');
  input.addEventListener('focus', () => input.select());
  element('small', `记录 ID：${result.invite.invite_id}`, row);
  $('message').textContent = '邀请码已生成，请保存；切换团队或刷新后不再显示。'; await invitations();
});
$('refresh').addEventListener('click', () => run($('refresh'), () => teams()));
try { await api('/api/v1/auth/me'); $('workspace').hidden = false; await teams(); }
catch (error) { $('login-needed').hidden = false; $('message').textContent = error.status === 401 ? '请先登录。' : error.message; }
