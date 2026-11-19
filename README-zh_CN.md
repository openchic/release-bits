<div align="center">
  <h1>shipkit</h1>
  <p>可复用的 GitHub Actions，用于 Apple 应用的发布流程。</p>
  <p>简体中文&nbsp;&nbsp;|&nbsp;&nbsp;<a href="README.md">English</a></p>
</div>

shipkit 当前提供 `changelog`：把 `feat` 和 `fix` 提交整理成中英双语发布说明草稿，写入 `changelogs.json`，并创建或复用 draft PR。

## 功能

- 从上一个 tag 之后的提交生成中英双语说明。
- 在 `changelogs/v{version}` 分支上创建或复用 draft PR；合并 PR 即确认说明。
- 重复运行幂等：已有 PR、分支或草稿直接复用，不覆盖人工修改，也不重复调用 Gemini。
- catalog 不写审核标志；草稿状态由分支和 PR 生命周期表达。
- 清理、tag、GitHub Release、appcast 和打包仍留在 App 仓库。

## 使用

在仓库中配置 `SHIPKIT_GEMINI_API_KEY` secret，然后添加：

```yaml
name: Prepare release notes

on:
  workflow_dispatch:
    inputs:
      version:
        required: true
      version_type:
        type: choice
        options: [none, major, minor, patch]
        default: none

permissions:
  contents: write
  pull-requests: write

jobs:
  notes:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: openchic/shipkit/actions/changelog@v1
        with:
          version: ${{ inputs.version }}
          version-type: ${{ inputs.version_type == 'none' && '' || inputs.version_type }}
        env:
          GH_TOKEN: ${{ github.token }}
          SHIPKIT_GEMINI_API_KEY: ${{ secrets.SHIPKIT_GEMINI_API_KEY }}
```

`version` 必填；出现 `version-type` 时从它递增，例如 `1.2.3` + `minor` → `1.3.0`。action 会自动补拉缺失的历史和 tag；仓库需要 checkout 在 workspace 根目录。

完整 workflow（含 PR 关闭后的分支清理）见 [examples/release-notes.yml](examples/release-notes.yml)。

## 本地预览

```bash
export GEMINI_API_KEY=...

./bin/shipkit changelog \
  --version 1.2.3 \
  --version-type minor
```

只生成预览文件，不写 catalog、不开 PR。

## 文档

- [action 契约](docs/changelog.md)：输入、输出、复用与漂移规则、失败矩阵。
- [接入示例](examples/release-notes.yml)。
- [CI 检查](.github/workflows/test.yml)。

## 开发

```bash
PYTHONPATH=src python3 -m unittest discover -s tests -v
PYTHONPATH=src python3 -m compileall -q src tests
```

## 发布

维护者在 `main` 上手动运行 **Release** workflow 并输入版本号。它会跑测试、创建版本 tag `vX.Y.Z`、移动 `vX` 大版本 tag，并创建 GitHub Release。

调用方可以用 `@v1` 跟随最新 v1.x，固定 `@v1.y.z`，或固定到 commit SHA。请给 `v*` 开 tag 保护，限制谁能移动 `v1`。如果 tag 规则拦截 workflow token，允许 GitHub Actions 或改用具备 `contents: write` 的 token。见 [.github/workflows/release.yml](.github/workflows/release.yml)。

## License

shipkit 采用 [Apache License 2.0](LICENSE)。
