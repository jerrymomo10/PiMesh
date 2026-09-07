# team-workspace

## 目标与状态
- 状态：进行中；分支：codex/team-workspace；基线：f26b9aa。
- 只有平台管理员可以创建团队并指定负责人；负责人管理成员、邀请与项目，成员按团队隔离。
- 统一用户和管理入口，见 docs/teams.md。维护者明确要求规范入口。
- 最近更新时间：2026-09-08 Asia/Shanghai；设备：本地 macOS。

## 实现与决定
- Node.js/PostgreSQL 现有栈，无新依赖。服务端 0.3.0，CLI 不变。
- 新增 003-team-invites，成员关系与项目沿用现有表。创建和邀请核销事务化，团队锁串行化权限与成员变更。
- 工作台 /，账号 /account；管理 /admin/teams、/admin/invites、/admin/directory。
- 普通用户无团队创建权限；负责人不能被移除。不含角色转让、研究记录、CLI 接入或 Memory。

## 验证
- 本地服务端 check 通过，11 项离线测试通过，3 项数据库测试因无 PostgreSQL 跳过。
- 待 GitHub PostgreSQL 15 验证并发、权限与迁移；待页面操作验证。

## 下一步与发布限制
- 完成当前代码验证、创建 PR 并核对 CI。
- 生产仍为 0.2.1；新增迁移必须先人工执行并部署基线，普通 workflow 不执行迁移。
- 服务器已有用户，之前空库跳过备份仅针对 002，不延续为空库假设。
- 本地无 ECS 管理连接；不能提取 GitHub 密钥或绕过服务器迁移保护。
