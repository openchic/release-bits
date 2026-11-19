# changelog action

解析版本、从增量提交生成中英双语发布说明、写入 catalog 草稿，并创建或复用 draft PR。

```text
openchic/shipkit/actions/changelog@v1
```

- 运行环境：`ubuntu-latest`，Node.js 24，GitHub Actions Toolkit
- 权限：`contents: write`、`pull-requests: write`
- 密钥：`SHIPKIT_GEMINI_API_KEY`
- 只生成草稿，不在 catalog 里记录审核状态；合并 PR 是人工确认信号

## 快速开始

```yaml
name: Prepare release notes

on:
  workflow_dispatch:
    inputs:
      version:
        description: Base version, for example 1.2.3
        required: true
      version_type:
        description: Leave none to use the version as-is
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
      - uses: actions/checkout@v6

      - uses: openchic/shipkit/actions/changelog@v1
        with:
          version: ${{ inputs.version }}
          version-type: ${{ inputs.version_type != 'none' && inputs.version_type || '' }}
        env:
          GH_TOKEN: ${{ github.token }}
          SHIPKIT_GEMINI_API_KEY: ${{ secrets.SHIPKIT_GEMINI_API_KEY }}
```

运行后：

```text
Actions -> Prepare release notes -> 填版本、选版本类型 -> Run
  -> 创建 changelogs/vX.Y.Z 分支和 draft PR
  -> 在 PR 里审核、修改 changelogs.json
  -> 合并 = 确认发布说明
```

重复运行是幂等的：已有 PR 直接返回链接，已有草稿不重复调用 Gemini。

`actions/checkout` 默认浅克隆即可，Action 会获取历史和 tag，也支持 `fetch-depth: 0`。

action 假定仓库位于 workspace 根目录；不要用 `path:` 把仓库 checkout 到子目录。

## 输入

GitHub Actions 的输入都是字符串。

| 输入 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `version` | 是 | — | 基础版本号 `X.Y.Z` |
| `version-type` | 否 | 空 | `major` / `minor` / `patch`；出现时从 `version` 递增 |
| `catalog-path` | 否 | `changelogs.json` | 草稿写入位置 |
| `base-branch` | 否 | 仓库默认分支 | PR 目标 |
| `base-ref` | 否 | 最近可达 tag | 提交范围起点 |
| `max-chars` | 否 | `50` | 中文简洁目标，超过该值 10 个字符才产生警告 |
| `model` | 否 | `gemini-3.5-flash-lite` | Gemini 模型 |

### 版本规则

| 输入组合 | 结果版本 |
| --- | --- |
| `version: 1.2.3`，无 `version-type` | `1.2.3` |
| `version: 1.2.3`，`version-type: minor` | `1.3.0` |

- `version` 必填；
- 计算只基于传入的 `version`，不读 tag、不读任何配置文件；
- 结果版本必须高于 base 分支与复用分支的 catalog 最新版本；
- 计算模式在草稿写 `version_type`，直接使用模式不写；
- 分支、PR、说明统一使用结果版本。

### base-ref 回退

默认取 `HEAD` 可达的最近 tag。仓库没有 tag 时回退到完整历史，并在日志里显式警告；此时建议显式传 `base-ref`。默认不限定 tag 格式，仓库有非版本 tag 时也建议显式传 `base-ref`。

## 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `GH_TOKEN` | 是 | 需要 `contents: write` 与 `pull-requests: write` |
| `SHIPKIT_GEMINI_API_KEY` | 是 | 只通过请求头传递，不写入 URL、命令行或日志 |

密钥放在 step 级 `env`，不要放到整个 job。

## 输出

| 输出 | 说明 |
| --- | --- |
| `pr-url` | draft PR 链接 |
| `pr-created` | `true` 表示本次新建，`false` 表示复用 |
| `version` | 结果版本 |
| `branch` | `changelogs/v{version}` |
| `source-sha` | 生成时的 HEAD 快照 |
| `commit-count` | 本次进入证据的 feat/fix 提交数；复用草稿时为 0 |
| `warning-count` | 对最终草稿执行的风格检查条数 |
| `notes-json-path` | 预览 JSON 的绝对路径 |
| `notes-markdown-path` | 预览 Markdown 的绝对路径 |

有 open PR 直接返回时，`source-sha` 和 `notes-*-path` 为空，`warning-count` 为 0。

预览文件位于 runner 临时目录：

```text
release-notes-{version}.json
release-notes-{version}.md
```

