import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

test('packaged action reports success and leaves no success summary on failure', () => {
  const dir = mkdtempSync(join(tmpdir(), 'release-bits-entry-'))
  const summary = join(dir, 'summary.md')
  const output = join(dir, 'output')
  const entry = fileURLToPath(new URL('../dist/index.mjs', import.meta.url))
  const fixture = fileURLToPath(new URL('./mock-github.mjs', import.meta.url))
  const env = { ...process.env, GITHUB_TOKEN: 'fixture', GITHUB_REPOSITORY: 'fixture/app',
    INPUT_VERSION: '1.2.3', GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary }
  try {
    writeFileSync(summary, '')
    writeFileSync(output, '')
    const success = spawnSync(process.execPath, ['--import', fixture, entry], { env, encoding: 'utf8' })
    assert.equal(success.status, 0, success.stdout + success.stderr)
    assert.match(readFileSync(summary, 'utf8'), /\*\*Status:\*\* Reused PR/)
    assert.match(readFileSync(summary, 'utf8'), /\[Please review the PR\. Merging it approves the release notes\.\]\(https:\/\/example\.test\/pull\/12\)/)
    assert.match(readFileSync(summary, 'utf8'), /- \*\*Branch:\*\* `changelogs\/v1\.2\.3`\n\n\[Please review the PR/)
    assert.doesNotMatch(readFileSync(summary, 'utf8'), /^# Release notes v/m)
    assert.match(readFileSync(output, 'utf8'), /pr-url/)

    writeFileSync(summary, '')
    const failure = spawnSync(process.execPath, [entry], {
      env: { ...env, GITHUB_TOKEN: '' }, encoding: 'utf8',
    })
    assert.equal(failure.status, 1)
    assert.match(failure.stdout, /GITHUB_TOKEN is required/)
    assert.equal(readFileSync(summary, 'utf8'), '')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
