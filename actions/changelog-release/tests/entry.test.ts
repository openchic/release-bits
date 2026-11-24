import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

function invoke({ hasDraft = false, removeAsset = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'release-bits-release-entry-'))
  const output = join(dir, 'output')
  const workspace = fileURLToPath(new URL('../../../', import.meta.url))
  const entry = fileURLToPath(new URL('../dist/index.mjs', import.meta.url))
  const fixture = fileURLToPath(new URL('./mock-github.mjs', import.meta.url))
  const asset = 'actions/changelog-release/tests/fixtures/asset.txt'
  const assetDir = removeAsset ? mkdtempSync(join(workspace, '.release-bits-upload-')) : ''
  const disappearingAsset = assetDir ? join(assetDir, 'asset.txt') : ''
  writeFileSync(output, '')
  try {
    if (disappearingAsset) copyFileSync(join(workspace, asset), disappearingAsset)
    const result = spawnSync(process.execPath, ['--import', fixture, entry], {
      env: {
        ...process.env,
        GITHUB_REPOSITORY: 'fixture/app',
        GITHUB_WORKSPACE: workspace,
        GITHUB_TOKEN: 'fixture',
        GITHUB_OUTPUT: output,
        INPUT_VERSION: '1.2.3',
        'INPUT_CATALOG-PATH': 'actions/changelog-release/tests/fixtures/changelogs.json',
        INPUT_FILES: disappearingAsset ? relative(workspace, disappearingAsset) : asset,
        FIXTURE_EXISTING_DRAFT: String(hasDraft),
        FIXTURE_DISAPPEARING_ASSET: disappearingAsset,
      },
      encoding: 'utf8',
    })

    return { ...result, outputs: readFileSync(output, 'utf8') }
  } finally {
    rmSync(dir, { recursive: true, force: true })
    if (assetDir) rmSync(assetDir, { recursive: true, force: true })
  }
}

test('packaged action creates a release and returns its outputs', () => {
  const result = invoke()
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.match(result.outputs, /notes-en<<.*\n- Fixed the release fixture\.\n/)
  assert.match(result.outputs, /tag-name<<.*\nv1\.2\.3\n/)
  assert.match(result.outputs, /release-url<<.*\nhttps:\/\/example\.test\/releases\/v1\.2\.3\n/)
  assert.match(result.stdout, /Published v1\.2\.3/)
})

test('packaged action rejects a draft from a later page before creating a tag', () => {
  const result = invoke({ hasDraft: true })
  assert.equal(result.status, 1, result.stdout + result.stderr)
  assert.match(result.stdout, /Release v1\.2\.3 already exists/)
  assert.equal(result.outputs, '')
})

test('reports the draft when a validated asset disappears before upload', () => {
  const result = invoke({ removeAsset: true })
  assert.equal(result.status, 1, result.stdout + result.stderr)
  assert.match(result.stdout, /check the Release at https:\/\/example\.test\/releases\/v1\.2\.3 and tag v1\.2\.3/)
  assert.equal(result.outputs, '')
})
