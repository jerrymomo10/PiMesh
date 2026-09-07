# server-deploy

## 目标与状态
- 自动部署 ECS 团队服务，测试通过才发布；失败回滚应用，不自动迁移数据库。
- 分支：codex/server-deploy；状态：待交接，待 PR 合并。
- 基线：e057f0c；更新时间：2026-09-07 Asia/Shanghai。

## 已完成
- main 路径过滤与手动触发的工作流；PR 仅验证，部署使用 production Secrets。
- 专用账号与强制 SSH 命令、精确 sudo 重启权限、固定 known_hosts。
- 版本目录、原子切换、就绪检查、失败回滚与迁移变更拦截。
- ECS 已安装发布脚本和 systemd override；GitHub 三项环境 Secrets 已配置。

## 验证
- 当前提交代码：shell 语法检查、部署测试 5 项通过；服务端检查及 4 项离线测试通过。
- 实机通过专用 SSH 账号重新发布 e057f0c，数据库就绪检查通过。
- 实机首次发现 mktemp 权限过严，健康失败后成功恢复上一版；修复目录权限后重试成功。
- macOS 打包附加元数据被迁移比对拦截，关闭元数据后通过；正式 workflow 在 Ubuntu 打包。
- 默认沙箱禁止测试监听临时端口，提升权限后服务端测试通过。
- 真实数据库集成测试未执行；GitHub main 部署任务尚需合并后验证，不声称已经运行。

## 下一步与边界
- 合并 PR 后查看 Deploy team service 工作流结果。
- 证书轮换需更新部署 CA；数据库迁移、发布脚本升级及旧版本磁盘清理需管理员操作。
- 文档：docs/team-service.md。没有业务代码变化，数据库与查看密码保持原状。
