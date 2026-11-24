## Context

The release-notes example currently listens for `pull_request.closed` and embeds a shell script to query and delete the head branch. The branch eligibility checks live in the caller job. ReleaseBits publishes Actions from versioned snapshots under `actions/<name>/`, and requires each published Action to include a built `dist/` directory.

## Goals / Non-Goals

**Goals:** Move event, repository and branch filtering plus idempotent deletion into a reusable Node.js 24 Action. Keep the caller responsible for subscribing to the pull request event and granting `contents: write`.

**Non-Goals:** Create a commit, PR or Release; checkout repository contents; delete branches outside the `changelogs/` prefix; add Action inputs or outputs.

## Decisions

- Add `actions/changelog-cleanup` as a normal Node.js Action so it can be published and referenced with the existing `@v1` snapshot mechanism.
- Use `@actions/github` context for `eventName`, the closed event payload and repository identity. Evaluate all skip conditions before reading `GITHUB_TOKEN` or creating an API client.
- Delete the head ref with Octokit. A 404 is idempotent success. Other API failures fail the step.
- Run cleanup for both merged and unmerged PR closures. The caller's `branches` trigger filter controls the base branch.
- Update the example to call the Action without a job-level condition; the Action logs a concise skip reason for unrelated PRs.
- Expose only `pr-url`, `pr-created`, `version` and `branch` from the prepare Action. Pass validated notes directly to the job summary instead of writing temporary preview files. Keep warning details as GitHub annotations.

## Risks / Trade-offs

- The Action needs `contents: write`, so the caller must grant that permission to the cleanup job or workflow.
- Workflows still declare `pull_request.closed` because Actions do not subscribe to repository events themselves.
