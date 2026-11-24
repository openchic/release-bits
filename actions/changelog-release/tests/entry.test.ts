import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const workspace = fileURLToPath(new URL('../../../', import.meta.url))

function invoke({ tagName = '', draft = '', assetChange = '', retryState = '', files = '' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'release-bits-release-entry-'))
  const output = join(dir, 'output')
  const runnerTemp = join(dir, 'runner')
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
        INPUT_FILES: files || (mutableAsset ? relative(workspace, mutableAsset) : asset),
        FIXTURE_DRAFT_STATE: draft,
        FIXTURE_RETRY_STATE: retryState,
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
  const result = invoke({ draft: 'unrelated' })
  assert.equal(result.status, 1, result.stdout + result.stderr)
  assert.match(result.stdout, /Release v1\.2\.3 does not match the requested publication/)
  assert.equal(result.outputs, '')
})

test('packaged action rejects duplicate Releases for one tag across pages', () => {
  const result = invoke({ draft: 'duplicate' })
  assert.equal(result.status, 1, result.stdout + result.stderr)
  assert.match(result.stdout, /Multiple Releases match tag v1\.2\.3/)
  assert.equal(result.outputs, '')
})

test('a new packaged process resumes a partial binary upload for the same draft', (t) => {
  const dir = mkdtempSync(join(workspace, '.release-bits-retry-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const retryState = join(dir, 'state.json')
  const first = join(dir, 'App.dmg')
  const second = join(dir, 'App-intel.dmg')
  writeFileSync(first, Buffer.from([0, 255, 128, 10]))
  writeFileSync(second, Buffer.from([1, 254, 129, 13]))
  const files = [first, second].map((file) => relative(workspace, file)).join('\n')

  const interrupted = invoke({ retryState, files })
  assert.equal(interrupted.status, 1, interrupted.stdout + interrupted.stderr)
  assert.match(interrupted.stdout, /https:\/\/example\.test\/releases\/v1\.2\.3.*fixture upload interrupted/)
  assert.equal(interrupted.outputs, '')
  const draft = JSON.parse(readFileSync(retryState, 'utf8'))
  assert.equal(draft.createdDraft.draft, true)
  assert.deepEqual(draft.assets.map(({ state }: { state: string }) => state), ['uploaded', 'starter'])

  const resumed = invoke({ retryState, files })
  assert.equal(resumed.status, 0, resumed.stdout + resumed.stderr)
  assert.match(resumed.outputs, /release-url<<.*\nhttps:\/\/example\.test\/releases\/v1\.2\.3\n/)
  const published = JSON.parse(readFileSync(retryState, 'utf8'))
  assert.equal(published.createdDraft.id, draft.createdDraft.id)
  assert.equal(published.createdDraft.draft, false)
  assert.deepEqual(published.writes, ['tag', 'draft', 'upload:App.dmg', 'interrupted',
    'delete:99', 'upload:App-intel.dmg', 'publish'])
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
