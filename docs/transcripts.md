# Transcript 0.1

## 保存契约

完整保留 Pi 向 meshpi extension 暴露的用户／助手消息、工具事件、流式增量和
关键 Session 状态。JSONL 不做摘要替换、长度截断或自动过期删除。
这是本地记录机制，不是团队 Memory 的最终数据模型。

每行含 `schemaVersion`、`activationId`、`sequence`、`recordedAt` 和 `event`；
会话建立后补充 `sessionId`、`sessionFile`、`workspace`。
`activationId + sequence` 在当前文件内标识事件。每次 extension 激活用独立文件，
同一 Session 的续接可能对应多个 Transcript 文件，可按 `sessionId` 关联。

- `transcript_open`：记录本地工作目录、进程和本地 workspace ID。
- `message_start/end`：保留消息对象，包括工具参数、结果、用量和供应商提供的内容块。
- `message_update`：保留 `assistantMessageEvent` 增量；去掉冗余的 `partial` 累积快照。
- `tool_execution_*`：保留执行开始、进度和终态，含错误信息。
- `input`、`user_bash` 等：记录 Pi 提供的输入事件。
- `session_snapshot`：保留原生 Session header 和全部 entries，包括分支与压缩节点。

快照在启动、压缩、树导航、Agent settled、会话命名及正常关闭时保存。
原生 Session 同时由 Pi 自己管理；不要手动把 Transcript 文件当作 Pi Session 恢复。
使用 `meshpi --continue` 或 `meshpi --resume` 恢复原生 Session。

## 耐久性与限制

事件采用独立单写者、追加写入，每行写完调用 `fsync`。记录失败会停止当前 Pi
进程并报告错误，避免磁盘满或目录不可写时悄悄继续而漏记。
流式每条同步落盘偏向耐久性，真实长会话的磁盘占用与性能仍需测量。

强杀不会触发关闭回调；已完成的落盘行仍保留，最后一行如果被打断可能不完整。
未来读取器应明确报告尾行损坏，不能静默当作完整记录。
供应商未交付的 token、工具内部未上报的原始输出、进程未收到的事件均不在保证范围内。
Pi 工具可能对大结果截断；本版本记录其实际返回值，不自动复制临时原始输出文件。

没有启用供应商 HTTP header/body trace，也不主动抓取凭据。
用户或工具输出中出现的敏感内容会随原文保存，所以本地记录不是可直接公开分享的材料。
文件权限防止其他普通本地账户读取，不提供加密，也不防御当前用户权限的进程或管理员。

扩展加载由锁定版本的 Pi 执行。请保持安装完整，可信扩展或本机用户仍可修改／删除文件；
本机制不是不可篡改的审计系统。不要把会改变消息的第三方扩展视为透明组件。

## 测试

- 大文本、中文、图片内容块不被本记录层截断。
- 独立写入者、落盘前可读、权限、关闭和不可写路径。
- 模拟 Session 切换、分支和压缩，确认旧内容仍保留。
- 使用真实 Pi CLI 和离线模型 fixture 执行 read 工具，再继续同一个原生 Session。
- npm 打包、临时前缀安装，以及安装后的真实 Pi 工具回合。

这些测试不调用真实模型供应商；安装阶段可能访问 npm registry。
不代表已验证公司训练平台、团队同步或长期生产负载。
