## Context
An Action snapshot contains only its published directory and must run without installing workspace dependencies.

## Goals / Non-Goals
Build a directly distributed macOS app using Xcode. The caller owns dependencies, app-specific settings, uploads and release metadata.

## Decisions
Use the changelog Action’s Node.js 24, TypeScript, Rollup and bundled entry point for orchestration and Apple's Security framework to import the identity. Query the selected configuration for product and entitlement paths, then read the version from the actual app. Complete all unsigned builds before importing credentials. Use a private temporary keychain, restrict child environments with a job cleanup step for interruptions and only expose final images through the manifest.

The reusable verification workflow accepts an optional Action name. Push and pull request runs omit it and verify the full workspace. The release workflow passes the selected Action so verification runs that package's checks, build and tests; `changelog` also runs its packaged smoke check unless the caller explicitly skips it, while `build-macos` runs macOS runner verification. The publication workflow installs the lockfile dependencies and rebuilds the selected Action from the source commit. The release script adds only that build's ignored `dist` directory to the independent snapshot tree, leaving generated bundles out of the source branch. The release snapshot carries the selected Action output.

### Scheme discovery

Probe each scheme independently when the caller omits `scheme`. Record failed probes and continue searching. Select a sole usable macOS scheme and log any probe failures. If no scheme qualifies, include the recorded errors in the failure. If multiple schemes qualify, list the candidates. An explicit scheme bypasses discovery.

### App version

Require at least one of `version` and `version-type`. When only `version` is supplied, use it directly. With `version-type` set to `major`, `minor` or `patch`, apply the same `X.Y.Z` increment rules as `changelog` to the explicit `version` or, if omitted, to the main app target's `MARKETING_VERSION` from the selected Xcode configuration. Resolve the version once before building and use it for all selected architectures. Fail before building when both inputs are omitted or a supplied value or required base is invalid.

The resolved version applies to both `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` for this run, and the Action verifies both in the built app. After all packages pass verification, the Action returns the resolved `version` alongside `packages-json`. The caller owns persistent version changes and tags. The same base version and increment type yield the same result on retries.

For a combined workflow, pass the `changelog` output `version` directly to `build-macos` and omit `version-type`. For a separate run after PR approval, pass the final version from the merged changelog record the same way.

### Embedded code
Discover executable bundles, physical framework versions and standalone Mach-O code inside the app. Match Xcode products by product name and, for bundles, bundle identifier. Read each target’s resolved entitlement file before importing the identity. For prebuilt code, preserve the entitlements of the selected slices. Universal slices with conflicting permissions cannot share a signing configuration.

Perform all thinning and signing on a staging copy. Require every executable to contain all selected architectures and strip extra slices from embedded binaries before signing. Sign children before their enclosing bundle, verify each signature and verify the complete app before creating the image.

The optional Base64 provisioning profile belongs to the main app. A component that needs authorization must embed its own matching Developer ID profile during the project build. Validate each profile against the signing identity, bundle identifier and requested entitlements.

## Risks / Trade-offs
Xcode project scripts must be trusted. Production notarization requires Apple credentials and external service availability.
