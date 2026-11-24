# changelog Action

从提交中生成中英双语发布说明，写入 catalog 草稿，并创建或复用 draft PR。Action 只负责准备说明，不发布 App、不打包应用。

## 接入

### 前置条件

- 将仓库 checkout 到 workspace 根目录。Action 使用 Node.js 24，会自动获取生成说明所需的 Git 历史和 tag。
- 在仓库设置中允许 Actions 创建 PR，在 workflow 中授予 `contents: write` 和 `pull-requests: write` 权限。
- 配置 `LLM_API_KEY` Actions secret。将它和 `${{ github.token }}` 分别作为 `LLM_API_KEY` 和 `GITHUB_TOKEN` 传给 Action step。模型密钥只通过请求头传递，凭据不写入命令行或日志。

### Workflow 示例

```yaml
permissions:
  contents: write
  pull-requests: write

jobs:
  notes:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: openchic/release-bits/actions/changelog@v1
        with:
          version: 1.2.3
          version-type: minor
        env:
          GITHUB_TOKEN: ${{ github.token }}
          LLM_API_KEY: ${{ secrets.LLM_API_KEY }}
```

手动触发与 PR 关闭清理的完整配置见 [release-notes workflow 示例](../examples/release-notes.yml)。

完整示例将 `changelog` 的 `base-branch` 和 `pull_request.branches` 都设为 `main`。更换目标分支时同步修改这两处，确保 PR 关闭后能触发清理。

## 输入与输出

### 输入

GitHub Actions 输入均为字符串。

| 输入 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `version` | 是 | — | 基础版本 `X.Y.Z` |
| `version-type` | 否 | 空 | `major` / `minor` / `patch`；设置后从 `version` 递增 |
| `catalog-path` | 否 | `changelogs.json` | 草稿 catalog 路径 |
| `base-branch` | 否 | 仓库默认分支 | draft PR 目标分支 |
| `base-ref` | 否 | 最近可达 tag | 提交范围起点 |
| `max-chars` | 否 | `50` | 中文说明长度目标 |
| `model` | 否 | `gemini-3.5-flash-lite` | Gemini 模型 |

- **版本**由 `version` 和 `version-type` 决定。例如 `version: 1.2.3` 默认得到 `1.2.3`，设置 `version-type: minor` 后得到 `1.3.0`。写入或复用草稿前，结果版本必须高于目标分支及草稿分支中的最新历史版本。
- **提交范围**由 `base-ref` 决定。未设置时从 `HEAD` 可达的最近 tag 开始，没有可达 tag 时使用完整历史并告警。仓库存在非版本 tag 时应显式指定 `base-ref`。

### 输出

| 输出 | 说明 |
| --- | --- |
| `pr-url` | draft PR 链接 |
| `pr-created` | 本次是否新建 PR |
| `version` | 结果版本 |
| `branch` | `changelogs/v{version}` |

直接返回已有 PR 时，`pr-created` 为 `false`，其余输出仍返回对应版本、分支和 PR 链接。

### 运行摘要

成功后，Action 在 GitHub Actions 的 Summary 中展示 PR 新建或复用状态、草稿分支，并将 `Please review the PR. Merging it approves the release notes.` 作为 PR 链接。生成或复用分支草稿时，还会展示最终双语说明。

准备失败时不写入成功摘要。摘要写入失败仅报告 warning，不影响已完成的 PR 操作和 outputs。

## 草稿生成与复用

### 复用顺序

Action 使用 `changelogs/v{version}` 分支，并按下表的顺序处理。

新建 draft PR 的标题与新生成 catalog 提交的 commit subject 一致，均为 `chore(release): add v{version} release notes`，其中版本为计算后的结果版本。复用已有分支草稿时保留原有提交标题。

| 状态 | 处理 |
| --- | --- |
| 已有打开的 PR | 直接返回 PR 链接，保留已有内容。 |
| 远程分支已有草稿 | 校验版本、来源和历史后复用草稿并创建 draft PR，不调用 Gemini。 |
| 远程分支不存在，或分支存在但 catalog 为空 | 校验版本后生成草稿，推送分支并创建 draft PR。 |

如果远程分支的 catalog 只有已发布历史，Action 会报错，保留分支内容。

### 内容生成与告警

