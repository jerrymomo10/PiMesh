# PiMesh 团队服务

`src/` 保存 HTTP/TLS 服务、只读目录查询和迁移入口，`public/` 保存页面，
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
