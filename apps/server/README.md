# PiMesh 团队服务

服务端版本 **0.3.0**。`src/` 保存 HTTP/TLS 服务、邀请注册与登录、团队/项目权限、只读目录查询和迁移入口，`public/` 保存页面，
`migrations/` 为数据库迁移，`tests/` 为验证，`deploy/` 为部署模板。

从仓库根目录运行：

```sh
npm ci --prefix apps/server --ignore-scripts
npm test --prefix apps/server
# 注入 DATABASE_URL 等配置后：
npm run migrate --prefix apps/server
npm start --prefix apps/server
```

部署时将此目录内容复制到 `/opt/pimesh/server`，systemd 启动 `src/index.mjs`。
详见 [部署说明](../../docs/team-service.md)。

账号入口 `/account`、管理员入口 `/admin/invites`，迁移与配置见 [账号指南](../../docs/auth.md)。
默认不启用账号功能；不自动迁移生产库，不自动创建默认管理员密码。
存活检查返回应用版本，响应头 `X-PiMesh-Version` 便于确认实际部署版本。

工作台 `/`，个人账号 `/account`，平台管理 `/admin/teams`、`/admin/invites`，独立目录 `/admin/directory`。
团队规则、API 与 003 迁移要求见 [团队指南](../../docs/teams.md)。
