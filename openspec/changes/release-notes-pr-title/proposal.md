## Why

Release-note PR titles currently use `docs: review v<version> release notes`. The requested release convention is `chore(release): add v<version> release notes`. Successful runs also need a job summary so users can find the PR and review the result from the workflow page.

## What Changes

- Use the requested title for every newly created release-note PR, including reused branch drafts.
- Document the title and verify it uses the effective release version.
- Add a success summary with the PR link in the review reminder, creation/reuse status, branch and available bilingual preview.
- Report summary write failures as warnings without failing completed PR preparation.
- Preserve existing open PRs and all generation, reuse and drift rules.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `changelog-action`: Specify release-note PR titles and successful workflow summaries.

## Impact

Changes the changelog Action's PR title, success reporting, tests, documentation and bundled entry point. No new inputs, outputs or dependencies.
