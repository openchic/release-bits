## 1. Action implementation

- [x] 1.1 Add the Node.js 24 Action package, event eligibility checks, branch deletion and 404 handling.
- [x] 1.2 Add unit and packaged-entry tests for eligible merged/unmerged PRs, skipped events/forks/branches, 404 and API failures.

## 2. Consumer documentation

- [x] 2.1 Replace the inline cleanup script in `examples/release-notes.yml` with the Action and preserve the required event and permission configuration.
- [x] 2.2 Document the Action behavior and interface in `docs/changelog-cleanup.md` and link it from `docs/changelog.md`.
- [x] 2.3 Remove unused changelog outputs and preview files while retaining Summary notes and warning annotations.

## 3. Verification

- [x] 3.1 Run package check, build and tests; parse the Action and workflow YAML; run `git diff --check`.
