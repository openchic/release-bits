## Context

ReleaseBits Actions use Node.js 24, TypeScript, Rollup bundles and `actions/<name>/` packages. The caller's checked-out repository contains both the catalog and any files prepared for release. See proposal.md for motivation and specs/changelog-release/spec.md for the behavior contract.

## Goals / Non-Goals

**Goals:**
- Keep catalog reading and GitHub Release publication in a standalone Action that works with any producer of the documented catalog format.
- Validate all local inputs and assets before mutating GitHub.
- Keep the published Release complete by using a draft while assets upload.

**Non-Goals:**
- Subscribe to pull request events or decide whether a release workflow should run.
- Build, sign, notarize or create appcast data for project-specific artifacts.
- Infer a version from a branch name, another Action's output or catalog ordering.

## Decisions

- Add `actions/changelog-release/` as a normal Node.js 24 Action. Use the existing `@actions/core` and `@actions/github` dependencies and Rollup distribution helper so the published snapshot runs without installing workspace dependencies.
- Require `version`; default `catalog-path` to `changelogs.json`; parse `files` as a newline-separated list. Resolve catalog and asset paths from `GITHUB_WORKSPACE`, reject traversal or symlinks outside the workspace, and require each asset to be a readable regular file. Reject duplicate basenames because Release asset names are flat.
- Parse the catalog locally and require exactly one matching version with non-empty English strings. Format each string as a Markdown bullet. Do not call the changelog Action or infer values from the event payload.
- Use Octokit to check for an existing `v{version}` tag and Release before any write. If either exists, fail without modifying it. Create a draft Release targeting the checked-out `HEAD` commit, upload all validated files as binary assets, then publish the draft. Return outputs only after publication.
- If an upload or publish call fails after draft creation, leave the draft unpublished and include its URL in the failure message. This preserves an inspection point and avoids publishing a Release with a partial asset set; the caller must resolve the draft before retrying.
- Upload files as streams to avoid holding large disk images in memory. Pass the token only through the Octokit client, never through command-line arguments or logs.
- Keep `pull_request.closed`, merged-PR gating and checkout of `merge_commit_sha` in caller workflows. Projects must build assets before this Action when using `GITHUB_TOKEN`, because a Release created with that token will not start another workflow run for the resulting event.
- Add the Action to the manual publication selector and workspace verification workflow. Test the API sequence through injected fakes, and run the packaged action against a mocked GitHub client.

## Risks / Trade-offs

- A failed upload leaves a draft Release and tag → Log the draft URL and fail without publishing; the user can inspect and remove or resolve it before retrying.
- Two concurrent runs may pass the read-only existence checks → GitHub's unique tag/release constraint rejects one create; report the conflict without updating the winner.
- The action's GitHub Release operation can succeed while a later caller-owned appcast step fails → Return `release-url` and `notes-en` for caller recovery; do not roll back a published Release.
- `GITHUB_TOKEN` does not trigger a second release-event workflow → Build and upload in the same run, or let the caller supply a GitHub App or personal access token.

## Migration Plan

1. Add the Action package, tests, workspace checks and publication selector.
2. Update the standalone Action contract and post-merge example in docs/changelog-release.md.
3. Consumer projects can adopt it after publishing the Action snapshot; existing release workflows remain independent until callers opt in.
