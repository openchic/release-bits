import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

function invoke({ tagName = '', hasDraft = false, assetChange = '' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'release-bits-release-entry-'))
  const output = join(dir, 'output')
  const runnerTemp = join(dir, 'runner')
  const workspace = fileURLToPath(new URL('../../../', import.meta.url))
  const entry = fileURLToPath(new URL('../dist/index.mjs', import.meta.url))
  const fixture = fileURLToPath(new URL('./mock-github.mjs', import.meta.url))
  const asset = 'actions/changelog-release/tests/fixtures/asset.txt'
  const assetDir = assetChange ? mkdtempSync(join(workspace, '.release-bits-upload-')) : ''
  const mutableAsset = assetDir ? join(assetDir, 'asset.txt') : ''
  writeFileSync(output, '')
  try {
    mkdirSync(runnerTemp)
    if (mutableAsset) {
      copyFileSync(join(workspace, asset), mutableAsset)
      utimesSync(mutableAsset, 0, 0)
    }
    const result = spawnSync(process.execPath, ['--import', fixture, entry], {
      cwd: workspace,
      env: {
        ...process.env,
        GITHUB_REPOSITORY: 'fixture/app',
        GITHUB_WORKSPACE: workspace,
        GITHUB_TOKEN: 'fixture',
        GITHUB_OUTPUT: output,
        RUNNER_TEMP: runnerTemp,
        INPUT_VERSION: '1.2.3',
        'INPUT_TAG-NAME': tagName,
        'INPUT_CATALOG-PATH': 'actions/changelog-release/tests/fixtures/changelogs.json',
        INPUT_FILES: mutableAsset ? relative(workspace, mutableAsset) : asset,
        FIXTURE_EXISTING_DRAFT: String(hasDraft),
        FIXTURE_MUTABLE_ASSET: mutableAsset,
        FIXTURE_ASSET_CHANGE: assetChange,
      },
      encoding: 'utf8',
    })

    assert.deepEqual(readdirSync(runnerTemp), [], 'the action must clean up staged copies')
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

test('packaged action uses the commit behind an existing annotated tag', () => {
  const result = invoke({ tagName: 'app/v1.2.3' })
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.match(result.outputs, /tag-name<<.*\napp\/v1\.2\.3\n/)
})

test('packaged action rejects an unrelated draft from a later page', () => {
  const result = invoke({ hasDraft: true })
  assert.equal(result.status, 1, result.stdout + result.stderr)
  assert.match(result.stdout, /Release v1\.2\.3 does not match the requested publication/)
  assert.equal(result.outputs, '')
})

test('uploads the staged copy if the source file disappears', () => {
  const result = invoke({ assetChange: 'delete' })
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.match(result.stdout, /Published v1\.2\.3/)
})

test('uploads the staged copy if the source file changes with the same size and mtime', () => {
  const result = invoke({ assetChange: 'replace' })
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.match(result.stdout, /Published v1\.2\.3/)
})
