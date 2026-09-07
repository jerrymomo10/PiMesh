# 同学首次使用 PiMesh

适用于服务端 0.3.0、CLI 0.2.0。需要维护者先完成服务端迁移和上线；旧服务端没有 CLI 设备登录接口。
本版可管理账号、团队、成员、设备和项目，CLI 可登录并绑定本地研究目录；不会上传代码、文件或完整对话。

## 管理员先准备

1. `/admin/invites` 生成注册邀请码，分别交给同学。复制标为“注册邀请码”的完整 43 位内容，不是记录 ID。
2. 同学在 `/account` 注册后，管理员在 `/admin/teams` 创建团队并指定负责人的用户名。
3. 负责人登录首页 `/`，打开团队、创建项目，并生成团队邀请码给其他已注册成员。
4. 同学在首页加入团队。管理员可在 `/admin/users` 启停账号、重设密码、撤销设备。

团队负责人可移除成员、创建/改名/归档项目；平台管理员可更名/归档团队和更换负责人。
团队和项目归档后不接受 CLI 绑定验证；恢复后成员可重新访问。更换负责人会撤销未使用的团队邀请。
不执行硬删除，保留成员与项目记录。原负责人变成普通成员。

## 安装 CLI

macOS / Linux：安装 Git、Node.js ≥22.19.0、npm。Windows 原生未验证，先用 WSL。

```sh
git clone https://github.com/jerrymomo10/PiMesh.git
cd PiMesh
npm ci --prefix apps/cli --ignore-scripts
npm install --global --install-links --ignore-scripts ./apps/cli
meshpi --version
meshpi setup
meshpi doctor
```

以上安装 main 分支；使用前确认维护者已将 0.2.0 合入 main。更新已有克隆先保留本地改动，
在无分叉时 `git pull --ff-only`，再重复安装命令。安装包尚未发布到 npm registry。

## 登录并注册设备

```sh
meshpi team login --server https://your-server.example --user your_username
meshpi team whoami
meshpi team teams
```

密码在终端隐藏输入，不放进命令参数或环境变量。`--name "Research laptop"` 可指定设备显示名。
若服务器使用自签名证书，向维护者获取并核对可信 CA 文件，增加 `--ca /absolute/path/server-ca.crt`。
不提供 `--insecure`，不关闭 TLS 校验。证书到期或地址不匹配时应由维护者修复证书。
正式给同学使用前，维护者应检查当前证书有效期；短期测试证书不可当成长久可用的保证。

设备登录有效期 30 天，到期重新登录。同一服务器和账号默认续用本地设备并轮换令牌；
网页撤销后使用 `login --new-device` 注册替代设备。每账号最多 20 台未撤销设备。
自动化可用 `--password-stdin` 从受限输入管道读取密码；不将真实密码写入脚本、仓库或 shell history。

## 绑定本地研究目录

```sh
meshpi team teams
meshpi team projects --team TEAM_UUID
cd /path/to/research-project
meshpi team bind --team TEAM_UUID --project PROJECT_UUID
meshpi team status
meshpi
```

TEAM_UUID 和 PROJECT_UUID 从列表取得。缺少团队时，可在网页加入或执行 `meshpi team join` 输入团队邀请码。
列表有 `has_more: true` 时用 `--page 2` 继续查询。

团队登录与 Pi 内的 `/login` 不同：后者配置模型供应商。开始研究前在 Pi 使用 `/login`、`/model`，
模型使用所选供应商凭据及计费。`meshpi --continue` 仍继续当前目录本地会话。

绑定保存在 `~/.meshpi/workspaces/<本地目录标识>/team-project.json`，不会在项目仓库内生成凭据。
当前目录已绑定其他项目/账号时拒绝覆盖；先 `meshpi team unbind` 再重新绑定。
绑定验证会检查当前设备、用户、成员关系、团队和项目状态；网络失败或权限变更时明确失败，不默认为成功。
启动研究保持离线可用，本地 Transcript 元数据记录绑定及其最后验证时间；不自动声明绑定仍有在线权限。

## 退出与设备管理

```sh
meshpi team devices
meshpi team revoke --device DEVICE_UUID
meshpi team logout
```

网页 `/devices` 可查看和撤销自己的设备，也可修改账号密码。管理员在 `/admin/users` 管理用户设备。
账号停用或密码重设会撤销全部网页/设备会话；启用账号后需重新登录。
退出默认先撤销远端设备，再删除本地凭据。断网时保留凭据，便于重试；确需只清本地时使用
`meshpi team logout --local-only`，远端会话仍有效，需之后在网页撤销。退出不删除本地对话或项目绑定。

凭据保存在 `~/.meshpi/team/credentials.json`，0600，含设备令牌，不保存密码；目录默认 0700。
CA 副本随该文件保存，换服务器不会向新地址发送旧令牌。MESHPI_HOME 可覆盖根目录。
并行 team 命令通过本地锁拒绝冲突；进程异常退出后确认无命令运行，再移除提示中的空 `.lock` 目录。

## 首次验收

- 管理员创建团队，负责人和普通成员分别登录；普通成员无法创建团队/项目或访问其他团队。
- 两台电脑分别登录，显示不同设备；绑定同一团队项目后各自开始本地研究。
- 从网页撤销其中一台设备，该机 `meshpi team whoami` 失败，另一台仍可使用。
- 成员被移除或项目归档后 `meshpi team status` 失败；原本地 Transcript 仍保留。
- 退出、重新登录、账号停用和密码修改后会话撤销符合预期。

网页与 CLI 均没有共享研究记录/Memory/Transcript 上传功能，不把项目目录当作已实现研究协作。
