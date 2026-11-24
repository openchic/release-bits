# changelog-release Action

## 目标

为多个项目复用 GitHub Release 发布流程。`changelog-release` Action 独立运行，不调用 `changelog` Action，也不读取它的 outputs。调用方只需 checkout 一个符合 catalog 格式的文件，并传入要发布的版本；catalog 可以由 `changelog` Action 或其他流程生成。catalog 格式见 [changelog Action 文档](changelog.md#草稿格式与写入)。

Action 从检出提交读取最终 catalog，创建或验证版本 tag，并将英文说明和附件发布到 GitHub Release。上传或发布中断后，可以用同一提交和产物重跑。

## 职责边界

调用方 workflow 选择触发方式，检出要发布的提交，准备所需附件，并显式传入版本。合并后自动发布时，监听 `pull_request.closed`，筛选同仓库已合并的 `changelogs/v{version}` PR，再 checkout 对应的 `merge_commit_sha`。

`changelog-release` Action 负责：

- 从 checkout 的 catalog 中查找唯一匹配版本，并读取 `notes.en`。
- 将英文条目格式化为 Markdown。
- 为当前 checkout 的提交创建或复用版本 tag，继续上传同一次发布的附件并发布 GitHub Release。
- 返回英文说明、tag 名和 Release 页面 URL。

Action 不构建或签名项目，不生成 appcast，也不监听 GitHub 事件。项目有差异的构建和 appcast 步骤仍放在调用方 workflow 中。

## Workflow 示例

维护者首次发布 `@v1` 时，在 **Publish action** 工作流中选择 `changelog-release` 和 `major`。

### 手动发布

将 [手动发布 workflow 示例](../examples/changelog-release.yml) 放到项目的 `.github/workflows/`。运行时选择包含 `changelogs.json` 的 ref，并传入对应版本。可选的 `tag_name` 必须指向该 ref 所对应的提交。

### 合并 PR 后发布

将以下 jobs 加到已订阅 `pull_request.closed` 的 workflow 中。`build` 从 changelog 分支名取得版本并保存 DMG。发布失败时重跑 `publish`，按同一个 artifact ID 恢复原产物。

```yaml
jobs:
  build:
    if: >-
      github.event_name == 'pull_request' &&
      github.event.pull_request.merged == true &&
      github.event.pull_request.head.repo.full_name == github.repository &&
      startsWith(github.event.pull_request.head.ref, 'changelogs/v')
    runs-on: macos-latest
    permissions:
      contents: read
    outputs:
      version: ${{ steps.release-version.outputs.version }}
      artifact_id: ${{ steps.artifact.outputs.artifact-id }}
    steps:
      - uses: actions/checkout@v6
        with:
          ref: ${{ github.event.pull_request.merge_commit_sha }}

      - id: release-version
        env:
          PR_HEAD_REF: ${{ github.event.pull_request.head.ref }}
        run: echo "version=${PR_HEAD_REF#changelogs/v}" >> "$GITHUB_OUTPUT"

      - name: Build project release files
        env:
          VERSION: ${{ steps.release-version.outputs.version }}
        run: ./scripts/build-release.sh

      - id: artifact
        uses: actions/upload-artifact@v4
        with:
          name: release-dmgs-${{ github.run_attempt }}
          path: dist/*.dmg
          if-no-files-found: error

  publish:
    needs: build
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v6
        with:
          ref: ${{ github.event.pull_request.merge_commit_sha }}
      - uses: actions/download-artifact@v4
        with:
          artifact-ids: ${{ needs.build.outputs.artifact_id }}
          path: dist/
          merge-multiple: true

      - id: release
        uses: openchic/release-bits/actions/changelog-release@v1
        with:
          version: ${{ needs.build.outputs.version }}
          catalog-path: changelogs.json
          files: |
            dist/App-${{ needs.build.outputs.version }}.dmg
            dist/App-${{ needs.build.outputs.version }}-intel.dmg
            dist/App-${{ needs.build.outputs.version }}-apple-silicon.dmg
        env:
          GITHUB_TOKEN: ${{ github.token }}

      - name: Update appcast
        env:
          RELEASE_URL: ${{ steps.release.outputs.release-url }}
          RELEASE_NOTES: ${{ steps.release.outputs.notes-en }}
        run: ./scripts/update-appcast.sh
```

`files` 每行填写一个相对于仓库根目录的路径，支持上传多个文件，所有文件都会上传到同一个 Release。项目没有发布文件时可以省略该输入。Action 不依赖 changelog PR 事件，也不会从分支名、其他 Action 的 outputs 或 catalog 顺序推断版本。后续步骤可使用 `notes-en`、`tag-name` 和 `release-url`；跨 job 使用时，调用方可将 step outputs 映射为 job outputs。

### 原子推送版本提交和 tag 后发布

构建 job 保存产物，并原子推送版本提交和 tag。将该提交 SHA、版本和 artifact ID 写入 job outputs。下游检出版本提交，再按 ID 下载原产物。上传失败时重跑 `publish` job，继续使用同一份产物。

```yaml
jobs:
  publish:
    needs: release
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v6
        with:
          ref: ${{ needs.release.outputs.release_sha }}
      - uses: actions/download-artifact@v4
        with:
          artifact-ids: ${{ needs.release.outputs.artifact_id }}
          merge-multiple: true
      - uses: openchic/release-bits/actions/changelog-release@v1
        with:
          version: ${{ needs.release.outputs.version }}
          tag-name: v${{ needs.release.outputs.version }}
          files: App-${{ needs.release.outputs.version }}.dmg
        env:
          GITHUB_TOKEN: ${{ github.token }}
```

## 输入与输出

### 输入

| 输入 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `version` | 是 | — | 要发布的 catalog 版本，格式为 `X.Y.Z`。必须显式传入 |
| `tag-name` | 否 | — | 已存在的远端 tag 名，必须指向 checkout 的提交。省略时创建或复用 `v{version}` |
| `catalog-path` | 否 | `changelogs.json` | 相对于 checkout 后仓库根目录的路径 |
| `files` | 否 | — | 待上传到 Release 的文件路径，每行一个，相对于仓库根目录；支持多个文件 |

Release 名称与实际使用的 tag 名一致。

### 输出

| 输出 | 说明 |
| --- | --- |
| `notes-en` | 格式化为 Markdown 列表的英文发布说明，每条说明对应一个列表项 |
| `tag-name` | Release 对应的 tag，例如 `v1.2.3` |
| `release-url` | 已发布的 GitHub Release 页面链接 |

### 权限与认证

Action 通过环境变量接收 `GITHUB_TOKEN`，并需要 `contents: write` 权限来创建 tag、Release 和上传文件。Action 只在所有步骤成功后设置 outputs。

workflow 使用 `GITHUB_TOKEN` 创建 Release 时，GitHub 不会因该事件启动另一个 workflow。依赖 `release` 事件触发后续 workflow 的项目，应在同一次 workflow 中先完成构建和文件上传，或按需改用 GitHub App / Personal Access Token。详见 [GitHub 关于 `GITHUB_TOKEN` 事件行为的说明](https://docs.github.com/en/actions/concepts/security/github_token)。

## 校验与失败处理

- `version` 必须符合 `X.Y.Z`，且 catalog 中必须恰好有一条记录匹配该版本；`notes.en` 必须是非空字符串数组。
- Action 在创建 tag 或 Release 前检查 catalog 与所有文件。文件路径必须相对于仓库根目录、指向仓库内的普通文件；文件名重复（忽略大小写）时失败。
- 每个文件必须小于 2 GiB，同一个 Release 最多上传 1,000 个文件。Runner 临时目录应有足够空间暂存附件。
- tag 必须指向 checkout 的提交。显式指定的 tag 缺失、tag 指向不同提交或存在多个同名 Release 时，Action 会停止。
- Action 在草稿中记录提交、正文和附件指纹。使用同一个版本、提交和附件重跑时，Action 跳过 SHA-256 一致的文件，补传缺失附件，清理 GitHub 留下的 `starter` 空占位后重传。
- 附件先复制到 Action 的临时目录，再对副本计算摘要和上传。源文件后续变化不影响本次上传。发布前重新检查附件、远端 tag 和草稿内容，校验通过后发布草稿并移除草稿中的指纹。
- 已发布 Release 的正文和附件全部一致时，Action 返回原有输出。发布请求失败时，已有 tag 和草稿会保留，错误中会提供可用的 Release URL。调用方应串行运行同一 tag 的发布任务。

GitHub Releases API 支持指定 tag、目标提交和正文来创建 Release。详见 [GitHub Releases REST API](https://docs.github.com/en/rest/releases/releases?apiVersion=latest)。
