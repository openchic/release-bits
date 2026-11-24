## Context

The consumer Release Action works on a checked-out commit. Repository workflows also promote Action packages into versioned snapshots.

## Decisions

- Find the unique Release for the exact tag across all pages. The list includes drafts for a token with write access.
- An explicit `tag-name` requires a remote tag. The default `v{version}` is created only if needed. Dereference annotated tags and require the final commit to match the checkout. Check the tag again before publication and send the checkout SHA as `target_commitish`. The ref checks and Release requests are separate GitHub operations. Consumers serialize publication for a tag.
- Keep the tag and draft if a later request fails. Record a fingerprint of the commit, version, notes and full attachment list in a Markdown comment in the draft. Strip it in the same request that publishes the Release. A matching fingerprint prevents an accidental retry with fewer attachments from publishing an incomplete draft.
- Compare remote asset names, sizes and SHA-256 digests before writing. Keep matching uploads, retry missing files, remove only empty `starter` assets from a matching draft, and refuse mismatching files. Return the existing published Release when its body and complete attachment set match. Read the draft again before publishing to catch tag and body edits made during upload.
- Keep native workflow path filters, add cleanup to the reusable verification and publication selector, and give the Release workflow smoke step the same upload fixture as the package test.
- Compare the remote branch to the close event's head SHA and check open PRs before sending the delete request. The REST checks and deletion are separate requests.
- Check file count and size during preflight. Copy attachments into an Action-owned runner temporary directory and stream checksums and uploads from those copies. Changes that preserve the source size and modification time cannot change the staged bytes. Clean up the copies when the Action exits normally or fails.
- Keep builds in a successful upstream job and restore its artifact by ID when retrying the publish job, including after a merged changelog PR.
- Keep the dispatch SHA for verification, build output, release notes and retries. Before creating a version commit, fetch `main` and use it as the parent if its tree differs only in the `version` fields of sibling Actions. Ask for a fresh run on other changes. Keep the atomic push and the lease on the moving tag.
- Remove `GITHUB_TOKEN` and `LLM_API_KEY` from Git subprocess environments while preserving checkout authentication. Report only the Git operation and exit status. Check release-note evidence for exact configured credentials and recognizable credential formats before sending it to Gemini. Recognize Gemini Auth Keys and standard Google API keys, including keys ending in a hyphen.
- Upload the tested `dist` in the read-only verification job. Forward the artifact ID and checkout SHA to the publication job, download outside the repository, and copy only regular distribution files for the selected Action after validating the SHA. Update the version with lifecycle scripts disabled and reuse the existing atomic push.
