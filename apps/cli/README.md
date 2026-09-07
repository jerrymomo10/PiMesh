# meshpi 客户端

PiMesh 的本地 CLI，锁定 Pi Core 0.84.2，保存原生 Session 和完整 Transcript。
从仓库根目录安装：

```sh
npm ci --prefix apps/cli --ignore-scripts
npm install --global --install-links --ignore-scripts ./apps/cli
meshpi setup
meshpi doctor
```

默认状态目录 `~/.meshpi`，可用绝对路径 `MESHPI_HOME` 覆盖。
运行 `meshpi --help` 查看入口；在交互界面用 `/login` 配置模型供应商。
团队服务和目录查看页是单独部署的应用，不包含在客户端安装包中。
详见 [仓库说明](https://github.com/jerrymomo10/PiMesh#readme)。

## 团队登录与项目绑定（0.2.0）

运行 `meshpi team --help` 查看团队登录、设备管理、项目绑定命令。
完整安装、证书、登录、绑定与撤销步骤见 [同学使用指南](../../docs/team-client.md)。
团队登录独立于 Pi 模型 `/login`；凭据不进入项目仓库，不上传完整 Transcript。
