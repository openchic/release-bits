## MODIFIED Requirements

### Requirement: Changelog compatibility

The Action SHALL preserve draft reuse order, atomic catalog updates and drift checks while exposing four outputs: `pr-url`, `pr-created`, `version` and `branch`. It SHALL include available bilingual notes in the job summary and report style warnings through GitHub annotations.

#### Scenario: Existing pull request

- **WHEN** the version has an open release PR
- **THEN** return its URL with `pr-created` false and the effective version and branch, without generating preview files

#### Scenario: New draft or existing branch

- **WHEN** a release needs a draft PR
- **THEN** reuse a valid branch draft before generating notes, preserve published history and report the final bilingual preview in the job summary

#### Scenario: Style warnings

- **WHEN** generated or reused notes have style warnings
- **THEN** report each warning through a GitHub annotation without adding a warning-count output
