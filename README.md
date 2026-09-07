# PiMesh

**Local agents. Shared intelligence.**

PiMesh 面向算法团队：每位同学在自己的 Mac 上通过 **`meshpi`** 使用 Pi，
可以参与多个项目，同一个项目也可以由多人负责。目标是把项目进展、实验记录、
踩坑经验和公共工具沉淀为团队资产，让协作、全局管理和组周报更轻松。

## 当前版本：本地客户端 0.1

已实现：

- `meshpi` 启动锁定的 Pi Core 0.84.2，无需单独安装或启动 `pi`。
- `meshpi setup`、`meshpi paths`、`meshpi doctor`。
- 按本地工作目录隔离原生 Session，支持 `--continue`、`--resume`。
- 持久保存原生 Session 与追加式 Transcript 事件；不以摘要替换原始记录。
- 无真实模型、无 API 密钥的自动测试，以及打包安装测试。

尚未实现：团队服务、跨机器同步、成员身份、实验平台连接器、Memory 检索与分层、
管理看板及周报生成。**当前版本不会自动把 Transcript 上传给团队。**
已确定的产品方向与待定问题见 [设计边界](docs/decisions.md)。

## 安装

需要 macOS、Git、Node.js **22.19.0 或以上**及 npm。首次安装依赖需要联网。

```sh
git clone https://github.com/jerrymomo10/PiMesh.git
cd PiMesh
npm ci --ignore-scripts
npm run check
npm test
npm install --global --install-links --ignore-scripts .
meshpi setup
meshpi doctor
```

如果 npm 全局目录不可写，可安装到用户目录：

```sh
npm install --global --install-links --ignore-scripts --prefix "$HOME/.local" .
export PATH="$HOME/.local/bin:$PATH"
```

将上述 PATH 配置加入自己的 `~/.zshrc` 后，新终端也可使用 `meshpi`。
不需要 `sudo`。此包尚未发布到 npm registry，请从源码安装。
安装命令仅注册 `meshpi`；不会覆盖机器上已有的 `pi` 命令。
更新时在安全的工作区拉取新版本，重新执行 `npm ci`、检查、测试和安装命令。
如果使用功能分支，请先切换到对应分支；尚未合并的代码不会出现在 main 中。

## 使用

在实际研究项目目录中启动：

```sh
cd /path/to/research-project
meshpi
```

首次使用，在交互界面输入 `/login` 配置模型供应商，再用 `/model` 选择模型。
也可使用 Pi 支持的供应商环境变量。真实模型调用采用所选供应商的认证和计费。
meshpi 使用独立的 Agent 配置目录，不自动复制已有 Pi 的凭据。

```sh
meshpi --continue                 # 继续当前目录的最近会话
meshpi --resume                   # 选择历史会话
meshpi --print "分析当前项目结构"  # 非交互执行，同样保存 Transcript
meshpi paths                      # 查看当前目录的存储路径
meshpi --pi-help                  # Pi 原生参数说明（其中名称显示为 pi）
```

Pi 的 `--provider`、`--model`、`--extension` 等参数可继续使用。
`--no-session` 和 `--session-dir` 由 meshpi 禁用／管理，避免误关闭记录或打乱目录。
`meshpi` 复用 Pi 的本地工具执行能力，当前未实现 Research Pi 的额外项目沙箱。

## Transcript 保存

默认存储根目录为 `~/.local/state/meshpi/`，可通过绝对路径 `MESHPI_HOME` 改变。

```text
meshpi/
├── agent/                         配置、认证等本地状态
└── workspaces/<本地目录标识>/
    ├── sessions/                  Pi 原生 JSONL 会话，可继续／恢复
    └── transcripts/               追加式 JSONL 事件记录
```

保存内容包括用户消息、助手消息、Pi 暴露的流式增量、工具调用与返回结果，
以及会话、分支和压缩等事件与会话快照。不会主动缩短消息、删掉旧轮次或自动清理历史。
每条事件写入后同步落盘；不同运行实例使用独立文件，避免互相覆盖。
上下文压缩改变模型下一轮看到的内容，不删除此前已保存的 Transcript。

这里的“完整”指 **Pi 已交付给客户端的会话内容和事件**，不是终端录像或供应商网络抓包。
工具本身已截断的底层日志、模型未返回的内容、强杀前尚未交付的事件，无法凭空恢复。
流式事件保存增量，完整终态消息另行保存；不重复保存每个 token 对应的增长快照。
详细格式、故障边界和验证方式见 [Transcript 说明](docs/transcripts.md)。

Transcript 可能包含项目代码、工具输出及用户输入的敏感信息。原文不做破坏性脱敏；
存储目录默认仅当前用户访问，文件默认 `0600`，禁止提交到公开 Git 仓库。
当前提供本地持久保存，不提供远端备份或团队访问。共享前的权限和脱敏规则仍待设计。
默认关闭 Pi telemetry；可通过供应商配置执行正常模型请求。

## 开发与测试

实现采用 Node.js ESM 和 Pi extension，直接运行，无编译步骤。
`npm-shrinkwrap.json` 随安装包分发，锁定依赖树，确保源码安装和打包安装使用一致版本。

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run test:install
npm start -- --help
```

`npm test` 包含单元、真实 Pi 离线模型集成和临时目录安装测试。
安装测试优先使用 npm 本地缓存，缺失的包元数据仍需访问 npm registry；
模型集成测试完全离线，无需模型凭据，也不安装到个人全局目录。
测试使用合成数据，不调用公司服务、不提交真实训练任务。

代码变更使用功能分支，检查后及时提交并推送 GitHub；通过 PR 合并。
开始新任务前在安全的工作区更新 main：`git pull --ff-only`；继续已有任务则同步对应功能分支。
Agent 的具体协作约定见 [AGENTS.md](AGENTS.md)。
多台电脑独立使用 Codex 时，按[多机协作流程](docs/collaboration.md)同步代码和交接文档，
从[任务索引](docs/tasks/README.md)接手。这不会同步完整 Codex 对话或 meshpi Transcript。

## 参考与许可

- [Pi](https://github.com/earendil-works/pi)：本地 Agent 运行时。
- [Research Pi](https://github.com/RosMarinas/Research-Pi)：项目级研究状态、原生会话与实验记忆的设计参考。

PiMesh 原创代码的开源许可证尚未选定，当前包标记为 `UNLICENSED` 并禁止 registry 发布。
依赖保留各自许可证；本实现未复制 Research Pi 的源码。
