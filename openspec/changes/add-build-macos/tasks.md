## 1. Action
- [x] 1.1 Resolve optional inputs, build unsigned products and check CPU slices.
- [x] 1.2 Implement isolated credentials, profile validation, signing, notarization and manifest output.
- [x] 1.3 Resolve component entitlements, thin staging copies and sign nested code inside out.

## 2. Integration
- [x] 2.1 Connect independent publication, document inputs and add a caller example.
- [x] 2.2 Verify workspace, YAML, fixture builds, failure paths and secret handling.
- [x] 2.3 Verify nested signatures, per-component permissions, staging-only thinning and profile isolation.
- [x] 2.4 Build the selected Action during publication and include its generated distribution in the release snapshot.
- [x] 2.5 Make reusable release verification Action-aware while keeping push and pull request checks comprehensive.

## 3. App version increments
- [x] 3.1 Require at least one version input and resolve the direct version or increment once before building.
- [x] 3.2 Verify direct versions from changelog, increments from explicit and Xcode bases, missing and invalid inputs, and consistency across selected architectures.
- [x] 3.3 Update the input table and show the version inputs in the workflow example after implementation.
- [x] 3.4 Return the effective version after successful packaging and verify the GitHub output contract.

## 4. Scheme discovery
- [x] 4.1 Continue scheme discovery after individual probe failures and verify automatic and explicit selection.

## 5. Release snapshot metadata
- [x] 5.1 Use the `release-bits-` prefix for release metadata and verify retries and release notes.

## 6. Explicit main app profile App ID
- [x] 6.1 Add the `explicit-profile-app-id` input with a `false` default and enforce exact main app profile App ID matching before main app signing or disk image creation.
- [x] 6.2 Test enabled and disabled behavior, missing and wildcard profile App IDs, wildcard Keychain group authorization, component profile independence and signing failure order. Update the Action input, user documentation and caller example.

## Verification record

Node.js 24 workspace checks, builds and all 23 tests passed on macOS before the release-time build change. Xcode built the fixture for all three selections. A disposable P12 signed and verified all three DMGs, including a versioned framework, XPC service, extension, helper app and standalone library. Verified architecture errors, retained prebuilt permissions and independent provisioning-profile validation. Production Developer ID, Apple notarization, ticket stapling and Gatekeeper acceptance require a release run with team credentials.

Both Actions passed type checks and bundled successfully with Node.js 24. All 17 macOS Action tests, 10 changelog Action tests and the release script test passed. The packaged macOS entry was exercised with all four combinations of version inputs. The tests checked both version fields in real unsigned apps for the three valid combinations and confirmed that omitting both inputs failed before building. The Xcode fixture also produced version and build number 2.5.0 on all three architectures from project version 2.4.0 and a minor increment. Action and example YAML parsed successfully.

The explicit profile App ID input passed the macOS Action type check and bundle build. All five signing tests passed, including exact matching with wildcard Keychain authorization, rejection of missing, wildcard and mismatched App IDs, component-specific profile validation, and failure before main app signing or DMG creation. Six non-Xcode build tests, three packaged-entry tests covering omitted, `true` and `false` input values, Action and example YAML parsing, OpenSpec validation and `git diff --check` passed. The full package suite was attempted, but Xcode integration tests could not access CoreSimulator and the host DerivedData directory in this environment.

After adding the version output, the macOS Action type check, bundle build and all seven entry tests passed. The success case used a simulated packaging result and the real GitHub output writer. The existing failure cases continued to leave the output file empty.

After updating scheme discovery, the macOS Action type check and both scheme discovery tests passed. The tests simulated a failed probe, an iOS scheme, a usable macOS scheme and an explicitly selected scheme.

The follow-up profile App ID tests and type check passed. The entry test verified the boolean passed to `prepare` for omitted, `false` and `true` inputs. The signing test verified that an extension with a wildcard App ID profile still passes when the main app requires an exact App ID.

The release script test passed with the `release-bits-` metadata. It verified release retries and incremental release notes.
