const $ = (id) => document.getElementById(id);
async function api(suffix = '', data) {
  const response = await fetch(`/api/v1/admin/invites${suffix}`, {
    method: data ? 'POST' : 'GET', credentials: 'same-origin', signal: AbortSignal.timeout(15000),
    headers: data ? { 'Content-Type': 'application/json', 'X-PiMesh-Request': '1' } : {}, body: data ? JSON.stringify(data) : undefined,
  });
  if (!response.ok) throw new Error(response.status === 401 ? '需要管理员认证。' : '操作失败，请刷新状态后重试。');
  return response.json();
}
async function load() {
  $('refresh').disabled = true;
  try {
    const { items } = await api(); $('list').replaceChildren();
    for (const item of items) {
      const row = document.createElement('div'); row.className = 'invite';
      const state = item.used_at ? '已使用' : item.revoked_at ? '已撤销' : new Date(item.expires_at) <= new Date() ? '已过期' : '可使用';
      const text = document.createElement('p'); text.textContent = `${item.invite_id} · ${state} · 到期 ${new Date(item.expires_at).toLocaleString()}`; row.append(text);
      if (state === '可使用') {
        const button = document.createElement('button'); button.textContent = '撤销';
        button.addEventListener('click', async () => {
          button.disabled = true;
          try { await api(`/${item.invite_id}/revoke`, {}); $('message').textContent = '已撤销。'; await load(); }
          catch (error) { $('message').textContent = error.message; button.disabled = false; }
        }); row.append(button);
      }
      $('list').append(row);
    }
    if (!items.length) $('list').textContent = '还没有邀请码。';
  } catch (error) { $('message').textContent = error.message; }
  finally { $('refresh').disabled = false; }
}
$('generate').addEventListener('submit', async (event) => {
  event.preventDefault(); const button = event.target.querySelector('button'); button.disabled = true;
  try {
    const form = new FormData(event.target);
    const { items } = await api('', { count: Number(form.get('count')), days: Number(form.get('days')) });
    // Append so generating another batch does not discard unsaved codes.
    $('codes').textContent += items.map((item) => `${item.invite_id}  ${item.code}`).join('\n') + '\n';
    $('message').textContent = '生成成功。完整邀请码不会再次显示，请安全保存。'; await load();
  } catch (error) { $('message').textContent = error.message; }
  finally { button.disabled = false; }
});
$('refresh').addEventListener('click', load);
load();
