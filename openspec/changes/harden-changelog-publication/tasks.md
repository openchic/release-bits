## 1. Release

- [x] 1.1 Check paginated releases and create the version tag before the draft. Verify conflict, failure and successful publication cases with mocks.
- [x] 1.2 Document the publication order, failure recovery and first `v1` snapshot.

## 2. Workflows

- [x] 2.1 Register cleanup, cover shared paths, and pass the upload fixture. Verify the Action and workflow YAML and run repository checks with Node 24.

## 3. Review follow-up

- [x] 3.1 Guard cleanup against moved branches and open PR reuse. Verify both cases and document the read permission.
- [x] 3.2 Check attachment quotas before publication and report file read failures. Verify size boundaries and packaged upload and read failure cases.
- [x] 3.3 Add a minimal standalone workflow under `examples/`, link to it from the Release documentation, and verify the YAML and OpenSpec change.

## 4. Queued Action publication

- [x] 4.1 Verify four queued publications dispatched at the same SHA, and reject source changes after verification without updating remote refs.
- [x] 4.2 Verify that replacing the history of `main` reports that a fresh publish run is required.

## 5. Retryable consumer releases

- [x] 5.1 Support explicit existing tags and default tag reuse, validate the target commit, and resume matching drafts and published Releases.
- [x] 5.2 Document both tag modes and the artifact-based retry flow for callers that atomically push a version commit and tag.
- [x] 5.3 Verify tag conflicts, partial uploads, lost publication responses and the packaged Action with mocks. Validate workflow YAML and OpenSpec.
- [x] 5.4 Verify same-size asset replacement and edits made during upload. Update the merged PR workflow example to reuse the build artifact on publication retries.
- [x] 5.5 Stage attachments before hashing and uploading. Verify source removal, replacement with preserved modification time, and staging cleanup after success or failure.

## 6. Regression coverage

- [x] 6.1 Verify packaged binary upload and resumption across processes, remote conflict cases, draft creation response loss, and final attachment validation.
- [x] 6.2 Verify atomic ref rejection, Gemini request handling, changelog PR recovery, packaged cleanup, and multi-package notarization failure cleanup.

## 7. Credential boundaries

- [x] 7.1 Isolate Git from Action secrets and block suspected credentials in commit evidence. Verify that rejected evidence does not reach Gemini.
- [x] 7.2 Publish the verified bundle without rebuilding in the write job. Verify artifact validation, queued publication, atomic ref rejection, and workflow YAML.
