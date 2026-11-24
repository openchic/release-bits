# changelog-cleanup Action

`changelog-cleanup` Action 在 changelog PR 关闭后清理草稿分支。

## 职责

调用方 workflow 订阅目标分支上的 PR 关闭事件。合并和未合并关闭时，Action 都会检查同仓库的 `changelogs/` 分支。只有分支仍指向 PR 关闭时的提交，且没有打开的 PR 使用它，才会删除。

Action 不需要 checkout，不创建提交或 PR，也不发布 Release。事件筛选、仓库归属和分支前缀检查都由 Action 完成。

## 接入

```yaml
name: Changelog cleanup

on:
  pull_request:
    types: [closed]
    branches: [main]

permissions:
  contents: write
  pull-requests: read

jobs:
  cleanup:
    runs-on: ubuntu-latest
    steps:
      - uses: openchic/release-bits/actions/changelog-cleanup@v1
        env:
          GITHUB_TOKEN: ${{ github.token }}
```

`branches` 指定 PR 的目标分支。`GITHUB_TOKEN` 需要 `pull-requests: read` 查询打开的 PR，以及 `contents: write` 读取和删除目标分支。

## 处理规则

| 条件 | 处理 |
| --- | --- |
| 事件不是 `pull_request.closed` | 跳过 |
| PR 来自 fork | 跳过 |
| head branch 不以 `changelogs/` 开头 | 跳过 |
| 缺少关闭时的 head SHA、分支已更新，或仍有打开的 PR 使用分支 | 跳过 |
| 同仓库的 `changelogs/` PR 关闭，分支未变化且无人使用 | 删除 head branch |
| 分支已不存在（API 返回 404） | 视为成功 |
| 其他 GitHub API 错误 | Action 失败并报告错误 |

## Action 接口

Action 使用 Node.js 24，从 GitHub Actions 事件上下文读取 PR 信息。它不需要额外的 `with` 输入或 outputs，认证 token 通过 `GITHUB_TOKEN` 环境变量传入。

维护者首次发布 `@v1` 时，在 **Publish action** 工作流中选择 `changelog-cleanup` 和 `major`。工作流验证 Action 后发布版本快照。调用方可以用 `@v1` 跟随主版本，或固定到具体版本 tag。
