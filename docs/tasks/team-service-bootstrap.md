# team-service-bootstrap

## 目标与验收条件
- 启动测试 PostgreSQL 与 PiMesh 服务，保留可配置接口。
- 验证数据库连接、失败响应、恢复和 systemd 自启配置。

## 当前状态
- 状态：待交接
- 分支：`codex/team-service-bootstrap`
- PR：[#3](https://github.com/jerrymomo10/PiMesh/pull/3)
- 最近更新时间：2026-09-07（Asia/Shanghai）
- 最近工作设备：本地 macOS / 测试 ECS
- 验证版本：`bdd648f`，服务器应用文件 SHA-256 与此版本一致；后续仅交接文档更新。

## 已完成
- `server/` 独立服务、公开 npm 锁文件、健康检查与故障测试。
- `deploy/` systemd 与环境配置模板；README、AGENTS.md、部署文档和 CI 更新。
- 测试 ECS 已安装 PostgreSQL 15.18、Node.js 22.23.0，独立数据库与应用账户。
- 服务和数据库仅监听回环地址；通过 SSH 隧道连接，未开公网 API。

## 验证
- 本地 Node v25.2.1：语法检查和服务回归测试通过。
- ECS Node v22.23.0：服务回归测试通过。
- 真实数据库断开返回 503、存活返回 200，恢复和应用重启后就绪返回 200。
- systemd 两项服务均启用开机启动；未重启整台 ECS。

## 关键决定与限制
- 仅服务基础；登录、成员、设备、项目业务 API 尚未实现。
- 连接配置在服务器 `/etc/pimesh/server.env`，没有提交或输出真实密码。
- 采用系统包与 systemd；见 [部署文档](../team-service.md)。
- 没有自动异地备份，测试实例到期前需保留数据。

## 失败尝试
- 初次服务锁文件沿用本机私有 registry，服务器无法解析；已替换公开 registry 并验证完整性。
- 服务器访问公开 registry 超时，采用本机锁定安装后的纯 JavaScript 包部署，服务器测试通过。
- 本地受限沙箱不允许监听测试端口，提升执行权限后测试通过。

## 下一步与交接
1. PR 审阅与合并；服务器已由用户授权提前部署本次代码。
2. 实现团队身份与项目 API，确定邮箱认证方式；配置 HTTPS 后再提供公开业务入口。
3. 同步结果和实际部署提交见交付回复；本机模型凭据与 Transcript 未迁移。
