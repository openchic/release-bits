# shipkit

## 仓库结构

- 每个 Action 位于 `actions/<name>/`。`changelog` 的源码、测试和构建产物分别在 `src/`、`test/` 和 `dist/`。
- `scripts/release.mjs` 管理 Action 的发布快照，版本由 Git tag 标识。
- `changelog` 的使用契约和维护者发布流程以 [docs/changelog.md](docs/changelog.md) 为准。变更 Action 行为时同步更新文档及相关示例。

## 开发与验证

在仓库根目录使用 Node.js 24 和 `package.json` 指定的 pnpm 版本。各 Action 共用根目录锁文件。

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm build
pnpm test
```

单独构建 `changelog` 时运行 `pnpm --filter @shipkit/changelog build`。

- 行为变更补测试，覆盖受影响的版本、复用和漂移规则。修改 Action 或示例后解析相关 YAML。
- 说明真实 PR 和 Gemini 调用的验证情况。

## 实现约定

- Action 按职责组织代码，入口只做分发。配置限于现有的 Action 输入和环境变量，输入和输出使用 kebab-case。
- 密钥只通过环境变量传递，禁止写入命令行或日志。

## Skills 与提交

- 编写、重构或 review 代码前，先加载 `code-style` skill。
- 提交或撰写提交信息前，先加载 `commit` skill。常规改动在用户明确要求时提交，提交信息省略 `Co-Authored-By`。

## OpenSpec

- 改动优先归入相关且未归档的 change。用户明确要求新建，或没有相关未归档的 change 时，先归档其他未归档的 change，再新建。
- Explore 用于确认需求和方案。用户确认 proposal 后，继续 fast-forward 和 apply，完成实现与验证。遇到需求歧义、设计冲突或错误时再请求确认。
- 实现时同步更新当前 change 的 proposal、spec、design 和 tasks。
- 归档前 review 文档，清理过时描述和相关的冗余代码，再将 delta spec 同步到主规格并确认结果。归档后提交归档文档和相关代码。
- Bug 的 spec 记录已确认的用户可见现象、根因和最终约束。排查日志、临时诊断代码和失败试改留在 design 或归档记录中。
