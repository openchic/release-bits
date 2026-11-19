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
- Cleanup, tagging, GitHub Releases, appcasts, and packaging remain in the app repository.

## Usage

Configure the `SHIPKIT_GEMINI_API_KEY` repository secret, then add:

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
      - uses: actions/checkout@v4

      - uses: openchic/shipkit/actions/changelog@v1
        with:
          version: ${{ inputs.version }}
          version-type: ${{ inputs.version_type == 'none' && '' || inputs.version_type }}
        env:
          GH_TOKEN: ${{ github.token }}
          SHIPKIT_GEMINI_API_KEY: ${{ secrets.SHIPKIT_GEMINI_API_KEY }}
```

`version` is required. When `version-type` is set, the result is bumped from it (for example `1.2.3` + `minor` → `1.3.0`). The action fetches missing history and tags itself; a checkout at the workspace root is required.

The full workflow, including branch cleanup when the PR closes, is in [examples/release-notes.yml](examples/release-notes.yml).

## Local preview

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

```bash
PYTHONPATH=src python3 -m unittest discover -s tests -v
PYTHONPATH=src python3 -m compileall -q src tests
```

## Release

Maintainers run the **Release** workflow from `main` with an explicit version. It runs tests, creates a version tag `vX.Y.Z`, moves the `vX` major tag, and creates a GitHub Release.

Consumers can use `@v1` for the latest v1.x, pin `@v1.y.z`, or pin a commit SHA. Protect `v*` tags so only maintainers can move `v1`. If tag rules block the workflow token, allow GitHub Actions or use a token with `contents: write`. See [.github/workflows/release.yml](.github/workflows/release.yml).

## License

shipkit is licensed under the [Apache License 2.0](LICENSE).
