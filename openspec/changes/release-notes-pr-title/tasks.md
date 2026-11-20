## 1. Title behavior

- [x] 1.1 Update the shared PR title and documentation; verify generation, branch reuse, effective versions and existing PRs in Action tests.

## 2. Verification

- [x] 2.1 Install frozen dependencies, run check/build/test under Node.js 24, parse Action YAML, validate the OpenSpec change and inspect the generated bundle.

## 3. Success summary

- [x] 3.1 Remove source and count metrics from the success summary; update documentation and summary assertions.
- [x] 3.2 Run type checking and build, parse Action YAML, validate the OpenSpec change and confirm the bundled summary omits the removed fields.

## 4. Review reminder

- [x] 4.1 Add a reminder to review the PR and merge to approve release notes to every success summary state; document it and update summary assertions.
- [x] 4.2 Rebuild the bundled Action, validate OpenSpec, and inspect the summary output for the reminder.

## 5. Summary layout

- [x] 5.1 Remove the version heading and link the review reminder directly to the PR while preserving status, branch and available notes; update docs and assertions.
- [x] 5.2 Rebuild the bundled Action, type-check, validate OpenSpec and inspect generated summary markup.

## 6. Summary list layout

- [x] 6.1 Bold status/branch labels, then put the linked review instruction in its own paragraph; update layout assertions and rebuild the bundled Action.

## 7. Source-scoped CI

- [x] 7.1 Filter push/PR runs to source, workspace manifest and workflow changes; preserve reusable calls and validate the workflow YAML and OpenSpec change.

## 8. Matching commit title

- [x] 8.1 Reuse the PR title as the newly generated catalog commit subject; verify the generated commit matches and branch-draft reuse preserves its history.
- [x] 8.2 Rebuild the bundled Action, type-check and validate OpenSpec.

## 9. Release verification output

- [x] 9.1 Add a reusable-workflow input that skips only packaged Action smoke output during Release; preserve the test suite and validate both workflow YAML files.
- [x] 9.2 Rename the workflow to `Test actions` and use a clear input name for skipping the packaged action smoke test.

## 10. Workflow step names

- [x] 10.1 Use consistent `Verify` wording for workspace, packaged action and output steps; validate YAML and OpenSpec.

## 11. Release step name

- [x] 11.1 Rename the publication step to `Publish selected action`; validate the workflow YAML and OpenSpec.
