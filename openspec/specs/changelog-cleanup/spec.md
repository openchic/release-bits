# Changelog Cleanup Specification

## Purpose

Remove temporary changelog branches after their pull requests close so repositories do not retain unused release-note branches.

## Requirements

### Requirement: Changelog branch cleanup
The Action SHALL inspect the GitHub Actions event context and delete the head branch when a same-repository pull request targeting a caller-selected base branch is closed and its head branch starts with `changelogs/`. It SHALL apply to merged and unmerged pull requests. It SHALL skip other events, fork pull requests and branches outside the prefix. It SHALL treat a missing head branch as success and fail on other GitHub API errors. The Action SHALL require `GITHUB_TOKEN` only when deletion is needed and SHALL NOT modify repository files or create commits, pull requests or releases.

#### Scenario: Delete a merged changelog branch
- **WHEN** a same-repository pull request with a `changelogs/` head branch is closed as merged
- **THEN** delete its head branch

#### Scenario: Delete an unmerged changelog branch
- **WHEN** a same-repository pull request with a `changelogs/` head branch is closed without merging
- **THEN** delete its head branch

#### Scenario: Skip an unrelated pull request
- **WHEN** the pull request comes from a fork or its head branch is outside `changelogs/`
- **THEN** succeed without calling the delete-ref API

#### Scenario: Skip another event
- **WHEN** the Action is invoked by an event other than `pull_request.closed`
- **THEN** succeed without calling the delete-ref API

#### Scenario: Branch already deleted
- **WHEN** the delete-ref API returns 404
- **THEN** succeed because the desired state already holds

#### Scenario: API deletion fails
- **WHEN** the delete-ref API fails with an error other than 404
- **THEN** fail the Action and report the error
