# 团队目录服务

## 已实现

Node.js + PostgreSQL 服务提供 `/` 团队目录页面，展示用户、团队、成员关系、设备、项目。
支持 25 条分页、关键词搜索、计数和手动刷新；空库显示空状态，错误不伪装成零条数据。
只选取明确的基础字段，不查询模型密钥、令牌、Transcript 或设备本地路径。
当前没有注册、邀请、创建项目等写接口；查看账号不代表团队成员身份。

## 配置与运行

```sh
npm ci --prefix apps/server --ignore-scripts
npm test --prefix apps/server
# 通过运行环境注入 DATABASE_URL，再执行：
npm run migrate --prefix apps/server
npm start --prefix apps/server
```

`apps/server/migrations/001-directory.sql` 是事务式初始迁移，仅新增表和迁移版本标记。
用户 ID 与邮箱前缀一致，用户 ID 和邮箱唯一；项目短名在团队内唯一，关联使用外键。
没有自动身份验证或邮箱认证，后续写入 API 需实现相应规则。
生产服务启动不自动执行迁移。更新前备份，迁移失败不能继续部署；不自动删除表回退。

参考 `apps/server/deploy/server.env.example` 和 systemd 模板：

| 变量 | 作用 |
| --- | --- |
| `HOST` / `PORT` | 默认 `127.0.0.1:8080`，测试 ECS 显式配置 `0.0.0.0:8080` |
| `DATABASE_URL` | 数据库连接，仅保存在服务器受限文件 |
| `DIRECTORY_ENABLED` | `true` 时启用目录数据，默认关闭 |
| `DIRECTORY_ACCESS_HASH` | `用户名:高强度随机密码` 的 SHA-256 十六进制摘要 |
| `TLS_CERT_FILE` / `TLS_KEY_FILE` | HTTPS 证书与私钥；目录启用时必须提供 |

独立系统账户 `pimesh` 运行应用，systemd 读取 root 所有、0600 的环境文件。
证书路径必须允许应用账户读取，私钥仅 root 和应用组可读。
部署时复制 `apps/server/` 内容；应用目录 `/opt/pimesh/server`（启动入口 `src/index.mjs`），配置 `/etc/pimesh/server.env`，systemd 单元 `pimesh-team`。
PostgreSQL 只监听 `127.0.0.1:5432`，应用使用独立非超级用户及 SCRAM 密码认证。

## 访问与安全边界

测试部署访问 `https://<server-ip>:8080/`，浏览器要求输入独立查看账号。
本周使用带服务器 IP SAN 的 8 天自签名证书，浏览器首次会显示不受信任提示，需用户核对后决定是否继续。
请求必须使用 HTTPS；原先的 HTTP 健康检查地址同时改为 HTTPS。
后续改为受信任证书；不自动修改用户系统信任库。

页面、静态资源和目录 API 使用 HTTP Basic 访问保护；高强度随机密码通过本机受限文件单独交付。
无身份或错误密码返回 401，登录后可查看全部目录基础信息。此账号不应分发给普通团队成员。
未来成员权限体系需替换临时查看账号。客户端使用 textContent 渲染数据库字段，避免 HTML 注入。

- `GET /api/v1/health/live`：不含数据的存活检查，200。
- `GET /api/v1/health/ready`：数据库查询成功 200，失败 503，不需登录。
- `GET /api/v1/directory/summary`：认证后返回五类记录数量。
- `GET /api/v1/directory/{users|teams|memberships|devices|projects}?q=&page=1`：认证后返回分页列表。
- 非 GET 返回 405，不支持任意表名或 SQL。搜索参数绑定，单页计数与列表使用一致快照。

## 运维与验证

```sh
sudo systemctl status pimesh-team postgresql
sudo journalctl -u pimesh-team -n 50 --no-pager
sudo systemctl restart pimesh-team
```

应用池最多 5 个连接，查询超时 3 秒，systemd 内存上限 256 MiB，失败重启并开机启动。
持久化目录 `/var/lib/pgsql/data`；实例到期前需导出数据或续费，当前无自动异地备份。
可用 `pg_dump -Fc` 导出并在独立临时数据库验证恢复。

