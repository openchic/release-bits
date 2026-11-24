import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { test } from 'node:test'
import { loadNotes, prepareAssets, workspaceRoot } from '../src/prepare.ts'

function workspace() {
  const root = mkdtempSync(join(tmpdir(), 'release-bits-release-'))
  mkdirSync(join(root, 'dist'))
  writeFileSync(join(root, 'changelogs.json'), JSON.stringify([
    { version: '1.2.3', notes: { 'zh-CN': ['修复问题。'], en: ['Fixed the issue.', 'Added a feature.'] } },
    { version: '1.2.2', notes: { 'zh-CN': ['旧说明。'], en: ['Older note.'] } },
  ]))
  return root
}

test('loads the exact version and formats its English notes as Markdown bullets', () => {
  const root = workspace()
  try {
    const result = loadNotes(workspaceRoot(root), 'changelogs.json', '1.2.3')
    assert.deepEqual(result, {
      version: '1.2.3',
      notesEn: ['Fixed the issue.', 'Added a feature.'],
      markdown: '- Fixed the issue.\n- Added a feature.',
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('requires an explicit valid version and a unique catalog record', () => {
  const root = workspace()
  try {
    assert.throws(() => loadNotes(root, 'changelogs.json', ''), /version is required/)
    assert.throws(() => loadNotes(root, 'changelogs.json', '1.2'), /X\.Y\.Z/)
    assert.throws(() => loadNotes(root, 'changelogs.json', '9.0.0'), /found 0/)
    const catalog = join(root, 'duplicate.json')
    writeFileSync(catalog, JSON.stringify([
      { version: '1.2.3', notes: { en: ['One.'] } },
      { version: '1.2.3', notes: { en: ['Two.'] } },
    ]))
    assert.throws(() => loadNotes(root, 'duplicate.json', '1.2.3'), /found 2/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('rejects malformed catalog data and invalid English notes', () => {
  const root = workspace()
  try {
    const catalog = join(root, 'invalid.json')
    writeFileSync(catalog, JSON.stringify([
      { version: '1.2.3', notes: { en: ['Valid.', '  '] } },
    ]))
    assert.throws(() => loadNotes(root, 'invalid.json', '1.2.3'), /non-empty strings/)
    writeFileSync(catalog, '{')
    assert.throws(() => loadNotes(root, 'invalid.json', '1.2.3'), /Unable to read catalog JSON/)
    writeFileSync(catalog, JSON.stringify({ version: '1.2.3' }))
    assert.throws(() => loadNotes(root, 'invalid.json', '1.2.3'), /Invalid catalog records/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('accepts multiple repository-relative assets and rejects missing, escaped, non-file and duplicate paths', () => {
  const root = workspace()
  const outside = mkdtempSync(join(tmpdir(), 'release-bits-outside-'))
  try {
    writeFileSync(join(root, 'dist', 'App.dmg'), 'universal')
    writeFileSync(join(root, 'dist', 'App-intel.dmg'), 'intel')
    writeFileSync(join(outside, 'secret.dmg'), 'outside')

    const assets = prepareAssets(root, ['dist/App.dmg', 'dist/App-intel.dmg'])
    assert.deepEqual(assets.map(({ name }) => name), ['App.dmg', 'App-intel.dmg'])
    assert.throws(() => prepareAssets(root, ['missing.dmg']), /does not exist/)
    assert.throws(() => prepareAssets(root, [relative(root, join(outside, 'secret.dmg'))]), /stay inside the repository root/)
    assert.throws(() => prepareAssets(root, ['dist']), /regular file/)
    assert.throws(() => prepareAssets(root, ['dist/App.dmg', 'other/App.dmg']), /does not exist/)
    mkdirSync(join(root, 'other'))
    writeFileSync(join(root, 'other', 'App.dmg'), 'duplicate')
    assert.throws(() => prepareAssets(root, ['dist/App.dmg', 'other/App.dmg']), /Duplicate release asset filename/)
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  }
})

test('rejects a catalog symlink that resolves outside the repository', () => {
  const root = workspace()
  const outside = mkdtempSync(join(tmpdir(), 'release-bits-outside-catalog-'))
  try {
    writeFileSync(join(outside, 'catalog.json'), '[]')
    symlinkSync(join(outside, 'catalog.json'), join(root, 'external.json'))
    assert.throws(() => loadNotes(root, 'external.json', '1.2.3'), /stay inside the repository root/)
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  }
})

test('rejects a file at the upload size limit or too many assets', () => {
  const root = workspace()
  try {
    const file = join(root, 'dist', 'App.dmg')
    writeFileSync(file, '')
    const limit = 2 * 1024 ** 3
    truncateSync(file, limit - 1)
    assert.equal(prepareAssets(root, ['dist/App.dmg'])[0].size, limit - 1)
    truncateSync(file, limit)
    assert.throws(() => prepareAssets(root, ['dist/App.dmg']), /smaller than 2 GiB/)
    const files = Array.from({ length: 1001 }, (_, i) => `dist/App-${i}.dmg`)
    assert.throws(() => prepareAssets(root, files), /at most 1000 assets/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
