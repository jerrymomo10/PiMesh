# 邀请注册与账号登录

本功能通过显式配置启用。无需邮件服务，不发送邮箱验证邮件。
邀请注册仅授予平台账号，不自动加入团队，不上传本地 Transcript。

## 使用入口

- `/account`：注册、用户名或邮箱加密码登录、查看自己的账号和退出。
- `/admin/invites`：平台管理员生成邀请码、查看最近 100 条状态并撤销未使用的邀请码。
- 管理员使用独立的 `INVITE_ADMIN_HASH` Basic 凭据；与只读目录账号、普通用户账号相互独立。
- 每码单次使用，默认 7 天有效；每批 1–50 个，有效期 1–30 天。
- 完整邀请码仅在生成响应中显示，丢失后撤销并重新生成，数据库没有明文副本。

首页 `/` 的浏览器登录弹窗使用独立目录查看账号；平台注册账号和邀请码管理员账号不能用于该弹窗。

## 身份与安全

- 新注册 `user_id` 是 UUID 字符串，数据库继续使用 text 以兼容旧目录 ID 和外键；不强制重写历史记录。
- 用户名：3–32 个 ASCII 字符，字母开头，后续字母/数字/下划线/短横线，统一小写。
- 邮箱：去首尾空格、小写，独立唯一，`email_verified=false`；不声称用户拥有该邮箱。
- 不验证邮箱可能导致他人抢占邮箱。当前不支持邮箱密码找回，不可用未验证邮箱自动恢复账号。
- 密码：8–128 个 UTF-16 代码单元，不 trim、不静默截断；使用 Node 内置 scrypt，N=32768/r=8/p=3、随机 16 字节盐、32 字节结果。
  参数参考 [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)，API 见 [Node crypto](https://nodejs.org/docs/latest-v22.x/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback)。
- 会话：32 字节随机令牌，数据库仅存 SHA-256 摘要，固定 7 天有效；Cookie 为 `__Host-`、Secure、HttpOnly、SameSite=Strict、Path=/。
- 退出在数据库撤销当前令牌；禁用用户后会话立即不可用。登录时清理过期会话。
- 写请求需要 JSON 和 `X-PiMesh-Request: 1`；浏览器 Origin 必须等于 `PUBLIC_ORIGIN`，不启用跨域访问。
- 请求最多 8 KiB。单实例以 socket IP 限流，不信任 X-Forwarded-For；15 分钟窗口登录 30 次/IP、15 次/登录标识、注册 10 次/IP；总认证访问 120 次/IP。
- scrypt 同时最多两项，超限返回 429；限流最多 10000 个键，满时拒绝新键，进程重启重置。
- 本版不提供团队权限接口；普通账号不能访问全站目录或管理员邀请码接口。

## API

| 方法/路径 | 输入或用途 |
| --- | --- |
| POST `/api/v1/auth/register` | `username,email,password,invite`；201 返回 user，不自动登录 |
| POST `/api/v1/auth/login` | `login,password`；login 是用户名或邮箱；200 设置 Cookie |
| GET `/api/v1/auth/me` | 当前用户安全字段；未登录或会话失效 401 |
| POST `/api/v1/auth/logout` | `{}`，撤销当前会话并清 Cookie |
| POST `/api/v1/admin/invites` | 管理员 Basic；`count,days` 可省略；201 返回邀请码，仅显示一次 |
| GET `/api/v1/admin/invites` | 管理员 Basic；最近 100 条，不返回明文/摘要 |
| POST `/api/v1/admin/invites/:id/revoke` | 管理员 Basic；`{}`；已使用/已撤销/不存在返回 404 |

400 输入错误或邀请码失效；409 用户名或邮箱不可用；429 限流；503 临时故障。
唯一性冲突会回滚邀请码核销，用户可修改信息后重试。并发使用同一码只允许一次成功。
注册响应丢失时可能已创建账号，应先尝试登录；邀请码生成响应丢失时通过管理列表撤销该批次再生成。

## 启用与迁移

生产必须直接提供 HTTPS，本版不隐式信任反向代理。添加受限环境配置：

```dotenv
AUTH_ENABLED=true
PUBLIC_ORIGIN=https://your-domain.example
INVITE_ADMIN_HASH=<SHA-256 of administrator-username:strong-random-password>
```

`PUBLIC_ORIGIN` 包含非标准端口时必须写出端口，末尾不能有 `/`。
管理员凭据不自动生成默认值、不提交到 Git；妥善保存到凭据管理器。
只读目录原 `DIRECTORY_ACCESS_HASH` 不自动升级为管理员。

人工发布检查表：

1. 管理员备份生产 PostgreSQL，并在临时库验证可恢复。
2. 在测试库执行新迁移并验证旧目录外键仍有效、大小写邮箱无冲突。
3. 向新版本命令注入数据库连接后执行 `npm run migrate --prefix apps/server`。
   迁移逐文件事务化，可重复执行；大小写重复邮箱导致唯一索引创建失败，整份 002 回滚，需人工解决冲突，不删除账户。
4. 添加上述配置，在管理员控制的流程下部署新版本及 migrations 作为发布基线，检查账号入口、旧目录和健康检查。
5. 之后普通应用变更通过现有工作流自动发布。迁移变更仍会被发布脚本拦截，不自动修改数据库。

002 是向后兼容扩展，不重写旧 ID；回滚旧应用时保留新增列/表。
旧目录记录没有用户名或密码，不自动允许登录。临时证书轮换、域名和管理员凭据交接仍需部署负责人维护。

## 验证与合成数据

`npm run check --prefix apps/server`、`npm test --prefix apps/server` 运行无凭据测试。
提供 `TEST_DATABASE_URL` 后运行真实 PostgreSQL 测试；强制数据库名以 `pimesh_test_` 开头。
`auth-postgres.test.mjs` 在随机 schema 中创建合成用户/邀请码/会话，结束删除该 schema。
旧目录集成测试会在测试库 public schema 留下合成记录，请每次使用空临时数据库。
GitHub `auth-postgres` job 自动创建 PostgreSQL 15 临时服务并运行完整服务端测试。
测试密码和邮箱均为合成数据，不能复用于生产。
