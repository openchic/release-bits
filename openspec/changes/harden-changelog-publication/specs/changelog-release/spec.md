## MODIFIED Requirements

### Requirement: Create and publish a versioned Release
The Action SHALL select the tag using optional `tag-name`, defaulting to `v{version}`. An explicitly supplied tag SHALL already exist. When using the default tag, the Action SHALL create it if neither the tag nor its Release exists. An existing tag SHALL resolve to the checked-out commit, including annotated tags. The Action SHALL check for a unique Release for the selected tag before writing. The Release SHALL be named after the selected tag and contain the formatted English notes. The Action SHALL require `GITHUB_TOKEN` with `contents: write`.

#### Scenario: Publish a Release without assets
- **WHEN** the catalog entry is valid and no tag or Release exists for the version
- **THEN** create the tag at the checked-out commit, publish the Release with the English notes, and return its URL

#### Scenario: Existing version tag
- **WHEN** an explicit or default remote tag resolves to the checked-out commit
- **THEN** use that tag to find, create or continue the Release

#### Scenario: Existing tag or Release
- **WHEN** the explicit tag is missing, a Release lacks its tag, the remote tag targets another commit, or multiple Releases match the tag
- **THEN** fail without replacing the tag or modifying the Releases

#### Scenario: Release publication was completed before the caller received the response
- **WHEN** a published Release matches the requested tag, title, notes and complete set of assets
- **THEN** return its URL and outputs without modifying the Release

#### Scenario: Release API failure
- **WHEN** GitHub rejects creation or publication
- **THEN** fail the Action and report the API error, identifying the selected tag and the draft URL when available

### Requirement: Validate and upload multiple assets
The Action SHALL accept an optional newline-separated list of repository-relative file paths. It SHALL allow at most 1,000 regular files, each smaller than 2 GiB, and reject paths outside the repository and duplicate asset filenames. It SHALL stage and hash copies of the requested files before writing to GitHub, use the staged copies for uploads and clean up those copies after the operation. The Action SHALL record a draft fingerprint of the requested publication and validate it before resuming. It SHALL recheck the complete attachment set, tag and draft body before publishing. Publication SHALL remove the draft fingerprint from the body.

#### Scenario: Upload multiple files
- **WHEN** multiple valid files are supplied
- **THEN** upload each file to the same Release before publishing it

#### Scenario: Invalid asset path
- **WHEN** any requested file is missing, is not a regular file, escapes the repository root or collides by filename
- **THEN** fail before creating a tag or Release

#### Scenario: Asset upload fails
- **WHEN** GitHub rejects an upload or a file cannot be read after creating the draft Release
- **THEN** fail, leave that Release unpublished and report the draft URL

#### Scenario: Retry partial upload
- **WHEN** the existing draft fingerprint matches and one or more requested assets are missing or have an empty `starter` placeholder
- **THEN** retain checksum-matching assets, remove matching empty placeholders, upload the missing files and publish after verifying all assets

#### Scenario: Retry with changed inputs or remote content
- **WHEN** the draft fingerprint, the published Release contents, or an existing uploaded asset differs from the expected publication
- **THEN** fail without overwriting existing content

#### Scenario: Local attachment changes after staging
- **WHEN** the source attachment is modified or removed after staging, including replacement with the same size and modification time
- **THEN** upload the staged copy used to compute the attachment checksum

#### Scenario: Remote draft changes during publication
- **WHEN** the draft body or tag is edited during upload
- **THEN** fail without publishing the draft or overwriting the edited draft body

#### Scenario: Attachment quota exceeded
- **WHEN** more than 1,000 files are supplied or a file is at least 2 GiB
- **THEN** fail before creating a tag or Release
