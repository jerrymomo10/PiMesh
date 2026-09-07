const definitions = {
  users: { label: '用户', icon: '♙', description: '查看用户身份与账户状态', columns: [['user_id','用户 ID'],['display_name','显示名称'],['email','邮箱'],['status','状态'],['created_at','创建时间']] },
  teams: { label: '团队', icon: '♧', description: '查看研究团队及其创建者', columns: [['name','团队名称'],['team_id','团队 ID'],['created_by','创建者'],['created_at','创建时间']] },
  memberships: { label: '成员关系', icon: '⇄', description: '查看用户与团队之间的角色和关系', columns: [['user_id','用户 ID'],['team_id','团队 ID'],['role','角色'],['status','状态'],['joined_at','加入时间']] },
  devices: { label: '设备', icon: '▣', description: '查看已注册的客户端档案实例', columns: [['name','设备名称'],['user_id','所属用户'],['device_id','设备 ID'],['created_at','注册时间'],['revoked_at','撤销时间']] },
  projects: { label: '项目', icon: '▱', description: '查看团队研究项目及负责人', columns: [['name','项目名称'],['slug','项目短名'],['team_id','所属团队 ID'],['owner_id','负责人'],['created_at','创建时间'],['archived_at','归档时间']] },
};
const $ = (id) => document.getElementById(id);
let current = 'users', page = 1, total = 0, requestId = 0, debounce;
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
for (const [key, def] of Object.entries(definitions)) {
  const nav = element('button', undefined, 'nav-item');
  nav.dataset.type = key;
  nav.append(element('span', def.icon, 'nav-icon'), element('span', def.label), element('span', '—', 'nav-count'));
  nav.addEventListener('click', () => select(key));
  $('navigation').append(nav);
  const card = element('button', undefined, 'stat');
  card.dataset.type = key;
  const top = element('span', undefined, 'stat-top');
  top.append(element('span', def.label), element('span', def.icon, 'stat-icon'));
  card.append(top, element('span', '—', 'stat-number'));
  card.addEventListener('click', () => select(key));
  $('stats').append(card);
}
function select(key) {
  current = key; page = 1; $('search').value = '';
  for (const node of document.querySelectorAll('[data-type]')) {
    const active = node.dataset.type === key;
    node.classList.toggle(node.classList.contains('stat') ? 'selected' : 'active', active);
    node.setAttribute('aria-pressed', String(active));
  }
  $('table-title').textContent = definitions[key].label;
  $('table-description').textContent = definitions[key].description;
  $('search').placeholder = `搜索${definitions[key].label}…`;
  load();
}
async function api(path) {
  const response = await fetch(path, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) { const error = new Error('Request failed'); error.status = response.status; throw error; }
  return response.json();
}
function message(title, description, error = false) {
  const box = element('div', undefined, `empty${error ? ' error' : ''}`);
  box.append(element('div', error ? '!' : '▤', 'empty-icon'), element('strong', title), element('p', description));
  $('message').replaceChildren(box);
}
async function load() {
  const id = ++requestId, type = current;
  $('refresh').disabled = true;
  $('previous').disabled = true; $('next').disabled = true;
  $('table-body').replaceChildren();
  $('result-count').textContent = '正在读取…';
  const head = element('tr');
  definitions[type].columns.forEach(([, title]) => head.append(element('th', title)));
  $('table-head').replaceChildren(head);
  message('正在读取数据库', '请稍候…');
  const results = await Promise.allSettled([
    api('/api/v1/directory/summary'),
    api(`/api/v1/directory/${type}?page=${page}&q=${encodeURIComponent($('search').value)}`),
  ]);
  if (id !== requestId) return;
  $('refresh').disabled = false;
  const [summary, listing] = results;
  const locked = results.some((r) => r.status === 'rejected' && r.reason.status === 403);
  const healthy = summary.status === 'fulfilled' && listing.status === 'fulfilled';
  $('connection').textContent = healthy ? '● 数据库已连接' : locked ? '● 数据访问未开启' : '● 数据暂不可用';
  $('connection').classList.toggle('bad', !healthy);
  for (const node of document.querySelectorAll('[data-type]')) {
    const count = summary.status === 'fulfilled' ? summary.value.counts[node.dataset.type] : '—';
    node.querySelector('.nav-count, .stat-number').textContent = count;
  }
  if (summary.status === 'fulfilled') $('updated').textContent = `最近刷新 ${new Date(summary.value.updatedAt).toLocaleTimeString('zh-CN')}`;
  else $('updated').textContent = '同步失败 · 请重试';
  if (listing.status === 'rejected') {
    message(locked ? '数据访问尚未开启' : '暂时无法读取数据', locked ? '页面已上线。管理员配置访问方式后，即可查看团队数据。' : '数据库或服务可能暂时不可用，点击右上角刷新重试。', !locked);
    $('result-count').textContent = '读取失败';
    return;
  }
  const { items, total: count, pageSize } = listing.value;
  total = count;
  $('message').replaceChildren();
  if (!items.length) {
    const searching = $('search').value.trim();
    message(searching ? '没有找到匹配记录' : `还没有${definitions[type].label}记录`, searching ? '试试其他关键词，或清空搜索查看全部。' : '数据库当前为空。后续写入真实记录后，会显示在这里。');
  }
  for (const row of items) {
    const tr = element('tr');
    for (const [field] of definitions[type].columns) {
      let value = row[field];
      if (field.endsWith('_at') && value) value = new Date(value).toLocaleString('zh-CN', { hour12: false });
      const td = element('td');
      if (field === 'status' || field === 'role') {
        const labels = { active: '正常', disabled: '已停用', removed: '已移除', owner: '负责人', member: '成员' };
        td.append(element('span', labels[value] || value, `badge${['disabled','removed'].includes(value) ? ' muted' : ''}`));
      } else { td.textContent = value ?? '—'; td.title = String(value ?? ''); }
      tr.append(td);
    }
    $('table-body').append(tr);
  }
  $('result-count').textContent = `共 ${total} 条记录`;
  $('page-label').textContent = `第 ${page} / ${Math.max(1, Math.ceil(total / pageSize))} 页`;
  $('previous').disabled = page <= 1;
  $('next').disabled = page * pageSize >= total;
}
$('refresh').addEventListener('click', load);
$('previous').addEventListener('click', () => { if (page > 1) { page--; load(); } });
$('next').addEventListener('click', () => { page++; load(); });
$('search').addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(() => { page = 1; load(); }, 250); });
select(current);
