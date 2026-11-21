<div align="center">
  <h1>ReleaseBits</h1>
  <p>可复用的 GitHub Actions，用于 Apple 应用的发布流程。</p>
  <p>简体中文&nbsp;&nbsp;|&nbsp;&nbsp;<a href="README.md">English</a></p>
</div>

## 功能

- 从 `feat` 和 `fix` 提交**生成中英双语发布说明**。
- 将说明写入 `changelogs.json`，**创建草稿 PR 供审核**。
- 重复运行时**复用已有 PR 或草稿**，保留人工修改。
- 构建、签名并公证 Universal、Intel 或 Apple Silicon 的 DMG。[build-macos Action](docs/build-macos.md)

## 接入 · changelog

1. 在 App 仓库允许 GitHub Actions 创建 PR，并配置 `LLM_API_KEY` 仓库密钥。
2. 将示例复制到 App 仓库的 `.github/workflows/`，按需调整目标分支，并确认 `uses` 引用的 Action tag 已发布。[release-notes workflow 示例](examples/release-notes.yml)
3. 在 GitHub Actions 中手动运行 **Prepare release notes**，填写基础版本，按需选择递增类型。

输入与输出、草稿处理、分支清理和合并后的 App 发布流程见 [changelog Action 文档](docs/changelog.md)。

## Agent 接入提示词

```text
请将 ReleaseBits（openchic/release-bits）的 changelog Action 接入当前 App 仓库。
参考该仓库的 docs/changelog.md 和 examples/release-notes.yml，确认已发布的 Action tag。
结合现有 workflow 和版本来源，按示例配置手动触发、权限、密钥引用和 PR 关闭清理。
沿用 App 现有的构建与发布流程。
验证修改后的 YAML，并说明如何配置 LLM_API_KEY 和运行工作流。
```

## 开发与维护

仓库结构、开发命令和协作约定见 [AGENTS.md](AGENTS.md)。

## License

ReleaseBits 采用 [Apache License 2.0](LICENSE)。
