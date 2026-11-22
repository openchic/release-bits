<div align="center">
  <h1>ReleaseBits</h1>
  <p>可复用的 GitHub Actions，用于 Apple 应用的发布流程。</p>
  <p>简体中文&nbsp;&nbsp;|&nbsp;&nbsp;<a href="README.md">English</a></p>
</div>

## 功能

| Action | 用途 |
| --- | --- |
| `changelog` | 从 `feat` 和 `fix` 提交生成中英双语发布说明，写入 `changelogs.json` 并创建草稿 PR。重复运行时复用已有 PR 或草稿，保留人工修改。 |
| `build-macos` | 从 Xcode 工程构建 App，生成签名和公证后的 DMG。可选择 Universal、Intel、Apple Silicon 中的一种或多种。打包版本可直接指定，也可读取工程版本后递增得出。 |

## 生成发布说明

1. 在 App 仓库允许 GitHub Actions 创建 PR，并配置 `LLM_API_KEY` 仓库密钥。
2. 使用[发布说明工作流示例](examples/release-notes.yml)，按需调整目标分支。
3. 手动运行 **Prepare release notes**，填写基础版本，按需选择递增类型。

## 打包 macOS App

1. 配置 [Apple 签名与公证凭据](docs/macos-signing.md)。
2. 使用 [macOS 构建工作流示例](examples/build-macos.yml)，按项目调整 Xcode 配置。
3. 手动运行 **Build macOS**，从工作流产物中下载 DMG。

组合使用时，把 `changelog` 算出的最终版本传给 `build-macos` 的 `version`，省略 `version-type`。

## 开发与维护

仓库结构、开发命令和协作约定见 [AGENTS.md](AGENTS.md)。

## License

ReleaseBits 采用 [Apache License 2.0](LICENSE)。
