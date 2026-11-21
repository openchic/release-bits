import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const release = fileURLToPath(new URL('./release.mjs', import.meta.url))

function repository(t) {
  const root = mkdtempSync(join(tmpdir(), 'shipkit-release-'))
  const remoteRoot = mkdtempSync(join(tmpdir(), 'shipkit-origin-'))
  const notesRoot = mkdtempSync(join(tmpdir(), 'shipkit-notes-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  t.after(() => rmSync(remoteRoot, { recursive: true, force: true }))
  t.after(() => rmSync(notesRoot, { recursive: true, force: true }))
  const notes = join(notesRoot, 'release-notes.md')
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.test',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.test',
    GITHUB_SERVER_URL: 'https://github.test',
    GITHUB_REPOSITORY: 'fixture/shipkit',
    SHIPKIT_RELEASE_NOTES_FILE: notes,
  }
  function run(cmd, ...args) {
    return execFileSync(cmd, args, {
      cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  }
  const git = (...args) => run('git', '-c', 'commit.gpgsign=false', ...args)
  const commit = (message) => {
    git('add', '.gitignore', 'actions')
    git('commit', '-m', message)
  }
  function promote(action, type) {
    const source = git('rev-parse', 'HEAD')
    const tag = run(process.execPath, release, action, type, source)
    return { tag, source: git('rev-parse', 'HEAD'), notes: readFileSync(notes, 'utf8') }
  }

  git('init', '-b', 'main')
  git('init', '--bare', remoteRoot)
  git('remote', 'add', 'origin', remoteRoot)
  writeFileSync(join(root, '.gitignore'), 'actions/*/dist/\n')
  for (const name of ['changelog', 'build-ios', 'build-macos']) {
    const directory = join(root, 'actions', name)
    mkdirSync(join(directory, 'dist'), { recursive: true })
    writeFileSync(join(directory, 'action.yml'), 'name: ' + name + '\n')
    writeFileSync(join(directory, 'package.json'), JSON.stringify({
      name: '@shipkit/' + name,
      version: '0.0.0',
      private: true,
    }, null, 2) + '\n')
    writeFileSync(join(directory, 'dist/index.mjs'), name + ' bundle\n')
    writeFileSync(join(directory, 'old'), 'first')
  }
  commit('feat(changelog): add release notes')
  return { root, git, commit, promote, run }
}

test('promotion commits pnpm version, creates feat and fix notes, and preserves sibling actions', (t) => {
  const { root, git, commit, promote, run } = repository(t)
  const initialSource = git('rev-parse', 'HEAD')

  const first = promote('changelog', 'major')
  assert.equal(first.tag, 'changelog-v1.0.0')
  assert.match(first.notes, /## Features\n\n- add release notes/)
  git('fetch', '--tags', 'origin', 'main')
  assert.equal(git('show', 'changelog-v1.0.0:actions/changelog/dist/index.mjs'), 'changelog bundle')
  assert.match(git('log', '-1', '--format=%B', 'HEAD'), /Shipkit-version: 1.0.0/)
  assert.equal(JSON.parse(readFileSync(join(root, 'actions/changelog/package.json'), 'utf8')).version, '1.0.0')
  assert.equal(git('rev-parse', 'refs/remotes/origin/main'), first.source)

  git('checkout', '--detach', initialSource)
  assert.equal(git('rev-parse', 'HEAD'), initialSource)
  assert.equal(run(process.execPath, release, 'changelog', 'patch', initialSource), first.tag)
  git('checkout', '--detach', 'refs/remotes/origin/main')

  const ios = promote('build-ios', 'major')
  assert.equal(ios.tag, 'build-ios-v1.0.0')
  const macos = promote('build-macos', 'major')
  assert.equal(macos.tag, 'build-macos-v1.0.0')
  git('fetch', '--tags', '--force', 'origin')
  const iosTree = git('rev-parse', 'v1:actions/build-ios')
  const macosTree = git('rev-parse', 'v1:actions/build-macos')

  writeFileSync(join(root, 'actions/changelog/old'), 'fixed')
  commit('fix(changelog): correct release notes')
  const changelogFix = promote('changelog', 'minor')
  assert.equal(changelogFix.tag, 'changelog-v1.1.0')
  assert.match(changelogFix.notes, /## Fixes\n\n- correct release notes/)
  assert.doesNotMatch(changelogFix.notes, /add release notes/)
  git('fetch', '--tags', '--force', 'origin')
  assert.equal(JSON.parse(git('show', 'changelog-v1.1.0:actions/changelog/package.json')).version, '1.1.0')
  assert.equal(JSON.parse(readFileSync(join(root, 'actions/changelog/package.json'), 'utf8')).version, '1.1.0')

  writeFileSync(join(root, 'actions/build-macos/old'), 'updated')
  commit('feat(build-macos): update builder')
  const macosV2 = promote('build-macos', 'major')
  assert.equal(macosV2.tag, 'build-macos-v2.0.0')
  git('fetch', '--tags', '--force', 'origin')
  assert.equal(git('rev-parse', 'v1:actions/build-ios'), iosTree)
  assert.equal(git('rev-parse', 'v1:actions/build-macos'), macosTree)
  assert.equal(git('rev-parse', 'v1'), git('rev-parse', 'changelog-v1.1.0'))
  assert.equal(JSON.parse(git('show', 'build-macos-v2.0.0:actions/build-macos/package.json')).version, '2.0.0')
})
