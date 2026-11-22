<div align="center">
  <h1>ReleaseBits</h1>
  <p>Reusable GitHub Actions for Apple app release workflows.</p>
  <p>English&nbsp;&nbsp;|&nbsp;&nbsp;<a href="README-zh_CN.md">简体中文</a></p>
</div>

## Features

| Action | What it does |
| --- | --- |
| `changelog` | generates Chinese and English release notes from `feat` and `fix` commits, writes them to `changelogs.json`, and opens a draft PR. Reruns reuse the existing PR or draft and preserve manual edits. |
| `build-macos` | builds an app from an Xcode project and produces signed, notarized DMGs. Choose one or more of Universal, Intel, and Apple Silicon. Set the package version directly or calculate it by incrementing the version read from Xcode. |

## Generate release notes

1. Allow GitHub Actions to create PRs in the app repository and add the `LLM_API_KEY` repository secret.
2. Use the [release notes workflow example](examples/release-notes.yml) and adjust the target branch if needed.
3. Run **Prepare release notes** manually, enter the base version, and select a version bump if needed.

## Package a macOS app

1. Set up the [Apple signing and notarization credentials](docs/macos-signing.md).
2. Use the [macOS build workflow example](examples/build-macos.yml) and adjust the Xcode setup for your project.
3. Run **Build macOS** manually and download the DMGs from the workflow artifacts.

To use both Actions together, pass the final version from `changelog` to `build-macos` as `version` and omit `version-type`.

## Development and maintenance

See [AGENTS.md](AGENTS.md) for the repository layout, development commands, and contribution guidelines.

## License

ReleaseBits is licensed under the [Apache License 2.0](LICENSE).
