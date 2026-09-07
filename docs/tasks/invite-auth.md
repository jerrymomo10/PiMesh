# invite-auth

## 目标与状态
- 目标：统一邀请码注册（不验证邮箱）、用户名/邮箱密码登录、查看自身账号、退出；管理员生成和撤销邀请码。
- 分支：`feat/invite-auth`；基线：`f8f3766`；状态：进行中（人工迁移及部署完成，待合并与自动发布核验）。
- 用户已授权测试通过后合并 main 并发布；不把数据库迁移保护绕过当成部署成功。
- 最近更新时间：2026-09-08 Asia/Shanghai；设备：本地 macOS。

## 实现范围
- 新用户 UUID，用户名与邮箱分别忽略大小写唯一。保留旧用户 ID 和外键；旧目录用户不自动取得登录凭据。
- 单次邀请码，批量生成、有效期、撤销、事务核销。只保存随机令牌摘要。
- 密码 scrypt，安全 Cookie 会话、退出撤销、CSRF、请求大小与速率/并发上限。
- `/account` 用户页；`/admin/invites` 独立管理员 Basic 认证，不复用只读目录账号。
- 合成数据库测试与 CI PostgreSQL 15 服务，不向生产写入测试用户。

## 生产迁移与发布
- 维护者确认生产为空库，明确要求本次跳过备份；不改变其他生产迁移默认备份要求。
- 维护者通过 ECS 管理终端执行 `002-invite-auth`，提供的输出为 `Server schema ready`、`status=0`。
- 已配置 `AUTH_ENABLED`、`PUBLIC_ORIGIN`、`INVITE_ADMIN_HASH`，管理员凭据仅保存在服务器及维护者处。
- 人工部署基线：`496126775cf69ebdbde7a9dd93b5dd3e0262bcb4`。维护者提供的输出显示新版本切换后健康检查返回 `{"status":"ready"}`；首次连接失败后重试成功。
- GitHub 下载曾超时，改用 codeload 成功；ECS npm 下载出现 ECONNRESET。核对新旧锁文件仅应用版本变化，并在服务器比较去除应用版本后的完整锁文件一致后复用旧版 node_modules；服务器 check 与 npm ls 通过，pg 为 8.16.3。
- 保留服务器迁移保护，未提取 GitHub 私钥。现在具备合并并由现有 workflow 发布的基线。
- PR：[#8](https://github.com/jerrymomo10/PiMesh/pull/8)。最终合并与自动发布状态以 GitHub 记录为准。

## 本机验证
- macOS / Node 25.8.1：`npm run check`、`npm test`、部署 Python 回归及 `git diff --check` 通过。
- 客户端 9 项，服务端离线 8 项，部署回归 5 项；本机无 PostgreSQL，两个数据库集成测试跳过。
- 服务端包和锁文件升级 0.2.0；CLI 无变更，不跟随升级。存活检查及响应头暴露实际服务版本。
- 最终验证代码：`b074bfda820f24663402e558072570e4ca36346d`。本机服务端检查、8 项离线测试及 diff 检查通过；此后本次换机提交仅补充文档。
- 该版本的 GitHub PostgreSQL 15 job 已通过，覆盖真实事务、并发核销、唯一性、旧外键兼容、过期/禁用/撤销会话及 HTTP 权限。
- 本机 Chrome 已检查账号页布局和未登录状态；浏览器完整注册流程未连接真实数据库，不能替代 HTTP+PostgreSQL 集成测试。
- 已重新查询 GitHub：该版本 PR #8 的 PostgreSQL/发布 verify 及四组 macOS/Linux Node 22.19/24 检查均通过；deploy 因功能分支而跳过，不代表已发布。
- 后续小修：HTML pattern 兼容浏览器 Unicode v 模式，新增静态契约回归；更新 PR 交接入口。

## 下一步
1. 最终核对 PR CI，通过后转为 ready，合入 main，跟进自动发布。
2. 维护者通过 `/admin/invites` 生成邀请码，再通过 `/account` 验证注册、登录及退出；生产浏览器完整流程尚未验证，ready 仅证明数据库就绪。

## 边界
- 不验证邮箱、不提供自动找回密码；邀请码不授予团队成员或管理员权限。
- 不实现团队写入、CLI 账号连接、共享 Memory 或 Transcript 上传。
- 单实例内存限流不是分布式防护；公开规模化服务还需边缘防护与运维备份。

## 换机交接（2026-09-08 Asia/Shanghai）
- 接手分支是 `feat/invite-auth`；人工部署 0.2.0 已由维护者终端输出确认，合并及后续自动发布需核对 GitHub。
- 先 fetch、核对工作区并安全切换任务分支，再阅读 AGENTS.md、本文件、docs/auth.md 和 docs/team-service.md。
- 用户明确要求适时升级应用包版本；约定已写入 AGENTS.md。服务端当前 0.2.0，CLI 当前 0.1.0，本功能不含 CLI 团队登录。
- 本机预览服务已关闭；没有未提交的功能代码。依赖、个人配置、原始对话及凭据不随 Git 同步。
- 工程代码、测试、版本约定及产品决定均在仓库文档中；不要假定另一台电脑能读取本次完整聊天。
- 交接文档提交的实际 SHA 和推送核对结果由最终回复提供；不在提交前声称已同步。
