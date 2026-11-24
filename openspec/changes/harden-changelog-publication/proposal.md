## Why

Review found that the Release smoke step omits its required fixture, cleanup lacks a publication path, and edits to shared source can skip CI. Release preflight also needs to account for unpublished drafts and concurrent tag creation.

## What Changes

- Include cleanup in Action testing and publication, and trigger CI on shared source changes.
- Pass the upload fixture to the Release smoke step.
- Detect existing draft Releases and reserve the version tag at the checked-out commit before creating a Release.
- Preserve changelog branches that have moved or are used by an open PR.
- Check GitHub attachment limits before writing, report file read failures, and document standalone usage.
- Allow queued Action publications from the same verified commit to append their version commits to `main` in order.

## Capabilities

### Modified Capabilities

- `changelog-action`: Verify changes under `shared/`.
- `changelog-cleanup`: Verify and publish the cleanup Action through the repository workflows.
- `changelog-release`: Reject existing drafts and tag conflicts before creating a Release.

## Impact

Updates the repository workflows, release Action and tests, and the cleanup and release documentation.
