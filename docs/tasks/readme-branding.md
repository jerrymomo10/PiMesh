# readme-branding

## 目标与验收
- 将 README 整理为清晰的项目首页，补充原创项目图标、品牌横幅、架构和流程图。
- 保留安装操作与实际边界，不把规划能力写成已实现。

## 状态
- 状态：待交接（完成并验证，待 PR 合并）
- 分支：codex/readme-branding
- 基线：f6a1d0c（PR #5 已合并）
- PR：[#6](https://github.com/jerrymomo10/PiMesh/pull/6)
- 更新时间：2026-09-07，Asia/Shanghai

## 已完成
- docs/assets 下原创 SVG 标识、横幅与架构图；延续已有深绿视觉风格。
- README 增加 CI 与环境徽章、导航、三栏介绍、架构、流程、路线图及文档导航。
- 详细安装、升级、存储与使用说明移至 docs/getting-started.md。
- 保留许可证未定、Windows 未验证、团队登录及同步尚未实现的边界。

## 验证
- SVG XML 解析与本地引用路径通过，git diff --check 通过。
- 无可执行逻辑改变，不重复运行模型与安装测试。
- GitHub 分支页已检查横幅、徽章、三栏介绍、架构图、导航锚点与 Mermaid 渲染。
- 验证内容提交：5f73aca，此后仅更新交接文档。

## 下一步
- 合并 #6 后，默认 main 首页显示新版。
- 仅修改仓库内品牌素材，不修改个人 GitHub 头像。
