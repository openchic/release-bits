import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepare, type Inputs } from '../src/prepare.ts'
import { evidence, generate, maxLength, validateNotes, warnings } from '../src/notes.ts'
import { effectiveVersion } from '../../../shared/version.mts'
import { catalogPath } from '../src/catalog.ts'
import { requiredEnv } from '../src/env.ts'

const cwd = process.cwd()
const notes = { 'zh-CN': ['修复了显示。'], en: ['Fixed display.'] }
const input: Inputs = {
  version: '1.0.0', bump: 'minor', catalog: 'changelogs.json', base: 'main',
  since: '', max: 50, model: 'test',
}
const url = 'https://example.test/app/pull/12'
const pulls = { find: async () => undefined, create: async () => url }
const fake: typeof generate = (v, b, m, model) => generate(v, b, m, model, async (prompt) => {
  assert.match(prompt, /fix: display/)
  return notes
})
let root: string
function git(...args: string[]) {
  return execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.test',
    '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}
function commit(path: string, text: string, subject: string) {
  writeFileSync(path, text)
  git('add', path)
  git('commit', '-m', subject)
}
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'release-bits-test-'))
  process.chdir(root)
  git('init', '--bare', 'origin')
  git('init', '-b', 'main', 'work')
  process.chdir('work')
  git('remote', 'add', 'origin', join(root, 'origin'))
  commit('changelogs.json', '[{"version":"0.9.0","id":9999999999999999999}]\n', 'initial')
  git('tag', 'v0.9.0')
  commit('app', 'one', 'fix: display')
  git('push', 'origin', 'main', '--tags')
})
afterEach(() => { process.chdir(cwd); rmSync(root, { recursive: true, force: true }) })

test('version, evidence and bilingual style', () => {
  assert.equal(effectiveVersion('1.2.3'), '1.2.3')
  for (const [kind, version] of [['major','2.0.0'], ['minor','1.3.0'], ['patch','1.2.4']]) {
    assert.equal(effectiveVersion('1.2.3', kind), version)
  }
  for (const bad of ['01.0.0', 'v1.0.0', '1.2', '1.0.0-beta']) assert.throws(() => effectiveVersion(bad))
  assert.throws(() => effectiveVersion('1.0.0', 'none'))
  assert.throws(() => maxLength('0'))
  assert.throws(() => validateNotes({ ...notes, en: [] }))
  assert.equal(warnings({ 'zh-CN': ['优化显示并修复显示。'], en: ['Fix display now.'] }, 50).length, 4)
  const original = { sha: 'a'.repeat(40), subject: 'fix: display', body: '' }
  const revert = { sha: 'b'.repeat(40), subject: 'revert', body: 'This reverts commit ' + original.sha }
  assert.throws(() => evidence([revert, original]), /No feat/)
  assert.equal(JSON.parse(evidence([
    { ...revert, sha: 'c'.repeat(40), body: 'This reverts commit ' + revert.sha }, revert, original,
  ]).json).commits.length, 1)
  assert.throws(() => evidence([{ ...original, body: '文'.repeat(70_000) }]), /too large/)
})

test('requires the standardized credential environment variables', () => {
  const names = ['GITHUB_TOKEN', 'LLM_API_KEY'] as const
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]))
  try {
    for (const name of names) {
      delete process.env[name]
      assert.throws(() => requiredEnv(name), new RegExp(`${name} is required`))
      process.env[name] = 'test-secret'
      assert.equal(requiredEnv(name), 'test-secret')
    }
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name]
      else process.env[name] = previous[name]
    }
  }
})

test('catalog aliases resolve inside the checkout, including for a new file', () => {
  symlinkSync('.', 'inside')
  symlinkSync(root, 'outside')
  assert.equal(catalogPath('inside/notes/new.json'), 'notes/new.json')
  assert.throws(() => catalogPath('outside/new.json'), /inside the repository/)
})

test('open PR returns the required outputs without model or checkout operations', async () => {
  const result = await prepare(input, {
    find: async () => url,
    create: async () => { throw new Error('unexpected PR creation') },
  })
  assert.deepEqual(result.outputs, { version: '1.1.0', branch: 'changelogs/v1.1.0', 'pr-url': url,
    'pr-created': false })
})

test('generate and push only catalog, then reuse human-edited draft without model', async () => {
  const titles: string[] = []
  const checkedPulls = { ...pulls, create: async (branch: string, title: string) => {
    assert.equal(branch, 'changelogs/v1.1.0')
    titles.push(title)
    return url
  } }
  const result = await prepare(input, checkedPulls, fake)
  assert.deepEqual(titles, ['chore(release): add v1.1.0 release notes'])
  assert.equal(git('log', '-1', '--format=%s'), titles[0])
  assert.equal(result.outputs['pr-created'], true)
  assert.deepEqual(result.notes, notes)
  assert.equal(result.warnings.length, 0)
  assert.match(readFileSync('changelogs.json', 'utf8'), /9999999999999999999/)
  assert.equal(git('diff', '--name-only', 'main', 'HEAD'), 'changelogs.json')
  const branch = result.outputs.branch
  const edited = readFileSync('changelogs.json', 'utf8').replace('Fixed display.', 'Improve it now.')
  commit('changelogs.json', edited, 'docs: edit draft')
  git('push', 'origin', 'HEAD:refs/heads/' + branch)
  git('switch', 'main')
  const reused = await prepare(input, checkedPulls, async () => { throw new Error('unexpected generation') })
  assert.deepEqual(titles, Array(2).fill('chore(release): add v1.1.0 release notes'))
  assert.equal(git('log', '-1', '--format=%s'), 'docs: edit draft')
  assert.equal(reused.warnings.length, 2)
  assert.equal(readFileSync('changelogs.json', 'utf8'), edited)
})

test('new PR title uses an explicit version without an increment', async () => {
  commit('changelogs.json', '[]\n', 'docs: reset release history')
  git('push', 'origin', 'main')
  const result = await prepare({ ...input, version: '0.1.0', bump: '' }, {
    ...pulls,
    create: async (branch, title) => {
      assert.equal(branch, 'changelogs/v0.1.0')
      assert.equal(title, 'chore(release): add v0.1.0 release notes')
      return url
    },
  }, fake)
  assert.equal(result.outputs['pr-created'], true)
})

test('reject published version and scope/history drift', async () => {
  await assert.rejects(prepare({ ...input, version: '0.9.0', bump: '' }, pulls, fake), /newer/)
  await prepare(input, pulls, fake)
  const prepared = git('rev-parse', 'HEAD')
  const ref = 'HEAD:refs/heads/changelogs/v1.1.0'
  commit('app', 'two', 'fix: unrelated')
  git('push', 'origin', ref)
  await assert.rejects(prepare(input, pulls, fake), /App code/)
  git('switch', '--detach', prepared)
  commit('changelogs.json', readFileSync('changelogs.json', 'utf8').replace('0.9.0', '0.8.0'), 'edit history')
  git('push', '--force', 'origin', ref)
  await assert.rejects(prepare(input, pulls, fake), /history changed/)
})

test('generation detects HEAD drift before writing the catalog', async () => {
  const before = readFileSync('changelogs.json', 'utf8')
  await assert.rejects(prepare(input, pulls, (v,b,m,model) => generate(v,b,m,model,async () => {
    commit('app', 'two', 'fix: concurrent')
    return notes
  })), /changed during generation/)
  assert.equal(readFileSync('changelogs.json', 'utf8'), before)
})
