## Context

`prepare.ts` creates PRs through a shared call after either generation or branch-draft reuse. Existing open PRs return before that call. See proposal.md for motivation.

## Goals / Non-Goals

Use the effective version at the shared creation point. Keep catalog commit subjects and existing PRs unchanged.

The entry point reports the completed result only after preparation succeeds; summary rendering belongs in its own module so the entry remains a dispatcher.

## Decisions

Compute the release PR title once and use it for both the generated catalog commit and PR creation. Reused branch drafts keep their existing commits. Test the observable title through the existing PR adapter and rebuild the checked-in bundle.

Append Markdown through `core.summary` using the existing preparation outputs and final preview file. Derive the output type from `prepare` instead of duplicating it. Keep bold creation/reuse status and branch labels together in a list, then put the linked English review instruction in a separate paragraph. Omit the redundant release-version heading and source/count metrics. Include final bilingual notes when available. Catch summary failures inside the reporting module and emit a warning; PR preparation and output reporting have already succeeded.

Use event-level `paths` filters for pushes and pull requests so the test workflow runs only for source, workflow and workspace manifest changes. Keep `workflow_call` unfiltered so the release workflow still runs its verification job.

Use `Test actions` as the workflow display name so it identifies the checked subject while staying concise.

Use a consistent `Verify` prefix for `Verify action workspace`, `Verify packaged action`, and `Verify action outputs`, while keeping each step's target distinct.

Name the release step `Publish selected action` to describe the selected target concisely.

The release caller passes `skip-action-smoke-test: true`. The reusable workflow continues install, check, build and test steps, but skips the direct packaged Action invocation and its runner output assertion to keep the fixture PR summary out of the release run.

## Risks / Trade-offs

If `Test actions` is configured as a required check, skipping it for documentation-only changes may leave the check pending and block merging. Already open release-note PRs retain their previous titles, consistent with the existing reuse contract.

## Verification

Title behavior passed type checking, bundle generation and the original nine tests under Node.js 24.22.3 and pnpm 11.9.0. Summary verification is tracked in tasks.md. PR creation and Gemini generation use local adapters; no real GitHub PR or Gemini request was made.
