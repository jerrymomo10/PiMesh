# invite-auth

## 目标与状态
- 目标：统一邀请码注册（不验证邮箱）、用户名/邮箱密码登录、查看自身账号、退出；管理员生成和撤销邀请码。
- 分支：`feat/invite-auth`；基线：`f8f3766`；状态：阻塞（实现完成，待生产迁移权限）。
- 用户已授权测试通过后合并 main 并发布；不把数据库迁移保护绕过当成部署成功。
- 最近更新时间：2026-09-08 Asia/Shanghai；设备：本地 macOS。

## 实现范围
- 新用户 UUID，用户名与邮箱分别忽略大小写唯一。保留旧用户 ID 和外键；旧目录用户不自动取得登录凭据。
- 单次邀请码，批量生成、有效期、撤销、事务核销。只保存随机令牌摘要。
- 密码 scrypt，安全 Cookie 会话、退出撤销、CSRF、请求大小与速率/并发上限。
- `/account` 用户页；`/admin/invites` 独立管理员 Basic 认证，不复用只读目录账号。
- 合成数据库测试与 CI PostgreSQL 15 服务，不向生产写入测试用户。

## 发布前提与阻塞
- 需要备份并人工执行 `002-invite-auth`，设置 `AUTH_ENABLED`、`PUBLIC_ORIGIN`、`INVITE_ADMIN_HASH`。
- 现有 ECS 发布脚本拒绝 migrations 变化。需管理员迁移、验证兼容性并部署新基线后才能恢复普通自动发布。
- 本机未获得 ECS 管理 SSH 连接资料；已向维护者询问。不读取 GitHub 私钥，不通过应用发布绕过迁移保护。
- PR：[#8](https://github.com/jerrymomo10/PiMesh/pull/8)，草稿，待完成生产迁移准备再合并。

## 本机验证
- macOS / Node 25.8.1：`npm run check`、`npm test`、部署 Python 回归及 `git diff --check` 通过。
- 客户端 9 项，服务端离线 8 项，部署回归 5 项；本机无 PostgreSQL，两个数据库集成测试跳过。
- 服务端包和锁文件升级 0.2.0；CLI 无变更，不跟随升级。存活检查及响应头暴露实际服务版本。
- `4a54cf9` 的 GitHub PostgreSQL 15 job 已通过，覆盖真实事务、并发核销、唯一性、旧外键兼容、过期/禁用/撤销会话及 HTTP 权限。
- 本机 Chrome 已检查账号页布局和未登录状态；浏览器完整注册流程未连接真实数据库，不能替代 HTTP+PostgreSQL 集成测试。
- PR #8 的 PostgreSQL/发布 verify 及四组 macOS/Linux Node 22.19/24 检查均通过。
- 后续小修：HTML pattern 兼容浏览器 Unicode v 模式，新增静态契约回归；更新 PR 交接入口。

## 下一步
1. 获得 ECS 管理连接或由另一台电脑按 `docs/auth.md` 备份、迁移、配置及部署新基线。
2. 最终核对 PR CI，通过后转为 ready，合入 main，跟进自动发布与线上 0.2.0 账号入口验证。
3. 不把草稿 PR 已同步等同于功能已上线；当前生产仍为旧服务端版本。

## 边界
- 不验证邮箱、不提供自动找回密码；邀请码不授予团队成员或管理员权限。
- 不实现团队写入、CLI 账号连接、共享 Memory 或 Transcript 上传。
- 单实例内存限流不是分布式防护；公开规模化服务还需边缘防护与运维备份。
