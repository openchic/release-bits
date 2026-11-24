## 1. Action package

- [x] 1.1 Add the `changelog-release` Node.js 24 package, Action metadata, TypeScript and Rollup configuration, and publication selector; verify pnpm resolves the package and the metadata declares the planned inputs and outputs.
- [x] 1.2 Implement version/catalog and repository-relative asset validation, Markdown formatting and duplicate asset-name checks; verify unit tests cover valid, missing, duplicate and malformed catalog records plus multiple and invalid asset paths.
- [x] 1.3 Implement the draft-release, asset-upload and publish sequence with existing-tag/release protection and outputs; verify mocked API tests cover success, conflicts and upload/publish failures.

## 2. Workflow and documentation

- [x] 2.1 Add workspace checks, tests and a packaged Action smoke test, register the Action in the test selector, and update the stale changelog output smoke assertion; verify the workflow YAML parses and the packaged smoke test passes.
- [x] 2.2 Replace the proposal notice in `docs/changelog-release.md` with the implemented standalone contract, inputs/outputs, multiple-file behavior, recovery behavior and caller workflow example; verify Markdown fences and whitespace.

## 3. Verification

- [x] 3.1 Run the repository check, build and test commands, parse the changed Action/workflow YAML, run `git diff --check`, and validate the OpenSpec change.
