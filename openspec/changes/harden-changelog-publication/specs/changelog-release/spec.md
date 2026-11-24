## MODIFIED Requirements

### Requirement: Create and publish a versioned Release
The Action SHALL check for draft and published Releases of the requested version before writing to GitHub. It SHALL create a new `v{version}` tag targeting the checked-out commit before creating a GitHub Release. The Release SHALL be named `v{version}` and contain the formatted English notes. The Action SHALL create the Release as a draft, upload all requested assets, and publish it only after every upload succeeds. It SHALL require `GITHUB_TOKEN` with `contents: write`. If the version tag or any Release already exists, it SHALL fail without modifying the existing resource.

#### Scenario: Publish a Release without assets
- **WHEN** the catalog entry is valid and no tag or Release exists for the version
- **THEN** create the tag at the checked-out commit, publish the Release with the English notes, and return its URL

#### Scenario: Existing tag or Release
- **WHEN** the version tag or a draft or published Release already exists, including a draft without a Git tag
- **THEN** fail without changing it or creating another Release

#### Scenario: Concurrent tag creation
- **WHEN** another run creates the same tag before this Action can create it
- **THEN** this Action fails without creating a draft Release

#### Scenario: Release API failure
- **WHEN** GitHub rejects creation or publication
- **THEN** fail the Action and report the API error, identifying the created tag and the draft URL when available

### Requirement: Validate and upload multiple assets
The Action SHALL accept an optional newline-separated list of repository-relative file paths. It SHALL allow at most 1,000 regular files, each smaller than 2 GiB, reject paths outside the repository and duplicate asset filenames, and validate every requested file before creating a tag or Release. It SHALL upload every validated file to the same draft Release. If an upload fails, it SHALL fail and leave the Release unpublished.

#### Scenario: Upload multiple files
- **WHEN** multiple valid files are supplied
- **THEN** upload each file to the same Release before publishing it

#### Scenario: Invalid asset path
- **WHEN** any requested file is missing, is not a regular file, escapes the repository root or collides by filename
- **THEN** fail before creating a tag or Release

#### Scenario: Asset upload fails
- **WHEN** GitHub rejects an upload or a file cannot be read after creating the draft Release
- **THEN** fail, leave that Release unpublished and report the draft URL

#### Scenario: Attachment quota exceeded
- **WHEN** more than 1,000 files are supplied or a file is at least 2 GiB
- **THEN** fail before creating a tag or Release
