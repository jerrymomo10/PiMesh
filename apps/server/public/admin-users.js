import { $, api, element, action, form, pager, run } from '/team-api.js';
let selected;
async function devices(page = 1) {
  const user = selected;
  const result = await api(`/api/v1/admin/users/${user.user_id}/devices?page=${page}`);
  if (selected !== user) return;
  $('devices').replaceChildren();
  if (!result.items.length) element('p', '暂无设备。', $('devices'));
  for (const device of result.items) {
    const row = element('div', '', $('devices')); row.className = 'invite';
    element('p', `${device.name} · ${device.revoked_at ? '已撤销' : '可用'}`, row);
    element('small', device.device_id, row);
    if (!device.revoked_at) action('撤销设备', async () => {
      if (!confirm('撤销此设备的 CLI 登录？')) return;
      await api(`/api/v1/admin/users/${user.user_id}/devices/${device.device_id}/revoke`, {}); await devices(); $('message').textContent = '设备已撤销。';
    }, row);
  }
  pager($('devices'), page, result.has_more, devices);
}
async function load(page = 1) {
  const result = await api(`/api/v1/admin/users?page=${page}`);
  selected = null; $('selected').hidden = true; $('reset').reset(); $('users').replaceChildren();
  for (const user of result.items) {
    const row = element('div', '', $('users')); row.className = 'invite';
    element('strong', user.username || user.display_name, row); element('p', `${user.email} · ${user.status === 'active' ? '启用' : '停用'}`, row);
    action('密码与设备', async () => { selected = user; $('reset').reset(); $('selected-name').textContent = user.username || user.display_name; await devices(); $('selected').hidden = false; $('message').textContent = '已选择用户。'; }, row);
    action(user.status === 'active' ? '停用账号' : '启用账号', async () => {
      if (!confirm(`更改 ${user.username || user.display_name} 的账号状态？停用将撤销全部会话。`)) return;
      await api(`/api/v1/admin/users/${user.user_id}/status`, { status: user.status === 'active' ? 'disabled' : 'active' }); await load(page); $('message').textContent = '账号状态已更新。';
    }, row);
  }
  if (!result.items.length) element('p', '暂无用户。请先生成注册邀请。', $('users'));
  pager($('users'), page, result.has_more, load);
}
form('reset', async (data, target) => {
  if (!selected || !confirm(`重设 ${selected.username || selected.display_name} 的密码并撤销全部会话？`)) return;
  await api(`/api/v1/admin/users/${selected.user_id}/password`, data); target.reset(); $('message').textContent = '密码已重设，用户需要重新登录。';
});
$('refresh').addEventListener('click', () => run($('refresh'), () => load()));
try { await load(); } catch (error) { $('message').textContent = error.message; }
