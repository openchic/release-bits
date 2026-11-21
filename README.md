<div align="center">
  <h1>ReleaseBits</h1>
  <p>Reusable GitHub Actions for Apple app release workflows.</p>
  <p>English&nbsp;&nbsp;|&nbsp;&nbsp;<a href="README-zh_CN.md">简体中文</a></p>
</div>

## Features

- **Generate release notes in Chinese and English** from `feat` and `fix` commits.
- Write the notes to `changelogs.json` and **open a draft PR for review**.
- **Reuse an existing PR or draft** on subsequent runs, preserving manual edits.
- Build, sign and notarize macOS disk images for Intel, Apple Silicon or both. [build-macos Action](docs/build-macos.md)

## Getting started · changelog

1. Allow GitHub Actions to create PRs in the app repository and add the `LLM_API_KEY` repository secret.
2. Copy the example to `.github/workflows/` in the app repository. Adjust the target branch if needed and verify that the Action tag in `uses` has been published. [Release notes workflow example](examples/release-notes.yml)
3. In GitHub Actions, run **Prepare release notes** manually. Enter the base version and select a version bump if needed.

For inputs, outputs, draft handling, branch cleanup, and app releases after merging the PR, see the [changelog Action documentation](docs/changelog.md).

## Agent setup prompt

```text
Integrate the ReleaseBits changelog Action from openchic/release-bits into this app repository.
Read that repository's docs/changelog.md and examples/release-notes.yml, and verify the published Action tag.
Use the existing workflows and version source. Follow the example for manual dispatch, permissions, secret references, and branch cleanup when a PR closes.
Keep using the app's existing build and release workflows.
Validate the changed YAML and explain how to configure LLM_API_KEY and run the workflow.
```

## Development and maintenance

See [AGENTS.md](AGENTS.md) for the repository layout, development commands, and contribution guidelines.

## License

ReleaseBits is licensed under the [Apache License 2.0](LICENSE).
