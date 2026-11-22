## Why
App repositories need a reusable way to produce verified Developer ID disk images from an Xcode app.

## What Changes
Add project discovery, scheme discovery that tolerates individual probe failures, selectable architectures, architecture checks and thinning for embedded code, inside-out signing with component-specific permissions, notarization and a final JSON manifest. Verify the selected Action before publication, then build it from source and include its generated artifacts in the independent release snapshot.

Require an explicit app version or a `major`, `minor` or `patch` increment from the Xcode project or an explicit base version. Accept the final version from `changelog` directly so callers can produce matching release notes and packages. Expose the successfully packaged version to callers for project updates and release metadata.

Use the `release-bits-` prefix in the metadata displayed for new release snapshots.

## Capabilities
### New Capabilities
- `build-macos`: Build and package a macOS app for direct distribution.

### Modified Capabilities
None.

## Impact
Adds a macOS runner Action, verification, workflow example, and documentation. Callers own their project setup, upload and release.
