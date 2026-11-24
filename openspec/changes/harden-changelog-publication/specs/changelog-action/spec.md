## MODIFIED Requirements

### Requirement: Independent promotion
A release SHALL update only the selected action directory on its major snapshot and provide an action-specific fixed version. Dependency installation, compilation and verification SHALL run with read-only repository permissions. The publish job SHALL use the verified bundle by artifact ID, validate its checkout SHA, and stage only regular files under the selected Action's distribution directory. A queued release SHALL preserve sibling Action version bumps already on `main` while publishing the selected Action built from the verified source. If `main` has diverged from that source or contains other file changes, the queued release SHALL stop before updating remote refs and request a new run.

#### Scenario: Package version matches release
- **WHEN** an Action release snapshot is created
- **THEN** its `package.json` version matches the fixed release tag and the version change is committed to `main`.

#### Scenario: Version commit and tags publish together
- **WHEN** the selected Action is released
- **THEN** the workflow uses `pnpm version` to bump its package, then atomically pushes the `main` version commit, action-specific fixed tag and moving major snapshot tag.

#### Scenario: Release notes list action changes
- **WHEN** the GitHub Release is created
- **THEN** its notes group that Action's conventional `feat` and `fix` commits into separate sections.

#### Scenario: Consumer runs the published action
- **WHEN** a workflow references the action by its release tag
- **THEN** the runner can execute the bundled entry point without installing pnpm or the workspace dependencies.

#### Scenario: Two actions share v1
- **WHEN** one action moves to a later v1 patch
- **THEN** all sibling action trees on v1 and all other major tags retain their prior content.

#### Scenario: A second major starts
- **WHEN** an action first releases v2
- **THEN** its directory is available on v2 while changelog remains callable at v1.

#### Scenario: Several actions queue at the same source
- **WHEN** queued publications for distinct Actions were verified at the same source and only their version changes have advanced `main`
- **THEN** each version commit follows the current `main` and the source of every snapshot is the verified commit.

#### Scenario: The source changes while a release is queued
- **WHEN** the verified source is no longer an ancestor of `main`, or `main` has changes beyond version fields of sibling Actions
- **THEN** stop without publishing and request a new run.

#### Scenario: Verified bundle does not match the publication
- **WHEN** the verified artifact is missing, its checkout SHA differs from the dispatch SHA, or its distribution contains non-regular entries
- **THEN** fail before updating remote refs.

### Requirement: Source-scoped test workflow
The repository test workflow SHALL be named `Test actions` and use step names that consistently use `Verify` to distinguish workspace checks, packaged action execution and output verification. Pushes to `main` and pull requests SHALL run the workflow only when files under `actions/`, `shared/`, `scripts/`, `.github/workflows/`, or the root package workspace manifests change. The workflow SHALL remain callable through `workflow_call` without path filtering. The reusable workflow SHALL allow callers to skip the packaged action smoke steps through the `skip-action-smoke-test` input while retaining workspace checks and tests.

#### Scenario: Source changes
- **WHEN** a push to `main` or pull request changes a source, test, workflow or workspace manifest file covered by these paths
- **THEN** the test workflow runs, including for changes confined to `shared/`.

#### Scenario: Documentation-only changes
- **WHEN** a push to `main` or pull request changes only documentation
- **THEN** the test workflow is skipped.

#### Scenario: Release workflow calls tests
- **WHEN** the release workflow calls the test workflow through `workflow_call` with `skip-action-smoke-test` enabled
- **THEN** workspace checks and tests run while the packaged Action invocation and runner output check are skipped.

## ADDED Requirements

### Requirement: Restrict changelog credential exposure
The changelog Action SHALL exclude `GITHUB_TOKEN` and `LLM_API_KEY` from Git subprocess environments and SHALL report Git failures without including subprocess diagnostics. Before requesting generated notes, it SHALL check eligible commit subjects and bodies for configured credential values and recognized credential formats.

#### Scenario: Git runs with checkout authentication
- **WHEN** the Action invokes Git to read history or update the draft branch
- **THEN** preserve checkout authentication configuration while omitting the Action credential variables from the child environment.

#### Scenario: Git reports a diagnostic containing sensitive data
- **WHEN** Git fails with a diagnostic on stderr
- **THEN** report the operation and exit status without forwarding the diagnostic.

#### Scenario: Commit evidence contains a possible credential
- **WHEN** an eligible commit subject or body matches a configured credential value or a recognized credential format, including a Gemini Auth Key or a standard Google API key
- **THEN** stop before sending the request to Gemini or writing the draft, and identify only the commit and field.
