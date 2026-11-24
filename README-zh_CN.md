<div align="center">
  <h1>ReleaseBits</h1>
  <p>可复用的 GitHub Actions，用于 Apple 应用的发布流程。</p>
  <p>简体中文&nbsp;&nbsp;|&nbsp;&nbsp;<a href="README.md">English</a></p>
</div>

## 功能

| Action | 用途 | Workflow 引用 |
| --- | --- | --- |
| [changelog](docs/changelog.md) | 从 `feat` 和 `fix` 提交生成中英双语发布说明，写入 `changelogs.json` 并创建草稿 PR。重复运行时复用已有 PR 或草稿，保留人工修改。 | `uses: openchic/release-bits/actions/changelog@v1` |
| [changelog-cleanup](docs/changelog-cleanup.md) | PR 关闭后清理已不再使用的 `changelogs/` 分支。 | `uses: openchic/release-bits/actions/changelog-cleanup@v1` |
| [build-macos](docs/build-macos.md) | 构建 Universal、Intel 或 Apple Silicon 的已签名和公证 DMG。可直接指定版本，也可从 Xcode 工程版本递增。 | `uses: openchic/release-bits/actions/build-macos@v1` |
| [changelog-release](docs/changelog-release.md) | 读取 catalog 中指定版本的英文说明，发布 GitHub Release，并可上传附件。 | `uses: openchic/release-bits/actions/changelog-release@v1` |

## 快速接入

将对应示例复制到项目的 `.github/workflows/`，也可以把表中的 `uses` 加到现有 job 的 `steps`，再按 Action 文档配置输入和权限。示例使用 `@v1`。请选择已发布且包含所需 Action 的 tag，也可以用 `@<action>-vX.Y.Z` 固定到具体版本。

- **生成发布说明并清理分支。** 在项目仓库配置 `LLM_API_KEY` 密钥，并允许 GitHub Actions 创建 PR。复制[发布说明 workflow](examples/release-notes.yml)。示例的 PR 目标分支为 `main`。更换目标分支时，同时修改 `base-branch` 和 `pull_request.branches`。手动运行 **Prepare release notes**，填写基础版本，按需选择递增类型。PR 关闭时自动执行清理。
- **打包 macOS App。** 配置 [Apple 签名与公证凭据](docs/macos-signing.md)，复制 [macOS 构建 workflow](examples/build-macos.yml)，再按项目调整 Xcode 配置。运行 **Build macOS** 后，从 workflow 产物中下载 DMG。
- **发布 GitHub Release。** 复制[独立发布 workflow](examples/changelog-release.yml)，选择包含 `changelogs.json` 的分支，填写要发布的版本。需要上传构建产物时，设置 `files`。合并 PR 后自动发布的配置见[合并 PR 后发布示例](docs/changelog-release.md#合并-pr-后发布)。

组合使用时，给 `build-macos` 和 `changelog-release` 传入同一个最终版本。若版本已经由 `changelog` 算出，将它传给 `build-macos` 的 `version`，省略 `version-type`。

## 开发与维护

仓库结构、开发命令和协作约定见 [AGENTS.md](AGENTS.md)。

## License

ReleaseBits 采用 [Apache License 2.0](LICENSE)。
