## Purpose

Provide a directly executable GitHub Action for bilingual Apple release notes with independent action versions in the same repository.

## ADDED Requirements

### Requirement: Changelog compatibility
The Action SHALL preserve the documented seven inputs, nine outputs, draft reuse order, atomic catalog updates and drift checks.

#### Scenario: Existing pull request
- **WHEN** the version has an open release PR
- **THEN** return its URL with pr-created false, zero counts and empty preview paths and source SHA.

#### Scenario: New draft or existing branch
- **WHEN** a release needs a draft PR
- **THEN** reuse a valid branch draft before generating notes, preserve published history and report the final previews.

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

