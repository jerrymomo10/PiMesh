# app-layout

## 目标与验收条件
- 将客户端与服务端整理到 `apps/cli`、`apps/server`。
- 根目录聚合开发命令，安装、CI、测试和服务器启动适配新路径。

## 当前状态
- 状态：待交接（实现、部署和验证完成，待 PR 合并）
- 分支：`codex/app-layout`
- 基线：`6a69bd3`，依赖 PR #4；PR 待创建。
- 日期：2026-09-07，Asia/Shanghai
- 设备：本地 macOS / 测试 ECS
- 验证版本：本次目录迁移，实际提交见交付回复。

## 已完成
- 客户端 bin/src/extensions/tests 与锁文件移到 apps/cli，单独的安装说明随包发布。
- 服务端入口集中到 apps/server/src，public/migrations/tests/deploy 同属服务应用。
- 根目录仅保留开发 package.json 与空依赖锁；npm run deps 安装两个独立应用。
- 调整 CI 缓存路径、统一验证命令、客户端源码安装测试、README 与部署文档。
- ECS 更新 systemd 为 /opt/pimesh/server/src/index.mjs，旧平铺源文件移动到备份，未修改数据库、证书或账号配置。

## 验证
- macOS Node v25.2.1：根 npm ci、npm run deps、npm run check、npm test、npm start -- --help 通过。
- 客户端 9 项通过，含打包安装和仓库根目录 ./apps/cli 源码安装。
- 服务端 4 项通过；可选 PostgreSQL 合成数据测试此次未重跑，默认跳过，不沿用旧结论声称重新验证。
- ECS Node v22.23.0：新目录下 npm run check、npm test 和新 migrate 入口通过。
- 公网 HTTPS：未认证 401，认证后的页面、目录摘要与数据库就绪检查均 200。
- git diff --check 通过。

## 关键决定
- 继续使用 npm 独立子包及现有锁文件，不引入 workspace 提升或新框架。
- 根目录不再是 meshpi 可安装包，安装路径改为 ./apps/cli。
- 历史交接文件保留当时路径；当前部署以 docs/team-service.md 为准。

## 下一步与交接
1. 按依赖顺序合并 #3、#4，再切换本 PR 基线至 main 并合并。
2. 全局已安装客户端无需因源码移动自动重装；以后更新按新 README 命令操作。
3. 部署数据与凭据均未迁移；交接提交及远端同步结果见回复。
