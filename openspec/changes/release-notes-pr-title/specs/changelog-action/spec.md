## ADDED Requirements

### Requirement: Release-note PR title
The Action SHALL title newly created release-note PRs `chore(release): add v<version> release notes`, using the effective release version. It SHALL preserve existing open PRs.

#### Scenario: Generate a new draft
- **WHEN** the Action generates notes for version `0.1.0` and creates a PR
- **THEN** the title is `chore(release): add v0.1.0 release notes`.

#### Scenario: Reuse a branch draft
- **WHEN** a valid remote branch draft exists without an open PR
- **THEN** the newly created PR uses the same title format without regenerating notes.

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
