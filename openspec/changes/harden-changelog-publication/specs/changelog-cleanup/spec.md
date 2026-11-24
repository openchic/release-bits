## MODIFIED Requirements

### Requirement: Changelog branch cleanup
The Action SHALL inspect the GitHub Actions event context and delete the head branch when a same-repository pull request targeting a caller-selected base branch is closed and its head branch starts with `changelogs/`. Before requesting deletion, the Action SHALL verify that the branch SHA matches the closed event and that no open pull request uses that branch. It SHALL apply to merged and unmerged pull requests. It SHALL skip other events, fork pull requests, branches outside the prefix and events without a head SHA. It SHALL treat a missing head branch as success and fail on other GitHub API errors. For eligible events it SHALL require `GITHUB_TOKEN` with `pull-requests: read` and `contents: write`. It SHALL NOT modify repository files or create commits, pull requests or releases.

#### Scenario: Delete a merged changelog branch
- **WHEN** a same-repository pull request with a `changelogs/` head branch is closed as merged, the branch is unchanged, and no open pull request uses it
- **THEN** delete its head branch

#### Scenario: Delete an unmerged changelog branch
- **WHEN** a same-repository pull request with a `changelogs/` head branch is closed without merging, the branch is unchanged, and no open pull request uses it
- **THEN** delete its head branch

#### Scenario: Skip an unrelated pull request
- **WHEN** the pull request comes from a fork or its head branch is outside `changelogs/`
- **THEN** succeed without calling the delete-ref API

#### Scenario: Skip another event
- **WHEN** the Action is invoked by an event other than `pull_request.closed`
- **THEN** succeed without calling the delete-ref API

#### Scenario: Branch already deleted
- **WHEN** reading or deleting the head ref returns 404
- **THEN** succeed because the desired state already holds

#### Scenario: API deletion fails
- **WHEN** the delete-ref API fails with an error other than 404
- **THEN** fail the Action and report the error

#### Scenario: Branch has moved or is in use
- **WHEN** the branch has a different head SHA from the event, or an open pull request uses it
- **THEN** succeed without requesting deletion

## ADDED Requirements

### Requirement: Verify and publish the cleanup Action
The repository SHALL make `changelog-cleanup` selectable in the Action publication workflow and verify its types, bundle and tests before publication. The same checks SHALL run as part of ordinary repository CI.

#### Scenario: Publish cleanup
- **WHEN** the maintainer selects `changelog-cleanup` for publication
- **THEN** the workflow verifies and builds the selected package before publishing its snapshot.
