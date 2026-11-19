## Why

Shipkit delivers Apple release tools from one repository. Consumers choose a compatible major per step while maintainers promote individual actions.

## What Changes

- Manage action packages in a pnpm workspace with one root lockfile.
- Implement changelog as a bundled Node 24 Action, preserving its seven inputs, nine outputs and draft workflow.
- Use `pnpm version` to bump the selected action package, commit its `package.json` change to `main`, and atomically publish action-specific fixed and major snapshot tags.
- Generate GitHub Release notes from that action’s conventional `feat` and `fix` commits.
- Use Node.js for the Action, tests and release tooling. Retire the Python module entry point and local CLI. The macOS and iOS build actions are future changes.

## Capabilities

### New Capabilities

- `changelog-action` covers the published changelog contract and independent action distribution.

## Impact

Action metadata, generation, CI, release tooling and integration documentation.