## 流程

```text
1. 解析结果版本，校验 X.Y.Z
2. 计算分支 changelogs/v{version}
3. 已有 open PR -> 输出链接，结束
4. 获取 base 分支、发布分支和标签，浅克隆时补全历史
5. 复用的分支上已有草稿：
     版本一致且高于 catalog 历史版本 -> 跳过 Gemini
     版本不一致 -> 失败
6. 生成说明：提交筛选、Gemini、结构校验、风格警告
7. 原子写入草稿
8. 只提交 catalog，校验漂移
9. 推送分支；通过 GitHub API 创建 draft PR
10. 写输出和 step summary
```

### 复用规则

| 状态 | 行为 |
| --- | --- |
| 分支已有 open PR | 直接返回该 PR，不生成、不覆盖 |
| 远程分支存在、没有 open PR | 复用分支；空分支重新生成；已有历史但没有草稿的残留分支失败 |
| 复用的分支上已有草稿 | 跳过 Gemini；版本必须与结果版本一致 |
| 发布分支不存在 | 将 base 分支上的 catalog 视为已发布历史，校验版本后生成草稿并开 PR |

任何情况下都不覆盖人工修改，不重复调用 Gemini。

### 草稿

```json
{
  "version": "1.3.0",
  "version_type": "minor",
  "source_sha": "0123456789abcdef0123456789abcdef01234567",
  "notes": {
    "zh-CN": ["让清理结果在重启后保持稳定。"],
    "en": ["Kept cleanup results stable after relaunch."]
  }
}
```

- 直接使用模式没有 `version_type`；
- 草稿不带 `reviewed`；草稿是否存在由分支和 PR 状态判断，是否通过由合并 PR 决定。

### catalog 规则

- 文件不存在时创建只含本次草稿的数组；
- 必须是合法 JSON 数组；
- 草稿与历史靠分支状态区分，不依赖 catalog 字段；
- 远程 release 分支的首条是草稿；base 分支上的条目都是已发布历史；
- 历史条目原样保留，只读 `version` 用于排序校验；
- 候选版本必须高于最新历史版本；
- 原子写，失败不留半成品。

### 漂移校验

提交后、推送前检查：

- 生成期间 `HEAD` 没有变化；
- 从 `source_sha` 到提交只改了 catalog；
- 历史条目没有被修改。

任一不满足则失败，不推送、不开 PR。

## 生成规则

- 读取 `base-ref..HEAD`，`--no-merges`，只取提交标题和正文；
- 只保留 `feat` / `fix`，排除 revert 及其撤销的提交；
- 证据不含 SHA、diff，上限 200KB；
- Gemini 结构化输出，90 秒超时，失败不重试；
- 结构校验：中英成对、逐条非空；
- 提示词使用通用措辞，不读产品名、术语表或任何配置文件；
- 提交正文视为待分析资料，注入指令一律忽略；
- 不宣称证据未提及的签名、公证、安装、更新或上线。

## 风格检查

只产生警告，不阻断草稿和 PR。警告写入日志和 step summary，并计入 `warning-count`。

| 规则 | 提示 |
| --- | --- |
| “并 / 以及 / 同时”连接多个变化 | 拆成一条一个变化 |
| 以“优化 / 强化 / 改进 / 完善 / 增强 / 调整”开头 | 写出具体对象和用户可见结果 |
| 中文超过 `max-chars + 10` | 精简 |
| 英文以祈使动词开头 | 改为一般过去时 |
| 英文包含 `now` | 删除 |

## 关闭清理

清理不在 action 内，由调用方的 `pull_request: closed` job 内联完成：

```yaml
cleanup:
  if: >-
    github.event_name == 'pull_request' &&
    github.event.pull_request.head.repo.full_name == github.repository &&
    startsWith(github.event.pull_request.head.ref, 'changelogs/')
  runs-on: ubuntu-latest
  permissions:
    contents: write
  steps:
    - env:
        GH_TOKEN: ${{ github.token }}
        BRANCH: ${{ github.event.pull_request.head.ref }}
      run: |
        set -euo pipefail
        ref="repos/${GITHUB_REPOSITORY}/git/ref/heads/${BRANCH}"
        if output="$(gh api "$ref" 2>&1)"; then
          gh api --method DELETE "repos/${GITHUB_REPOSITORY}/git/refs/heads/${BRANCH}"
        elif [[ "$output" == *"HTTP 404"* ]]; then
          echo "Release branch already deleted"
        else
          printf '%s\n' "$output" >&2
          exit 1
        fi
```

