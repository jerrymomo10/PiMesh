const errors = {
  authentication_required: '登录已失效，请到账号页登录。', admin_authentication_required: '请使用平台管理员凭据。',
  admin_required: '只有平台管理员可以创建团队。', owner_required: '只有团队负责人可以执行此操作。',
  team_not_found: '团队不存在或你已无权访问。', invalid_name: '名称需要 1–100 位。',
  invalid_owner: '请填写已注册且启用的负责人用户名。', invalid_slug: '项目标识需为 3–48 位小写字母、数字或短横线，字母开头。',
  already_exists: '该项目标识在此团队中已存在，请刷新列表或更换标识。',
  already_member: '你已在此团队中，邀请码未被使用。', invalid_team_invite: '团队邀请码无效、过期、撤销或已使用。',
  invite_not_available: '邀请码已使用、已撤销或不存在，请刷新。', owner_cannot_be_removed: '不能移除团队负责人。',
  member_not_found: '成员已移除或不存在，请刷新。', try_later: '请求过于频繁，请稍后再试。',
};
export async function api(path, data) {
  const response = await fetch(path, {
    method: data === undefined ? 'GET' : 'POST', credentials: 'same-origin', signal: AbortSignal.timeout(15000),
    headers: data === undefined ? {} : { 'Content-Type': 'application/json', 'X-PiMesh-Request': '1' },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(errors[result.error] || '请求失败，请刷新后重试。'), { status: response.status });
  return result;
}
export const $ = (id) => document.getElementById(id);
export function element(tag, text, parent) {
  const node = document.createElement(tag); node.textContent = text;
  if (parent) parent.append(node);
  return node;
}
export function action(label, work, parent) {
  const button = element('button', label, parent); button.type = 'button';
  button.addEventListener('click', () => run(button, work)); return button;
}
export async function run(button, work) {
  button.disabled = true; $('message').textContent = '正在处理…';
  try { await work(); }
  catch (error) { $('message').textContent = error.message || '连接中断，请刷新检查结果后再重试。'; }
  finally { button.disabled = false; }
}
export function form(id, work) {
  $(id).addEventListener('submit', (event) => {
    event.preventDefault(); const target = event.target;
    run(target.querySelector('button'), () => work(Object.fromEntries(new FormData(target)), target));
  });
}
export function pager(parent, page, more, load) {
  const nav = element('nav', '', parent); nav.setAttribute('aria-label', '分页');
  const prev = action('上一页', () => load(page - 1), nav); prev.disabled = page <= 1;
  element('span', ` 第 ${page} 页 `, nav);
  const next = action('下一页', () => load(page + 1), nav); next.disabled = !more;
}
