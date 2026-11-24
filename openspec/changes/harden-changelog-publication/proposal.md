## Why

Review found that the Release smoke step omits its required fixture, cleanup lacks a publication path, and edits to shared source can skip CI. Release preflight also needs to account for unpublished drafts and concurrent tag creation.

Consumers such as CleanU atomically push a version commit and tag, then publish an artifact in a separate job. They need to reuse that tag and safely retry Release publication with the same artifact.

## What Changes

- Include cleanup in Action testing and publication, and trigger CI on shared source changes.
- Pass the upload fixture to the Release smoke step.
- Support retries with both automatic version tags and caller-provided tags. Verify the target commit and draft contents, stage attachments before hashing and uploading, and document retrying publication with saved artifacts.
- Preserve changelog branches that have moved or are used by an open PR.
- Check GitHub attachment limits before writing, report file read failures, and document standalone usage.
- Allow queued Action publications from the same verified commit to append their version commits to `main` in order.

## Capabilities

### Modified Capabilities

- `changelog-action`: Verify changes under `shared/`.
- `changelog-cleanup`: Verify and publish the cleanup Action through the repository workflows.
- `changelog-release`: Create or reuse a validated version tag and resume an interrupted Release without overwriting conflicting content.

## Impact

Updates the repository workflows, release Action and tests, and the cleanup and release documentation.