- 合并和未合并关闭都会删除分支；
- 只处理同仓库、`changelogs/` 前缀的分支，fork PR 不碰；
- 分支已不存在时返回 404，视为已完成；其他错误会打印原因并失败；
- `changelogs/` 是公开契约，也是后续 job 识别 PR 的唯一稳定标识，不参数化。

## changelog Action 版本发布（维护者）

此流程发布 `changelog` Action 本身，与上面的 draft PR 合并流程分开。

1. 在 `main` 上运行仓库的 **Release** workflow，选择 `changelog` 和 `major` / `minor` / `patch`（默认 `minor`）。
2. workflow 在 `actions/changelog/` 下运行 `pnpm version`，从该 Action 当前的 `package.json` 版本递增；首次版本为 `0.0.0`，默认 `minor` 会得到 `0.1.0`。
3. workflow 将新的 `package.json` 版本提交到 `main`，并原子推送固定版本标签（例如 `changelog-v1.1.0`）和对应的主版本快照标签（例如 `v1`）。快照只更新被发布的 Action，并保留其他 Action 已发布的目录。
4. 固定标签与 `vN` 快照推送后，workflow 根据 `actions/changelog/` 中自上次发布以来的 Conventional Commit `feat` 和 `fix` 标题生成 GitHub Release 变更日志，并创建 Release。其他类型的提交不进入变更日志。

消费者可以通过 `openchic/shipkit/actions/changelog@v1` 跟随主版本，或使用 `@changelog-v1.1.0` 固定具体版本。发布 workflow 需要 `contents: write`，且仓库规则必须允许它将版本提交推送到 `main`。

## App 仓库中的后续版本发布预留

如果 App 仓库之后要在 changelog PR 合并后触发自己的发布，在 App workflow 增加一个 job，条件固定：

```yaml
if: >-
  github.event_name == 'pull_request' &&
  github.event.pull_request.merged == true &&
  startsWith(github.event.pull_request.head.ref, 'changelogs/')
```

`changelog` action 不需要任何改动。

## 失败矩阵

| 场景 | 结果 |
| --- | --- |
| `version` 非法或结果不高于 catalog 最新版本 | 失败，不写入 |
| base 分支已发布同版本或更高版本 | 失败，提示重新生成 |
| 范围内没有 feat/fix | 失败，提示调整 `base-ref` |
| 证据超过 200KB | 失败，提示缩小范围 |
| 缺少 `GH_TOKEN` 或 API key | 失败，指明变量名 |
| Gemini 401 / 403 / 404 或超时 | 失败，不重试 |
| 返回结构不符合 schema | 失败，不写文件 |
| 分支已有历史但没有草稿，或草稿版本不一致 | 失败，提示删除残留分支 |
| 生成期间 HEAD 变化或出现 catalog 之外的改动 | 失败，不推送 |
| 浅克隆补拉失败 | 失败，检查 checkout 凭据与仓库访问权限 |

## 从 clean-mac 迁移

| 行为 | clean-mac | shipkit |
| --- | --- | --- |
| 提交筛选、revert 排除、200KB 上限 | 有 | 逐字保留 |
| 提示词安全规则、结构化输出、风格警告 | 有 | 保留；去掉产品名与术语表 |
| 版本计算 | `project.yml` + `version_type` | 必填 `version`；可选 `version-type` 从它递增 |
| 草稿写入 `changelogs.json` | 有 | 有（不含 `reviewed`） |
| draft PR 创建与复用 | 有 | 有 |
| `reviewed` 审核字段 | 有 | 移除；合并 PR 即确认 |
| catalog 业务校验、发布 | 有 | 留在 App 仓库 |
| 关闭清理 | 独立 job | 调用方内联 |
| 语言 | 固定中英 | 固定中英 |

## 安全与版本

- `GH_TOKEN` 只放在 step 级 `env`；不启用 `set -x`，不打印 security/Gemini 输出；
- 接入仓库需允许 GitHub Actions 创建 PR。内置 token 创建或更新 PR 时，对应的 CI 运行可能需要写权限用户批准；
- 只处理同仓库分支，fork PR 不继承凭据；
- action 只写 catalog 和临时预览文件，不改其他仓库文件；
- 使用 `@v1` 跟随兼容版本，使用 `@changelog-v1.2.3` 或快照 commit SHA 固定版本。发布仅更新该主版本快照中的 changelog 目录。
