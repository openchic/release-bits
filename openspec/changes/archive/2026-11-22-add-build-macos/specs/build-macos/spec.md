## Purpose
Provide a reusable macOS runner Action for producing distributable, notarized disk images from an Xcode application.

## ADDED Requirements

### Requirement: Resolve build inputs
The Action SHALL honor explicit inputs and discover a unique project or workspace, macOS App scheme, product and configured entitlements when omitted.

#### Scenario: Ambiguous schemes
- **WHEN** multiple schemes build applications and scheme is omitted
- **THEN** fail with candidates and request the scheme input.

#### Scenario: A scheme probe fails
- **WHEN** scheme is omitted and reading build settings fails for a candidate
- **THEN** continue probing other schemes. If exactly one usable macOS App scheme is found, select it and log the failure. If none is found, report the probe failure with the scheme name.

### Requirement: Resolve the app version
The Action SHALL require at least one of `version` and `version-type`. It SHALL use `version` directly when `version-type` is omitted. When `version-type` is supplied, it SHALL accept `major`, `minor` or `patch` and apply the same `X.Y.Z` arithmetic as `changelog`. It SHALL resolve the version once per invocation and use it as both the app release version and build number across all selected architectures without updating project files.

#### Scenario: Increment the Xcode version
- **WHEN** `version-type` is `patch`, `version` is omitted and the selected main app target has `MARKETING_VERSION` set to `1.2.3`
- **THEN** use `1.2.4` as the app release version, build number and DMG filename version.

#### Scenario: Increment an explicit base version
- **WHEN** `version` is `2.0.0` and `version-type` is `minor`
- **THEN** use `2.1.0` regardless of the version set in the Xcode project.

#### Scenario: Use the final version from changelog
- **WHEN** the caller passes the resolved changelog version in `version` and omits `version-type`
- **THEN** the packages use that version directly.

#### Scenario: Missing or invalid version settings
- **WHEN** both inputs are omitted, a supplied value is invalid, or an increment requires a missing or invalid base version
- **THEN** fail before building with an error identifying the missing or invalid setting.

### Requirement: Architecture selection and package manifest
The Action SHALL default to Universal if all switches are omitted, build each explicitly selected package, verify architectures, and publish the effective `version` and a single `packages-json` array after all files pass notarization, stapling and Gatekeeper.

#### Scenario: All architectures
- **WHEN** universal, intel and apple-silicon are true
- **THEN** return the common version and three distinct DMGs with architecture, absolute path, filename, final SHA-256 and byte size.

#### Scenario: No selection or failed package
- **WHEN** all supplied switches are false or a selected package fails
- **THEN** fail without publishing either output.

### Requirement: Protect signing credentials
The Action SHALL keep secret material out of subprocess arguments, build script environments, logs, outputs and artifacts, clean temporary credentials and verify the signed application against its provisioning profile where required.

#### Scenario: Unsigned build precedes signing
- **WHEN** project build scripts run
- **THEN** Apple credentials are absent from their environment and the signing identity has not been imported.

#### Scenario: Notarization rejected
- **WHEN** Apple rejects an image
- **THEN** report its submission ID, fail and clean temporary signing resources.

### Requirement: Optionally require an explicit main app profile App ID
The Action SHALL accept the boolean input `explicit-profile-app-id`, defaulting to `false`. When enabled, it SHALL require a provisioning profile for the main app and require the profile's `com.apple.application-identifier` to exactly equal its `ApplicationIdentifierPrefix` plus the built main app's `CFBundleIdentifier`. This requirement SHALL be checked before signing the main app or creating its disk image. It SHALL apply only to the main app's application identifier. Keychain access groups SHALL continue to use wildcard authorization, and embedded components SHALL continue to use their own profile validation.

#### Scenario: Exact App ID with wildcard Keychain authorization
- **WHEN** strict matching is enabled, the main app profile explicitly authorizes the built app's identifier, and the profile wildcard-authorizes the requested Keychain access group
- **THEN** sign the app with its concrete Keychain access group.

#### Scenario: Missing or non-explicit main app profile App ID
- **WHEN** strict matching is enabled and the main app profile is missing, its application identifier is missing or wildcarded, or it does not match the built app's identifier
- **THEN** fail with an error identifying the main app Bundle ID and reason before signing the main app or creating its disk image.

#### Scenario: Existing wildcard profile compatibility
- **WHEN** strict matching is disabled and the profile wildcard-authorizes the main app's application identifier
- **THEN** preserve the existing wildcard authorization behavior.

### Requirement: Package embedded code
The Action SHALL sign nested code before its enclosing bundle, use each component’s own entitlements, and verify the complete app before creating a DMG.

#### Scenario: Embedded target or prebuilt code
- **WHEN** an application embeds frameworks, helpers, XPC services, extensions or standalone dynamic libraries
- **THEN** sign each component and each physical framework version with the distribution identity. Use its target entitlements when available and otherwise preserve its selected slices’ existing entitlements. Fail on conflicting entitlements across selected slices.

#### Scenario: Dependency architectures
- **WHEN** an embedded binary contains every requested architecture and extra slices
- **THEN** remove the extra slices in the staging copy and leave the original binary intact.
- **WHEN** any required slice is missing
- **THEN** report the component and missing architecture and fail before creating its image.

#### Scenario: Component-specific authorization
- **WHEN** an embedded component requests a profile-authorized entitlement
- **THEN** validate that component’s own embedded profile against its bundle ID, team, signing certificate and requested rights. Fail if authorization is missing. Apply the single environment-supplied profile only to the main app.

### Requirement: Publish the built Action
The release workflow SHALL build the selected Action from the source commit and include its generated `dist` directory in the release snapshot without adding generated files to the source branch.

#### Scenario: Successful publication build
- **WHEN** the selected Action builds successfully
- **THEN** include that build’s entry points, runtime assets and license notices in its versioned snapshot.

#### Scenario: Publication build fails
- **WHEN** building the selected Action fails
- **THEN** do not create its version commit or update release tags.

#### Scenario: Release metadata uses the repository name
- **WHEN** the release workflow creates a version commit and snapshot
- **THEN** write metadata using the `release-bits-` prefix.
- **WHEN** the workflow reads a previously published snapshot
- **THEN** read its source trailer when resuming a release or generating release notes.

### Requirement: Verify the selected Action before publication
The reusable release verification workflow SHALL run checks for the selected Action before publication. Push and pull request runs SHALL continue to verify the full workspace.

#### Scenario: Publish changelog
- **WHEN** the release workflow selects `changelog`
- **THEN** run its package checks, build, tests and packaged Action smoke check unless the caller sets `skip-action-smoke-test`, without running macOS-specific verification.

#### Scenario: Publish build-macos
- **WHEN** the release workflow selects `build-macos`
- **THEN** run its package checks, build, tests and macOS runner verification without running the changelog Action smoke check.

#### Scenario: Verify the workspace
- **WHEN** the workflow runs for a push or pull request without a selected Action
- **THEN** run the complete workspace checks, packaged changelog smoke check unless skipped by the caller, and macOS runner verification.
