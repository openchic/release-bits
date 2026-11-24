import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
