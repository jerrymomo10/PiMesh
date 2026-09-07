# 团队工作台与平台管理

服务端 0.3.0；CLI 0.2.0 支持团队登录与设备注册，不自动上传 Transcript。生产需先完成 003 与 004 迁移。

## 统一入口

| 地址 | 用途 | 凭据 |
| --- | --- | --- |
| `/` | 用户工作台：加入团队、查看成员和项目 | `/account` 登录后的 Cookie |
| `/account` | 注册、登录、账号信息、退出 | 用户名/邮箱与密码 |
| `/admin/teams` | 创建团队、指定负责人、分页查看团队 | 平台管理员 Basic 凭据 |
| `/admin/invites` | 生成平台注册邀请码 | 同上，沿用 INVITE_ADMIN_HASH |
| `/admin/directory` | 全站只读目录 | 独立 DIRECTORY_ACCESS_HASH 查看凭据 |

`/admin` 跳转团队管理，`/workspace` 跳转首页，`/directory` 跳转全站目录。
AUTH_ENABLED 关闭时首页保留旧目录，不开放团队 API。页面壳不含团队数据，API 每次验证会话与成员关系。
导航只是入口，不代表权限；用户无法用 Cookie 创建团队或查看全站数据。

## 使用流程与权限

1. 管理员在注册邀请页生成注册码，用户在账号页注册。
2. 管理员在团队管理页填写团队名和负责人准确用户名，创建团队。
3. 负责人以普通用户身份登录，从首页打开自己的团队，生成团队邀请码或创建项目。
4. 已注册用户在首页提交团队邀请码，成为该团队的普通成员。
5. 团队负责人可以移除普通成员，成员下一次请求即失去访问权限；已查看的数据无法从用户设备收回。

普通用户不能创建团队；平台管理员的 Basic 凭据不自动授予任何团队成员身份。
负责人不能直接移除负责人；平台管理员可更换负责人（原负责人变为成员）、改名与归档/恢复团队。负责人可改名与归档/恢复项目。不提供硬删除。
团队创建时指定的负责人记录为 teams.created_by，平台管理员代表该用户创建；负责人变更时同步更新该字段和项目 owner_id。
成员列表仅暴露用户 ID、用户名、显示名、角色和加入时间，不返回邮箱、密码或会话。
项目以团队内唯一 slug 标识，负责人为创建项目的团队负责人；本阶段只有项目目录，没有研究记录读写。

## 邀请与失败行为

- 注册码创建账号，团队码加入团队，两者不能互用。完整码都是 43 位；UUID 记录 ID 不是邀请码。
- 团队码每次生成一个，默认 7 天，允许 1–30 天；只保存摘要，完整码仅在生成响应中显示。
- 并发核销通过数据库事务与团队锁保证一个码只有一次成功；失败回滚成员关系和核销。
- 已在团队中的用户重复加入返回 409，不消耗邀请码。被移除者可通过新码重新加入。
- 团队名可以重名；项目 slug 在同团队唯一。创建团队请求超时后先刷新管理员列表确认结果，勿直接重复提交。
- 加入/移除/创建项目请求超时后先刷新状态；生成邀请码响应丢失时从最近 100 条邀请中撤销对应记录再重新生成。
- 负责人只能查看或撤销本团队邀请。过期、使用或撤销后不能加入；全站目录凭据不具备写入权限。
- 团队、成员与项目列表每页 25 条，返回 has_more；邀请列表最近 100 条。分页期间新写入可能改变顺序，刷新获取最新状态。

## API

| 方法与路径 | 权限/输入 |
| --- | --- |
| GET/POST `/api/v1/admin/teams` | 平台管理员；创建输入 name, owner（用户名） |
| GET `/api/v1/teams` | 当前用户所属团队，page 可选 |
| POST `/api/v1/teams` | 始终拒绝普通用户创建 |
| POST `/api/v1/teams/join` | 登录用户；code |
| GET `/api/v1/teams/:id` | 活跃成员，返回团队与自身 role |
| GET `/api/v1/teams/:id/members` | 活跃成员，page 可选 |
| POST `/api/v1/teams/:id/members/:userId/remove` | 负责人；空对象；不能移除负责人 |
| GET/POST `/api/v1/teams/:id/projects` | 查看需成员，创建需负责人；name, slug；GET 支持 page |
| GET/POST `/api/v1/teams/:id/invites` | 负责人；生成输入 days 可选 |
| POST `/api/v1/teams/:id/invites/:inviteId/revoke` | 负责人；空对象 |

所有 POST 要求 JSON、X-PiMesh-Request: 1，并校验 Origin / Sec-Fetch-Site，最多 8 KiB。
每 socket IP 的团队 API 15 分钟最多 120 次，单进程内存限流。400 输入错误，401 会话失效，
403 角色不允许，404 团队不存在或非成员，409 冲突，429 限流，503 服务暂不可用。

## 迁移与验证

运行 `npm run migrate --prefix apps/server` 执行 003-team-invites（新增表和索引，保留旧表与账号）。
004-device-sessions 新增设备会话与团队归档字段，启用认证时启动校验要求迁移到 004。
生产已有注册用户，不再假定空库；管理员备份后按部署流程人工迁移、验证并切换新基线。
自动发布仍拒绝 migrations 变化。代码 PR 验证通过不代表生产已经升级，不能只复制迁移清单绕过检查。
回退旧应用可保留 003 的表/索引；现有注册会话与管理员/目录凭据保持不变。

`npm run check --prefix apps/server`、`npm test --prefix apps/server` 运行离线测试。
真实 PostgreSQL 测试由 TEST_DATABASE_URL 启用，只允许 pimesh_test_ 前缀临时库，使用随机 schema 与合成数据。
覆盖管理员创建、失败回滚、跨团队拒绝、成员/负责人权限、并发核销、过期撤销、移除与重新加入、Cookie 撤销。

## 用户、设备与 CLI

用户管理 `/admin/users`；个人设备与密码 `/devices`。管理员可启停用户、重设密码、撤销设备。
CLI 登录 `/api/v1/cli/login` 验证用户名/邮箱与密码，注册设备并返回 30 天 Bearer 令牌，数据库仅保存摘要。
`/api/v1/cli/me` 检查身份，POST `/api/v1/cli/logout` 撤销本设备。团队 API 接受 Cookie 或设备 Bearer，权限相同。
GET `/api/v1/devices` 分页列自己的设备，POST `/api/v1/devices/:id/revoke` 撤销；不允许访问他人设备。
POST `/api/v1/account/password` 要求 current_password 与 password，修改后撤销全部会话。
管理员 GET `/api/v1/admin/users`，POST `/:id/status`（status 为 active/disabled）、`/:id/password`（password），
GET `/:id/devices`，POST `/:id/devices/:deviceId/revoke`。不返回密码摘要或设备令牌。
POST `/api/v1/admin/teams/:id` 修改 name、owner 或 archived；POST `/api/v1/teams/:id/projects/:projectId` 修改 name 或 archived。
使用及交付验收见 [同学使用指南](team-client.md)。
