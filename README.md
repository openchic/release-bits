<div align="center">
  <h1>ReleaseBits</h1>
  <p>Reusable GitHub Actions for Apple app release workflows.</p>
  <p>English&nbsp;&nbsp;|&nbsp;&nbsp;<a href="README-zh_CN.md">简体中文</a></p>
</div>

## Features

| Action | What it does | Workflow step reference |
| --- | --- | --- |
| [changelog](docs/changelog.md) | Generates Chinese and English release notes from `feat` and `fix` commits, writes them to `changelogs.json`, and opens a draft PR. Reruns preserve manual edits by reusing the existing PR or draft. | `uses: openchic/release-bits/actions/changelog@v1` |
| [changelog-cleanup](docs/changelog-cleanup.md) | Cleans up unused `changelogs/` branches after their PRs close. | `uses: openchic/release-bits/actions/changelog-cleanup@v1` |
| [build-macos](docs/build-macos.md) | Builds signed, notarized DMGs for Universal, Intel, or Apple Silicon. Accepts an explicit version or bumps the version from the Xcode project. | `uses: openchic/release-bits/actions/build-macos@v1` |
| [changelog-release](docs/changelog-release.md) | Publishes a GitHub Release with the English notes for a catalog version and optional attachments. | `uses: openchic/release-bits/actions/changelog-release@v1` |

## Quick start

Copy an example to `.github/workflows/` in your project, or add the `uses` reference to a job's `steps` and use the linked Action guide to configure its inputs and permissions. The examples use `@v1`. Choose a published tag that contains the Action, or pin an exact version with `@<action>-vX.Y.Z`.

- **Prepare release notes and clean up branches.** Add the `LLM_API_KEY` repository secret and allow GitHub Actions to create PRs. Copy the [release notes workflow](examples/release-notes.yml). The example targets `main`. To change the target, update `base-branch` and `pull_request.branches` together. Run **Prepare release notes** with a base version and optional bump. Cleanup runs when the PR closes.
- **Package a macOS app.** Set up [Apple signing and notarization credentials](docs/macos-signing.md), then copy the [macOS build workflow](examples/build-macos.yml) and adjust the Xcode configuration. Run **Build macOS** and download the DMGs from its artifacts.
- **Publish a GitHub Release.** Copy the [standalone release workflow](examples/changelog-release.yml). Select a branch containing `changelogs.json` and enter the version to publish. Set `files` to attach build outputs. For automatic publishing after a PR merge, use the [post-merge example](docs/changelog-release.md#合并-pr-后发布).

When combining the Actions, use the same final version for `build-macos` and `changelog-release`. If `changelog` has already calculated that version, pass it to `build-macos` as `version` and omit `version-type`.

## Development and maintenance

See [AGENTS.md](AGENTS.md) for the repository layout, development commands, and contribution guidelines.

## License

ReleaseBits is licensed under the [Apache License 2.0](LICENSE).
