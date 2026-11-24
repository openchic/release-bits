## 1. Release

- [x] 1.1 Check paginated releases and create the version tag before the draft. Verify conflict, failure and successful publication cases with mocks.
- [x] 1.2 Document the publication order, failure recovery and first `v1` snapshot.

## 2. Workflows

- [x] 2.1 Register cleanup, cover shared paths, and pass the upload fixture. Verify the Action and workflow YAML and run repository checks with Node 24.

## 3. Review follow-up

- [x] 3.1 Guard cleanup against moved branches and open PR reuse. Verify both cases and document the read permission.
- [x] 3.2 Check attachment quotas before publication and report file read failures. Verify size boundaries and packaged upload and read failure cases.
- [x] 3.3 Add a minimal standalone workflow under `examples/`, link to it from the Release documentation, and verify the YAML and OpenSpec change.
