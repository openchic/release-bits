## Why

Several consumer projects need the same post-merge release behavior: publish the approved English catalog notes and attach project-built files to a versioned GitHub Release. A standalone Action will centralize this shared release operation without requiring the changelog-generation Action.

## What Changes

- Add a Node.js 24 `changelog-release` Action that reads a selected catalog record, creates its `v{version}` tag and GitHub Release, and uploads multiple optional files.
- Return the formatted English notes, tag name and published Release URL as outputs.
- Validate the catalog, version and upload files before creating a tag or Release; fail without modifying an existing tag or Release.
- Document the standalone contract and post-merge workflow usage.

## Capabilities

### New Capabilities
- `changelog-release`: publish a GitHub Release from a catalog entry and optional project-built files.

### Modified Capabilities

## Impact

Adds `actions/changelog-release/` with source, tests and a bundled entry point for release snapshots. Updates `docs/changelog-release.md`. Uses the repository's existing GitHub Actions toolkit dependencies and release API conventions.
