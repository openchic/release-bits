# shipkit

可复用的 GitHub Actions，用于 Apple 应用发布流程；当前只有 `changelog`。

## 命令

```bash
PYTHONPATH=src python3 -m unittest discover -s tests -v      # 单测
./bin/shipkit changelog --version 1.2.3 [--version-type minor] # 本地预览，需要 GEMINI_API_KEY
PYTHONPATH=src python3 -m compileall -q src tests            # 语法检查
```

`shipkit` 命令名不变：`python3 -m shipkit` 与 `./bin/shipkit` 都必须可用。

## 结构

```text
actions/changelog/action.yml    action 元数据
src/shipkit.py                  命令入口，只做分发
src/changelog/                  changelog 实现（errors/gitutils 暂放这里）
bin/shipkit                     本地命令
docs/changelog.md               action 契约
examples/release-notes.yml      接入示例
tests/                          单元测试
```

后续 action 以子命令接到 `src/shipkit.py`，实现放 `src/<feature>/`；出现第二个 action 时再抽公共模块。

## 行为

- 只做生成：双语说明、catalog 草稿、创建或复用 draft PR；不负责清理、tag、Release、打包。
- 版本：`version` 必填；有 `version-type` 时从它递增，否则直接使用；不读配置文件；结果版本必须高于 base 与分支 catalog 最新版本。
- 草稿不写 `reviewed`；草稿与历史由分支/PR 状态区分。
- 复用顺序：open PR > 远程分支草稿 > 重新生成；不覆盖人工修改。
- 生成后只允许 catalog 变化，历史不得修改；catalog 原子写。
- 风格检查只警告，不阻断，输出 `warning-count`。
- 关闭清理由调用方内联 `gh api` 完成。

## 约定

- 代码按功能放 `src/<feature>/`；`src/shipkit.py` 不放业务逻辑。
- 不读配置文件，不加可选开关；不重新引入 `reviewed`、`product-name`、`terminology`、`strict-style`。
- 输入输出用 kebab-case；密钥只走环境变量，不打印、不进命令行。
- 行为变化补测试，覆盖版本、复用、漂移；改 action 或示例后做一次 YAML 解析。
- 文档以 `docs/changelog.md` 为准，改行为时同步更新。
- 发布用 `.github/workflows/release.yml`：测试 → `vX.Y.Z` → 移动 `vX` → GitHub Release；action 版本是 git tag，不写 action.yml。
- 真实 PR 和 Gemini 调用无法本地验证时，明确说明。

## Skills

- 写代码：任何新增、修改、重构或 review 代码的任务，先加载 `code-style` skill，按其规则执行。
- 提交：任何生成 commit 或 commit message 的任务，必须加载 `commit` skill，按其流程和消息格式执行；仅在用户明确要求时提交；不加 Co-Authored-By。

## Change 归属

- 除非用户明确要求，不要将后续需求混入当前 change。后续改动默认归入当前相关且尚未归档的 change；只有用户明确要求新建 change，或当前 change 无关或已归档时，才创建新的 change。创建新 change 前，先归档其他尚未归档的 change。
- Explore 阶段只用于探索方案和确认需求。用户确认 proposal 后，结束 Explore，进入 fast-forward 和 apply 流程，连续生成或更新剩余文档、实现代码并完成必要验证；除非遇到需求歧义、设计冲突或错误，否则不逐项请求确认。
- 实现过程中，代码变更必须同步更新当前 change 的 proposal、spec、design 和 tasks，保持方案、约束、实现和进度一致。
- 归档前先 review 相关文档，清理过时描述，并同步移除或简化由此产生的冗余代码；然后将 delta spec 同步到主规格并确认结果。
- 完成归档后，提交归档文档及相关代码变更。
- Bug 的 spec 必须记录已确认的用户可见现象、根因和最终处理约束；排查日志、临时诊断代码和失败试改只保留在 design 或归档记录中，不混入长期规格。