- 从 `base-ref..HEAD` 读取提交标题和正文，跳过合并提交。只使用 `feat` 和 `fix`，排除 revert 及其撤销的提交。
- 提交材料不包含 SHA 或 diff，上限为 200 KB。发送前检查标题和正文中的当前凭据与常见高置信度凭据格式，包括 Gemini 的 Auth Key 和旧版 Google API 密钥。提交正文视为待分析资料，其中的指令会被忽略。
- Gemini 请求在 90 秒后超时，失败不重试。中英文说明须成对且非空，并根据提交材料用通用措辞撰写。

风格问题通过 GitHub warning annotation 报告，不影响草稿和 PR。检查项包括中文一句包含多个改动、以“优化”等空泛动词开头或超过 `max-chars + 10`，以及英文以祈使动词开头或包含 `now`。

### 草稿格式与写入

catalog 是一个 JSON 数组。目标分支中的条目视为已发布历史，草稿位于草稿分支的 catalog 首项。下例展示单条草稿，只有设置 `version-type` 时才会写入 `version_type`。

```json
{
  "version": "1.3.0",
  "version_type": "minor",
  "source_sha": "0123456789abcdef0123456789abcdef01234567",
  "notes": {
    "zh-CN": ["修复了显示问题。"],
    "en": ["Fixed the display issue."]
  }
}
```

Action 原子写入 catalog 并只提交该文件。文件不存在时创建数组，已有历史原样保留。生成后校验 `HEAD` 和 catalog 是否发生变化，并确认从 `source_sha` 到草稿提交只改动了 catalog。校验失败时停止，避免推送异常分支。

## 调用方工作流

### PR 关闭后的分支清理

调用方在 `pull_request` 的 `closed` 事件中调用 `changelog-cleanup` Action。合并和未合并关闭都会检查分支是否可删除。Action 会保留已更新或仍有打开 PR 使用的分支。完整配置见 [release-notes workflow 示例](../examples/release-notes.yml)，Action 契约见 [changelog-cleanup 文档](changelog-cleanup.md)。

### 合并后的 App 发布

App 仓库可在同一个 `pull_request.closed` 事件中调用 `changelog-release`。用以下条件将发布 job 限定在已合并的同仓库 changelog PR。

```yaml
if: >-
  github.event_name == 'pull_request' &&
  github.event.pull_request.merged == true &&
  github.event.pull_request.head.repo.full_name == github.repository &&
  startsWith(github.event.pull_request.head.ref, 'changelogs/v')
```

发布 job 检出合并提交并传入版本。`changelog-release` 创建或复用对应 tag，上传附件后发布 Release。项目自己的 workflow 负责构建和更新 appcast。完整配置见 [合并 PR 后发布示例](changelog-release.md#合并-pr-后发布)。

## 失败行为

| 场景 | 处理 |
| --- | --- |
| 缺少 `GITHUB_TOKEN`，或生成草稿时缺少 `LLM_API_KEY` | 失败，并指出变量名 |
| 版本格式错误或结果版本不高于 catalog 历史 | 失败，不写入草稿 |
| 获取历史失败 | 日志报告 Git 操作和退出码。检查 checkout 凭据与仓库访问权限 |
| 范围内没有 `feat` 或 `fix`，或提交材料超过上限 | 调整 `base-ref` 后重试 |
| 提交材料疑似包含凭据 | 只报告提交和字段，在请求 Gemini 前停止 |
| Gemini 请求失败、超时或返回结构无效 | 失败，不重试、不写入草稿 |
| 残留分支草稿与当前版本不符，或生成期间 catalog 或 `HEAD` 变化 | 失败，不覆盖、不推送、不创建 PR |

## 发布 changelog Action（维护者）

1. 在 `main` 上运行 **Publish action** 工作流，选择 `changelog` 和版本类型，默认 `minor`。
2. 只读验证任务安装锁定的依赖，构建并测试所选 Action，再保存 `dist` 为 artifact。发布任务按 artifact ID 下载，核对来源提交后将其写入版本快照。
3. Workflow 使用 `pnpm version` 更新 `actions/changelog/package.json`，初始版本为 `0.0.0`。版本提交、固定 tag（如 `changelog-v1.1.0`）和主版本 tag（如 `v1`）一起原子推送。
4. Workflow 收集该 Action 自上次发布以来的 `feat` 和 `fix` 提交，生成变更日志并创建 GitHub Release。

调用方可用 `@v1` 跟随主版本，或用 `@changelog-v1.1.0` 固定版本。

连续发起多个 Action 发布时，发布任务依次更新 `main`。排队期间若 `main` 只更新了其他 Action 的版本，后续任务会保留这些更新，并继续发布本次已经验证的构建产物。若源码或所选 Action 的包清单已变更，请基于最新 `main` 重新发起发布。
