## Why

Consumer workflows currently repeat the branch ownership and prefix checks and the GitHub API cleanup script for changelog PRs. A dedicated Action can own those rules and keep callers to the event trigger, permissions and one `uses` step.

## What Changes

- Add a Node.js 24 `changelog-cleanup` Action under `actions/changelog-cleanup/`.
- Read the pull request closed event from the GitHub Actions context.
- Delete same-repository `changelogs/` head branches after merged or unmerged closure. Skip unrelated events, fork PRs and other branches. Treat a missing branch as success.
- Replace the inline cleanup script in the workflow example and document the Action contract.
- Reduce changelog Action outputs to the PR URL, creation status, version and branch. Keep the bilingual preview in the job summary and report style warnings through annotations.

## Capabilities

### New Capabilities

- `changelog-cleanup`: idempotently remove eligible changelog branches after a pull request closes.

### Modified Capabilities

- `changelog-action`: remove unused diagnostic and preview-path outputs.

## Impact

Adds `actions/changelog-cleanup/` with source, tests and build output. Updates `examples/release-notes.yml` and the changelog documentation.
