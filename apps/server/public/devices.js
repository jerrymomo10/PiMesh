import { $, api, element, action, form, pager, run } from '/team-api.js';
async function load(page = 1) {
  const result = await api(`/api/v1/devices?page=${page}`); $('devices').replaceChildren();
  if (!result.items.length) element('p', '暂无设备。请在本机运行 meshpi team login。', $('devices'));
  for (const device of result.items) {
    const row = element('div', '', $('devices')); row.className = 'invite';
    element('strong', device.name, row); element('p', device.revoked_at ? '已撤销' : '可用', row); element('small', device.device_id, row);
    if (!device.revoked_at) action('撤销设备', async () => {
      if (!confirm('撤销此设备的 CLI 登录？本地研究记录不会删除。')) return;
      await api(`/api/v1/devices/${device.device_id}/revoke`, {}); await load(page); $('message').textContent = '设备已撤销。';
    }, row);
  }
  pager($('devices'), page, result.has_more, load); $('message').textContent = '设备列表已更新。';
}
form('password', async (data, target) => {
  await api('/api/v1/account/password', data); target.reset(); $('message').textContent = '密码已修改，请到我的账号重新登录。'; $('devices').replaceChildren();
});
$('refresh').addEventListener('click', () => run($('refresh'), () => load()));
try { await load(); } catch (error) { $('message').textContent = error.message; }
