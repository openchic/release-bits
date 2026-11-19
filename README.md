<div align="center">
  <h1>shipkit</h1>
  <p>Reusable GitHub Actions for Apple app release workflows.</p>
  <p>English&nbsp;&nbsp;|&nbsp;&nbsp;<a href="README-zh_CN.md">简体中文</a></p>
</div>

shipkit currently provides `changelog`: it turns `feat` and `fix` commits into a bilingual release-notes draft, writes the draft to `changelogs.json`, and creates or reuses a draft pull request.

## Features

- Generate Chinese and English notes from commits since the previous tag.
- Create or reuse a draft PR on `changelogs/v{version}`; merging the PR approves the notes.
- Re-running is idempotent: existing PRs, branches, and drafts are reused without overwriting manual edits or calling Gemini again.
- No review flag in the catalog; draft state is owned by the branch and PR lifecycle.
- App cleanup, tags, GitHub Releases, appcasts, and packaging remain in the app repository; this repository separately publishes Shipkit Action versions.

## Usage

Enable GitHub Actions pull request creation and configure the `SHIPKIT_GEMINI_API_KEY` repository secret.

```yaml
name: Prepare release notes

on:
  workflow_dispatch:
    inputs:
      version:
        required: true
      version_type:
        type: choice
        options: [none, major, minor, patch]
        default: none

permissions:
  contents: write
  pull-requests: write

jobs:
  notes:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6

      - uses: openchic/shipkit/actions/changelog@v1
        with:
          version: ${{ inputs.version }}
          version-type: ${{ inputs.version_type != 'none' && inputs.version_type || '' }}
        env:
          GH_TOKEN: ${{ github.token }}
          SHIPKIT_GEMINI_API_KEY: ${{ secrets.SHIPKIT_GEMINI_API_KEY }}
```

`version` is required. When `version-type` is set, the result is bumped from it (for example `1.2.3` + `minor` → `1.3.0`). The action fetches missing history and tags itself; a checkout at the workspace root is required.

The full workflow, including branch cleanup when the PR closes, is in [examples/release-notes.yml](examples/release-notes.yml).

## Local preview

Use Node.js 24 to run the packaged CLI.

```bash
export GEMINI_API_KEY=...

./bin/shipkit changelog \
  --version 1.2.3 \
  --version-type minor
```

This writes preview files only; it does not update the catalog or create a PR.

## Documentation

- [Action contract](docs/changelog.md): inputs, outputs, reuse and drift rules, failure matrix.
- [Example workflow](examples/release-notes.yml).
- [CI checks](.github/workflows/test.yml).

## Development

Use Node.js 24 and pnpm 11.9.0 from the repository root. To build just changelog, run `pnpm --filter @shipkit/changelog build`.

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm build
pnpm test
```

## Release

Run **Release** from `main` to publish an Action. See [the maintainer release flow (Chinese)](docs/changelog.md) for version selection, package version commits, tags and GitHub Release notes.

## License

shipkit is licensed under the [Apache License 2.0](LICENSE).
