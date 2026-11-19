## Context

Changelog reads consumer repository history, generates bilingual notes and opens or reuses a draft PR.

## Goals / Non-Goals

Preserve inputs, outputs, catalog history and manual edits. Deliver changelog first.

## Decisions

Declare each action’s dependencies in its own package. A root pnpm workspace includes `actions/*` and runs their build, check and test scripts. Release snapshots contain the selected bundled action, which can execute without installing workspace dependencies.

Use a Node 24 entry with bundled dependencies. Keep Git operations local, use Octokit for PRs and inject the model call into generation tests. The local preview runs the same generator through `./bin/shipkit`. The release script and its integration tests use Node.js built-ins. Test generated artifacts against a temporary Git origin.

Promote the tested action directory from the dispatch SHA into the corresponding major snapshot. Let `pnpm version <major|minor|patch> --no-git-tag-version` update the selected action package's `package.json`; do not calculate the next version in the release script. Commit that package change to `main`. For a new major start with an empty action set. Create an action-specific fixed tag and a shared moving major tag, then atomically push the package version commit and both tags so they cannot be left partially published. Start at 0.0.0 for the first release. Store the tested source SHA in the tags so retries of the same workflow run reuse the existing release.

Generate GitHub Release notes from commits that touch the selected action directory. Include conventional `feat` and `fix` subjects in separate sections and link each entry to its commit. The release script writes the notes file after pushing the tags; the workflow creates the GitHub Release from that file.

## Risks / Trade-offs

The whole snapshot SHA changes on promotion. Tests compare the Git trees of sibling actions and the refs of other majors. Actual hosted permissions and Gemini availability require live credentials.
