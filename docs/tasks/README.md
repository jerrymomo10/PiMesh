# 开发任务索引

任务记录随所在分支同步。接手前先按[协作流程](../collaboration.md)获取远端状态。

| 任务 | 分支 | PR | 交接文档 |
| --- | --- | --- | --- |
| 本地 meshpi 客户端与完整 Transcript 保存 | `feat/meshpi-launcher` | [#1](https://github.com/jerrymomo10/PiMesh/pull/1) | [meshpi-launcher](meshpi-launcher.md) |

| 默认存储目录与多端文档 | `codex/default-meshpi-home` | [#2](https://github.com/jerrymomo10/PiMesh/pull/2) | [default-meshpi-home](default-meshpi-home.md) |

| 团队服务与 PostgreSQL 测试部署 | `codex/team-service-bootstrap` | [#3](https://github.com/jerrymomo10/PiMesh/pull/3) | [team-service-bootstrap](team-service-bootstrap.md) |

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
