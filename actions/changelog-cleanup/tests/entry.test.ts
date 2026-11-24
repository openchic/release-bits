import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

test('packaged action skips non-closed events without requiring a token', () => {
  const dir = mkdtempSync(join(tmpdir(), 'release-bits-cleanup-'))
  const eventPath = join(dir, 'event.json')
  const entry = fileURLToPath(new URL('../dist/index.mjs', import.meta.url))
  try {
    writeFileSync(eventPath, JSON.stringify({ action: 'opened', pull_request: {} }))
    const result = spawnSync(process.execPath, [entry], {
      env: {
        ...process.env,
        GITHUB_EVENT_NAME: 'pull_request',
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_REPOSITORY: 'openchic/app',
        GITHUB_TOKEN: '',
      },
      encoding: 'utf8',
    })

    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.match(result.stdout, /Skipping branch cleanup/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

for (const { name, open, status, expected } of [
  { name: 'preserves a branch with an open PR on the second page', open: true, status: 204,
    expected: /open pull request still uses it/ },
  { name: 'deletes an unchanged branch when both pages are empty', open: false, status: 204,
    expected: /Deleted changelog branch changelogs\/v1\.2\.3/ },
  { name: 'reports a forbidden delete as a failure', open: false, status: 403,
    expected: /fixture denied branch deletion/ },
]) {
  test(`packaged action ${name}`, (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'release-bits-cleanup-'))
    t.after(() => rmSync(dir, { recursive: true, force: true }))
    const eventPath = join(dir, 'event.json')
    const calls = join(dir, 'calls.txt')
    const entry = fileURLToPath(new URL('../dist/index.mjs', import.meta.url))
    const fixture = fileURLToPath(new URL('./mock-github.mjs', import.meta.url))
    writeFileSync(eventPath, JSON.stringify({ action: 'closed', pull_request: {
      head: { ref: 'changelogs/v1.2.3', sha: 'a'.repeat(40), repo: { full_name: 'openchic/app' } },
    } }))
    writeFileSync(calls, '')

    const result = spawnSync(process.execPath, ['--import', fixture, entry], {
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_API_URL: 'https://github.test',
        GITHUB_EVENT_NAME: 'pull_request',
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_REPOSITORY: 'openchic/app',
        GITHUB_TOKEN: 'fixture',
        FIXTURE_CALLS: calls,
        FIXTURE_OPEN_PR: String(open),
        FIXTURE_DELETE_STATUS: String(status),
      },
    })
    const log = result.stdout + result.stderr
    assert.equal(result.status, status === 403 ? 1 : 0, log)
    assert.match(log, expected)
    assert.deepEqual(readFileSync(calls, 'utf8').trimEnd().split('\n'),
      open ? ['read', 'pulls:1', 'pulls:2'] : ['read', 'pulls:1', 'pulls:2', 'delete'])
  })
}
