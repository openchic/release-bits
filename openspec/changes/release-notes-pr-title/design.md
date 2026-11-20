## Context

`prepare.ts` creates PRs through a shared call after either generation or branch-draft reuse. Existing open PRs return before that call. See proposal.md for motivation.

## Goals / Non-Goals

Use the effective version at the shared creation point. Keep catalog commit subjects and existing PRs unchanged.

The entry point reports the completed result only after preparation succeeds; summary rendering belongs in its own module so the entry remains a dispatcher.

## Decisions

Replace the fixed title prefix at PR creation rather than adding a configurable input or a helper for one string. Test the observable title through the existing PR adapter and rebuild the checked-in bundle.

Append Markdown through `core.summary` using the existing preparation outputs and final preview file. Derive the output type from `prepare` instead of duplicating it. Keep bold creation/reuse status and branch labels together in a list, then put the linked English review instruction in a separate paragraph. Omit the redundant release-version heading and source/count metrics. Include final bilingual notes when available. Catch summary failures inside the reporting module and emit a warning; PR preparation and output reporting have already succeeded.

## Risks / Trade-offs

Already open PRs retain their previous titles, consistent with the existing reuse contract.

## Verification

Title behavior passed type checking, bundle generation and the original nine tests under Node.js 24.22.3 and pnpm 11.9.0. Summary verification is tracked in tasks.md. PR creation and Gemini generation use local adapters; no real GitHub PR or Gemini request was made.
