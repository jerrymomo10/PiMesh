# 团队服务测试部署

## 当前范围

独立 Node.js HTTP 服务，使用 `pg` 驱动连接 PostgreSQL；与 meshpi 模型客户端依赖隔离。
使用 PostgreSQL 15 和 Node.js 22 的系统软件包，减少小内存服务器的常驻组件。
目前没有身份业务表和登录接口，不接收 Transcript 或模型凭据。

- `GET /api/v1/health/live`：进程存活返回 200。
- `GET /api/v1/health/ready`：数据库查询成功返回 200；失败返回 503，不返回连接秘密。
- 其他路径返回 404，非 GET 方法返回 405。

## 安装与配置

本地验证：

```sh
npm ci --prefix server --ignore-scripts
npm test --prefix server
```

服务器需要 Node.js >=22、PostgreSQL 和 systemd；当前部署验证平台为 Alibaba Cloud Linux 4。
将 `server/` 内容部署到 `/opt/pimesh/server`，执行 `npm ci --omit=dev --ignore-scripts`。
若服务器无法访问 npm，可在可信构建环境按锁文件安装并打包纯 JavaScript 依赖，
上传后在服务器运行 `npm test`；包含原生依赖时必须在目标平台构建。
创建独立系统用户 `pimesh`，为其提供源码读取权限；数据库创建非超级用户 `pimesh` 与同名数据库。
PostgreSQL 仅监听 `127.0.0.1`，应用 TCP 连接采用 SCRAM 密码认证。

参考 `deploy/server.env.example` 创建 `/etc/pimesh/server.env`（root 所有、0600），
设置随机数据库密码，禁止将真实配置提交 Git。环境文件由 systemd 读取。
复制 `deploy/pimesh-team.service` 到 `/etc/systemd/system/`，执行：

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now postgresql pimesh-team
curl --fail http://127.0.0.1:8080/api/v1/health/ready
```

`HOST` 默认 `127.0.0.1`，`PORT` 默认 `8080`，`DATABASE_URL` 必填。
连接池最多 5 个连接；连接超时 2 秒，查询超时 3 秒。
默认可通过 SSH 隧道访问：

```sh
ssh -N -L 18080:127.0.0.1:8080 <ssh-user>@<server-host>
curl --fail http://127.0.0.1:18080/api/v1/health/ready
```

当前测试部署经维护者授权设置 `HOST=0.0.0.0`，配合维护者放行的 TCP 8080 安全组规则，
已验证公网 HTTP 健康检查返回 200。模板仍默认监听回环地址，PostgreSQL 不对公网开放。
后续登录等业务 API 入口需配置 HTTPS；当前没有域名或证书。
数据库连接集中在 `server/index.mjs`，HTTP 层通过注入连接池测试，后续业务增加独立存储模块。
换服务器需同时迁移数据与配置；单纯改服务地址不会迁移数据。

## 运维与数据

```sh
sudo systemctl status pimesh-team postgresql
sudo journalctl -u pimesh-team -n 50 --no-pager
sudo systemctl restart pimesh-team
```

应用服务开机启动、失败重启，使用独立账户，内存上限 256 MiB。
数据库数据位于 `/var/lib/pgsql/data`，应用目录或服务重启不会删除数据库。
应用自身不自动重试业务写入；当前只有只读健康检查。

数据库备份应写入权限受限目录，并复制到实例之外；停止服务并不等于备份。
可用 `pg_dump -Fc` 导出，在独立临时数据库用 `pg_restore` 验证恢复。
本轮不提供自动异地备份，测试实例到期前需要导出或续费。
