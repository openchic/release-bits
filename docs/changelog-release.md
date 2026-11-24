# changelog-release Action

## 目标

为多个项目复用 GitHub Release 发布流程。`changelog-release` Action 独立运行，不调用 `changelog` Action，也不读取它的 outputs。调用方只需 checkout 一个符合 catalog 格式的文件，并传入要发布的版本；catalog 可以由 `changelog` Action 或其他流程生成。catalog 格式见 [changelog Action 文档](changelog.md#草稿格式与写入)。

在 changelog PR 合并场景中，Action 读取合并提交中的最终 catalog，创建版本 tag 和 GitHub Release，并将英文说明写入 Release 页面。

## 职责边界

调用方 workflow 负责：

- 监听 `pull_request.closed` 事件，并筛选已合并、来自同一仓库且分支名为 `changelogs/v{version}` 的 PR。
- checkout PR 的 `merge_commit_sha`，确保读取的是合并后最终确认的 catalog。
- 按项目需要构建、签名和准备发布文件。
- 调用 Action，并传入版本、catalog 路径和待上传文件。

`changelog-release` Action 负责：

- 从 checkout 的 catalog 中查找唯一匹配版本，并读取 `notes.en`。
- 将英文条目格式化为 Markdown。
- 为当前 checkout 的提交创建 `v{version}` tag，创建 GitHub Release，将说明写入页面，并上传调用方传入的文件。
- 返回英文说明、tag 名和 Release 页面 URL。

Action 不构建或签名项目，不生成 appcast，也不监听 GitHub 事件。项目有差异的构建和 appcast 步骤仍放在调用方 workflow 中。

## Workflow 示例

维护者首次发布 `@v1` 时，在 **Publish action** 工作流中选择 `changelog-release` 和 `major`。

### 手动发布

将 [手动发布 workflow 示例](../examples/changelog-release.yml) 放到项目的 `.github/workflows/`。运行时选择包含 `changelogs.json` 的分支，并传入对应版本。

### 合并 PR 后发布

将以下 job 加到已订阅 `pull_request.closed` 的 workflow 中。示例从 changelog 分支名取得版本。

```yaml
jobs:
  release:
    if: >-
      github.event_name == 'pull_request' &&
      github.event.pull_request.merged == true &&
      github.event.pull_request.head.repo.full_name == github.repository &&
      startsWith(github.event.pull_request.head.ref, 'changelogs/v')
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v6
        with:
          ref: ${{ github.event.pull_request.merge_commit_sha }}

      - id: release-version
        env:
          PR_HEAD_REF: ${{ github.event.pull_request.head.ref }}
        run: echo "version=${PR_HEAD_REF#changelogs/v}" >> "$GITHUB_OUTPUT"

      - name: Build project release files
        run: ./scripts/build-release.sh

      - id: release
        uses: openchic/release-bits/actions/changelog-release@v1
        with:
          version: ${{ steps.release-version.outputs.version }}
          catalog-path: changelogs.json
          files: |
            dist/App-${{ steps.release-version.outputs.version }}.dmg
            dist/App-${{ steps.release-version.outputs.version }}-intel.dmg
            dist/App-${{ steps.release-version.outputs.version }}-apple-silicon.dmg
        env:
          GITHUB_TOKEN: ${{ github.token }}

      - name: Update appcast
        env:
          RELEASE_URL: ${{ steps.release.outputs.release-url }}
          RELEASE_NOTES: ${{ steps.release.outputs.notes-en }}
        run: ./scripts/update-appcast.sh
```

`files` 每行填写一个相对于仓库根目录的路径，支持上传多个文件，所有文件都会上传到同一个 Release。项目没有发布文件时可以省略该输入。Action 不依赖 changelog PR 事件，也不会从分支名、其他 Action 的 outputs 或 catalog 顺序推断版本。后续步骤可使用 `notes-en`、`tag-name` 和 `release-url`；跨 job 使用时，调用方可将 step outputs 映射为 job outputs。

## 输入与输出

### 输入

| 输入 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `version` | 是 | — | 要发布的 catalog 版本，格式为 `X.Y.Z`。必须显式传入 |
| `catalog-path` | 否 | `changelogs.json` | 相对于 checkout 后仓库根目录的路径 |
| `files` | 否 | — | 待上传到 Release 的文件路径，每行一个，相对于仓库根目录；支持多个文件 |

tag 和 Release 名称默认为 `v{version}`。tag 指向当前 checkout 的提交；合并 PR 时，调用方应 checkout `merge_commit_sha`。

### 输出

| 输出 | 说明 |
| --- | --- |
| `notes-en` | 格式化为 Markdown 的英文发布说明，每个条目一行，以 `- ` 开头 |
| `tag-name` | 创建的版本 tag，例如 `v1.2.3` |
| `release-url` | 已发布的 GitHub Release 页面链接 |

### 权限与认证

Action 通过环境变量接收 `GITHUB_TOKEN`，并需要 `contents: write` 权限来创建 tag、Release 和上传文件。Action 只在所有步骤成功后设置 outputs。

workflow 使用 `GITHUB_TOKEN` 创建 Release 时，GitHub 不会因该事件启动另一个 workflow。依赖 `release` 事件触发后续 workflow 的项目，应在同一次 workflow 中先完成构建和文件上传，或按需改用 GitHub App / Personal Access Token。详见 [GitHub 关于 `GITHUB_TOKEN` 事件行为的说明](https://docs.github.com/en/actions/concepts/security/github_token)。

## 校验与失败处理

- `version` 必须符合 `X.Y.Z`，且 catalog 中必须恰好有一条记录匹配该版本；`notes.en` 必须是非空字符串数组。
- Action 在创建 tag 或 Release 前检查 catalog 与所有文件。文件路径必须相对于仓库根目录、指向仓库内的普通文件；文件名重复（忽略大小写）时失败。
- 每个文件必须小于 2 GiB，同一个 Release 最多上传 1,000 个文件。
- Action 先检查同版本的草稿和已发布 Release，再为 checkout 的提交创建 tag。发现已有 Release 或创建 tag 时遇到同名冲突，Action 会停止。
- tag 创建成功后，Action 创建 draft Release 并逐个上传文件。所有文件上传成功后才发布 Release。
- tag 创建后的请求失败时，Action 会保留 tag 并在错误中提供已知的 Release URL。重试前先检查 GitHub 上的 tag 和 Release 状态。若确认本次只留下 tag 或未发布的草稿，可清理本次留下的资源后重跑。

GitHub Releases API 支持指定 tag、目标提交和正文来创建 Release。详见 [GitHub Releases REST API](https://docs.github.com/en/rest/releases/releases?apiVersion=latest)。
