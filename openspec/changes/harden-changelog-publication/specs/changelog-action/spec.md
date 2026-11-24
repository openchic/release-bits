## MODIFIED Requirements

### Requirement: Source-scoped test workflow
The repository test workflow SHALL be named `Test actions` and use step names that consistently use `Verify` to distinguish workspace checks, packaged action execution and output verification. Pushes to `main` and pull requests SHALL run the workflow only when files under `actions/`, `shared/`, `scripts/`, `.github/workflows/`, or the root package workspace manifests change. The workflow SHALL remain callable through `workflow_call` without path filtering. The reusable workflow SHALL allow callers to skip the packaged action smoke steps through the `skip-action-smoke-test` input while retaining workspace checks and tests.

#### Scenario: Source changes
- **WHEN** a push to `main` or pull request changes a source, test, workflow or workspace manifest file covered by these paths
- **THEN** the test workflow runs, including for changes confined to `shared/`.

#### Scenario: Documentation-only changes
- **WHEN** a push to `main` or pull request changes only documentation
- **THEN** the test workflow is skipped.

#### Scenario: Release workflow calls tests
- **WHEN** the release workflow calls the test workflow through `workflow_call` with `skip-action-smoke-test` enabled
- **THEN** workspace checks and tests run while the packaged Action invocation and runner output check are skipped.
