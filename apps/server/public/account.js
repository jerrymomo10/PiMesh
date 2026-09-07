const $ = (id) => document.getElementById(id);
const errors = {
  invalid_credentials: '用户名／邮箱或密码不正确。', invalid_invite: '邀请码无效、已使用、已撤销或已过期。',
  account_unavailable: '用户名或邮箱不可用，请更换后重试。', invalid_registration: '请检查用户名、邮箱、密码长度和邀请码。',
  try_later: '请求过于频繁，请稍后再试。', authentication_required: '请登录。',
};
async function api(path, data) {
  const response = await fetch(`/api/v1/auth/${path}`, {
    method: data ? 'POST' : 'GET', credentials: 'same-origin', signal: AbortSignal.timeout(15000),
    headers: data ? { 'Content-Type': 'application/json', 'X-PiMesh-Request': '1' } : {},
    body: data ? JSON.stringify(data) : undefined,
  });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(errors[result.error] || '请求失败，请稍后重试。'), { status: response.status });
  return result;
}
function show(user) {
  $('signed-in').hidden = !user; $('signed-out').hidden = Boolean(user);
  $('profile').replaceChildren();
  if (user) {
    for (const [label, value] of [['用户 ID', user.user_id], ['用户名', user.username], ['邮箱（未验证）', user.email]]) {
      const dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = label; dd.textContent = value; $('profile').append(dt, dd);
    }
  }
}
for (const name of ['login', 'register']) {
  $(name).addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.target.querySelector('button'); button.disabled = true;
    $('message').textContent = '正在处理…';
    try {
      const result = await api(name, Object.fromEntries(new FormData(event.target)));
      event.target.reset();
      if (name === 'register') { $('message').textContent = '注册成功，请使用用户名或邮箱登录。'; $('login').elements.login.value = result.user.username; $('login').elements.password.focus(); }
      else { show(result.user); $('message').textContent = '登录成功。'; }
    } catch (error) { $('message').textContent = error.message; }
    finally { button.disabled = false; }
  });
}
$('logout').addEventListener('click', async () => {
  $('logout').disabled = true;
  try { await api('logout', {}); show(null); $('message').textContent = '已退出登录。'; }
  catch (error) { $('message').textContent = error.message; }
  finally { $('logout').disabled = false; }
});
try { show((await api('me')).user); $('message').textContent = '已登录。'; }
catch (error) { show(null); $('message').textContent = error.status === 401 ? '请登录或使用邀请码注册。' : error.message; }