默认测试不需要真实凭据，数据库测试默认跳过。
提供 `TEST_DATABASE_URL` 可验证真实 PostgreSQL，强制要求数据库名以 `pimesh_test_` 开头；
测试写入合成记录，调用方负责创建空临时库并在完成后删除，不得指向团队库。
Linux ECS 已验证数据库迁移、重复执行、唯一性和外键、分页、参数化搜索及目录查询。
服务器 npm 不通时，可上传按锁文件安装的纯 JavaScript 包并在服务器重新测试。

## GitHub Actions 自动部署

`.github/workflows/deploy-server.yml` 在 `main` 的服务端代码或工作流变化时触发，
也支持 Actions → Deploy team service → Run workflow（选择 main）。PR 只验证，不部署。
工作流先执行服务端检查、离线测试和部署回滚测试，再进入 `production` 环境部署。
这是独立于全仓库测试的服务端检查，不依赖 npm 发布账号。

首次在现有 ECS 上配置（需 root，公钥文件为一行 Ed25519 公钥）：

```sh
sudo bash apps/server/deploy/bootstrap.sh /path/to/deploy-key.pub \
  https://<server-ip>:8080/api/v1/health/ready /path/to/trusted-server-ca.crt
```

脚本创建 `pimesh-deploy` 账号，公钥只能调用固定发布脚本，禁止 SSH 转发。
该账号仅可 sudo 重启 `pimesh-team`，不能 sudo 操作 PostgreSQL。
应用继续以 `pimesh` 运行；部署代码本身具有应用的数据访问能力，因此部署密钥仍属敏感凭据。
脚本由 root 安装到 `/usr/local/libexec/pimesh-release`；修改发布脚本或 systemd 设置后需管理员重新安装，
普通应用发布不自动提升权限更新它们。

GitHub Settings → Environments → production 配置 Secrets：

| 名称 | 内容 |
| --- | --- |
| `DEPLOY_HOST` | ECS IP 或主机名 |
| `DEPLOY_SSH_KEY` | 专用 Ed25519 私钥，不复用个人 SSH 密钥 |
| `DEPLOY_KNOWN_HOSTS` | 经可信渠道核对的服务器 SSH 公钥记录 |

环境仅允许 main 部署。不要通过在 CI 中临时 ssh-keyscan 来替代主机身份校验。
自签名 HTTPS 证书的可信副本位于 `/etc/pimesh-deploy/ca.crt`，健康检查不会跳过证书验证。
证书过期或轮换后需更新该文件；配置地址见 `/etc/pimesh-deploy/health.conf`。

发布包在 Ubuntu runner 使用锁文件安装生产依赖后生成，仅含应用、迁移清单和依赖。
当前依赖为纯 JavaScript；若以后新增原生模块，需核对 runner 与 ECS 的架构及 ABI。
服务器 `/opt/pimesh/deployment/releases/` 按提交保存版本，`current` 原子切换；
systemd override 将启动路径指向 current，原 `/opt/pimesh/server` 保留。
部署不会改写 `/etc/pimesh/server.env`、TLS 私钥或数据库。

重启或数据库就绪检查失败时自动切回上一版应用，工作流仍报告失败。
服务器 flock 和 Actions concurrency 防止部署交叉。重启期间有短暂中断，并非零停机部署。
成功的旧版本保留，需定期人工检查磁盘使用量；不自动删除历史版本。

自动部署要求 migrations 目录与当前发布完全一致，不自动运行迁移或回退数据库。
迁移变化时，管理员先备份并手工迁移、验证新版本与旧版本兼容，再手工部署对应版本作为新基线；
不能仅修改迁移清单绕过检查。后续普通代码变更恢复自动部署。

验证：`python3 apps/server/deploy/tests/test_release.py` 覆盖成功、重启失败、健康失败、迁移变化及非法版本。
真实 PostgreSQL 集成测试仍需临时数据库，自动部署的离线测试不会冒充该项验证。
