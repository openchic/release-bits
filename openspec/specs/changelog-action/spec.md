# Changelog Action Specification

## Purpose

Provide a directly executable GitHub Action for bilingual Apple release notes with independent action versions in the same repository.

## Requirements

### Requirement: Changelog compatibility
The Action SHALL preserve the documented seven inputs, nine outputs, draft reuse order, atomic catalog updates and drift checks.

#### Scenario: Existing pull request
- **WHEN** the version has an open release PR
- **THEN** return its URL with pr-created false, zero counts and empty preview paths and source SHA.

#### Scenario: New draft or existing branch
- **WHEN** a release needs a draft PR
- **THEN** reuse a valid branch draft before generating notes, preserve published history and report the final previews.

### Requirement: Runtime credential names
The Action SHALL read its GitHub API token from `GITHUB_TOKEN` and its language model API key from `LLM_API_KEY`.

#### Scenario: Missing GitHub token
- **WHEN** the Action starts without `GITHUB_TOKEN`
- **THEN** fail with an error that names `GITHUB_TOKEN`.

#### Scenario: Missing model key
- **WHEN** the Action needs to generate notes and `LLM_API_KEY` is missing
- **THEN** fail with an error that names `LLM_API_KEY`.

### Requirement: Independent promotion
A release SHALL update only the selected action directory on its major snapshot and provide an action-specific fixed version.

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

### Requirement: Release-note PR title
The Action SHALL title newly created release-note PRs and the commit that generates a new catalog draft `chore(release): add v<version> release notes`, using the effective release version. When it reuses a branch draft, it SHALL preserve that branch's existing commits. It SHALL preserve existing open PRs.

#### Scenario: Generate a new draft
- **WHEN** the Action generates notes for version `0.1.0` and creates a PR
- **THEN** both the PR title and catalog commit subject are `chore(release): add v0.1.0 release notes`.

#### Scenario: Reuse a branch draft
- **WHEN** a valid remote branch draft exists without an open PR
- **THEN** the newly created PR uses the same title format without regenerating notes or rewriting existing commits.

#### Scenario: Apply a version increment
- **WHEN** `version` is `1.0.0` and `version-type` is `minor`
- **THEN** the newly created PR title is `chore(release): add v1.1.0 release notes`.

#### Scenario: Reuse an open PR
- **WHEN** an open release-note PR already exists
- **THEN** the Action returns its URL without changing its title.

### Requirement: Successful job summary
After successful PR preparation, the Action SHALL append a GitHub Actions job summary containing a list with the PR creation/reuse status and release branch, followed by a standalone clickable PR link whose text is `Please review the PR. Merging it approves the release notes.` When preview data is available, it SHALL also show the bilingual preview. The summary SHALL omit the release-version heading, source SHA, contributing commit count and warning count. Summary write failures SHALL produce a warning without failing completed preparation. A failed preparation SHALL NOT write a success summary.

#### Scenario: Prepared draft
- **WHEN** a run creates a PR from generated notes or a valid branch draft
- **THEN** the summary lists the PR status and branch, shows the linked review reminder as a standalone paragraph, and includes the final bilingual preview without a release-version heading, source SHA or counts.

#### Scenario: Existing open PR
- **WHEN** a run returns an existing open PR without inspecting its draft
- **THEN** the summary lists reused status and branch, shows the linked review reminder as a standalone paragraph and omits the unavailable preview.

#### Scenario: Summary unavailable
- **WHEN** preparation succeeds but the summary file cannot be written
- **THEN** the Action reports a warning and preserves its successful outputs.

#### Scenario: Preparation failed
- **WHEN** preparation fails before returning a PR result
- **THEN** no success summary is written.

### Requirement: Source-scoped test workflow
The repository test workflow SHALL be named `Test actions` and use step names that consistently use `Verify` to distinguish workspace checks, packaged action execution and output verification. Pushes to `main` and pull requests SHALL run the workflow only when files under `actions/`, `scripts/`, `.github/workflows/`, or the root package workspace manifests change. The workflow SHALL remain callable through `workflow_call` without path filtering. The reusable workflow SHALL allow callers to skip the packaged action smoke steps through the `skip-action-smoke-test` input while retaining workspace checks and tests.

#### Scenario: Source changes
- **WHEN** a push to `main` or pull request changes a source, test, workflow or workspace manifest file
- **THEN** the test workflow runs.

#### Scenario: Documentation-only changes
- **WHEN** a push to `main` or pull request changes only documentation
- **THEN** the test workflow is skipped.

#### Scenario: Release workflow calls tests
- **WHEN** the release workflow calls the test workflow through `workflow_call` with `skip-action-smoke-test` enabled
- **THEN** workspace checks and tests run while the packaged Action invocation and runner output check are skipped.

### Requirement: Release publication step name
The release workflow SHALL name its publication step `Publish selected action`.

#### Scenario: Publish an Action
- **WHEN** the release workflow publishes the selected Action
- **THEN** the step is displayed as `Publish selected action`.
