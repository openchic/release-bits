## Why

Shipkit 的发布说明 Action 使用 composite 入口启动 Python。改用 GitHub 的 Node.js Action 运行时和 Actions Toolkit，让维护者可以直接测试、打包和发布 TypeScript Action。

## What Changes

- 使用 TypeScript 实现发布说明、catalog 与 draft PR 流程，发布包含依赖的 JavaScript 产物。
- 保留 `actions/changelog` 的调用路径、输入、输出、环境变量和两个本地预览命令。
- 本地预览使用 Node.js 运行同一生成逻辑。开发和发布校验改用 TypeScript 测试和产物校验。
- 修正调用示例的 `none` 映射，确保默认选项直接使用输入版本。

## Capabilities

### New Capabilities

- `changelog-action`：记录发布说明 Action 的 Node.js 执行方式及其输入、输出、复用和本地预览契约。

### Modified Capabilities

无。

## Impact

影响 `actions/changelog`、`src/changelog`、本地命令入口、测试、发布 workflow 和接入文档。调用方仍需提供 checkout、GitHub CLI 和相应权限。
