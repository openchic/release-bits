## Context

The consumer Release Action works on a checked-out commit. Repository workflows also promote Action packages into versioned snapshots.

## Decisions

- Iterate through releases by page and stop at the first matching tag. The list includes drafts for a token with write access.
- Use a create-only Git ref operation to bind the tag to the checked-out commit. Concurrent runs of this Action can pass the same read checks, but only the run that creates the tag can create a draft.
- Keep the tag if a later call fails. A timed-out GitHub request may have succeeded, so deleting the tag automatically can leave a Release pointing at a missing ref. Report the state that was confirmed and the resources to inspect.
- Keep native workflow path filters, add cleanup to the reusable verification and publication selector, and give the Release workflow smoke step the same upload fixture as the package test.
- Compare the remote branch to the close event's head SHA and check open PRs before sending the delete request. The REST checks and deletion are separate requests.
- Check file count and size during preflight. Upload a Node file-backed Blob through the existing Octokit client so read failures reject the request while large files remain streamed.
