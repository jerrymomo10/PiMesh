# 开发任务索引

任务记录随所在分支同步。接手前先按[协作流程](../collaboration.md)获取远端状态。

| 任务 | 分支 | PR | 交接文档 |
| --- | --- | --- | --- |
| 本地 meshpi 客户端与完整 Transcript 保存 | `feat/meshpi-launcher` | [#1](https://github.com/jerrymomo10/PiMesh/pull/1) | [meshpi-launcher](meshpi-launcher.md) |

| 默认存储目录与多端文档 | `codex/default-meshpi-home` | [#2](https://github.com/jerrymomo10/PiMesh/pull/2) | [default-meshpi-home](default-meshpi-home.md) |

| 团队服务与 PostgreSQL 测试部署 | `codex/team-service-bootstrap` | [#3](https://github.com/jerrymomo10/PiMesh/pull/3)（已关闭，纳入 #5） | [team-service-bootstrap](team-service-bootstrap.md) |

| 受保护的团队目录页面 | `codex/team-dashboard` | [#4](https://github.com/jerrymomo10/PiMesh/pull/4)（已关闭，纳入 #5） | [team-dashboard](team-dashboard.md) |

| 客户端与服务端目录分层 | `codex/app-layout` | [#5](https://github.com/jerrymomo10/PiMesh/pull/5)（统一合入 main） | [app-layout](app-layout.md) |

| README 品牌与项目首页 | `codex/readme-branding` | [#6](https://github.com/jerrymomo10/PiMesh/pull/6) | [readme-branding](readme-branding.md) |

| 服务端自动部署 | `codex/server-deploy` | [#7](https://github.com/jerrymomo10/PiMesh/pull/7) | [server-deploy](server-deploy.md) |

| 邀请码注册与账号登录 | `feat/invite-auth` | [#8](https://github.com/jerrymomo10/PiMesh/pull/8) | [invite-auth](invite-auth.md) |

| 注册密码最低 8 位 | `codex/password-minimum-eight` | 待创建 | [password-minimum-eight](password-minimum-eight.md) |

## 新任务模板

复制以下内容到 `<task-id>.md`，填写实际信息，并在上表添加入口。
状态取值：进行中、待交接、阻塞、已完成。时间包含时区，设备使用非敏感别名。

```markdown
# <task-id>

## 目标与验收条件
- 目标：
- 验收条件：

## 当前状态
- 状态：
- 工作分支：
- PR：
- 最近更新时间：
- 最近工作设备：
- 最近验证的代码提交：

## 已完成
- 内容及相关文件：

## 关键决定
- 决定、理由及长期决策链接：

## 验证
- 命令、结果、环境及对应版本：
- 未验证部分：

## 下一步
1. 具体操作：

## 风险与待确认
- 已知问题、失败尝试、待用户决定事项：

## 最近交接
- 本轮改动：
- 尚未完成：
- 本机未同步内容（如有）：
```
