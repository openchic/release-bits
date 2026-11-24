import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import * as core from '@actions/core'
import { writeSummary } from '../src/summary.ts'

test('summary appends final notes, handles reuse and warns on write failure', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'release-bits-summary-'))
  const file = join(dir, 'summary.md')
  const previous = process.env.GITHUB_STEP_SUMMARY
  process.env.GITHUB_STEP_SUMMARY = file
  writeFileSync(file, 'Previous summary\n')
  const outputs = {
    version: '1.1.0', branch: 'changelogs/v1.1.0', 'pr-url': 'https://example.test/pull/12',
    'pr-created': true,
  }
  const notes = { 'zh-CN': ['修复了显示。'], en: ['Fixed display.'] }
  try {
    await writeSummary(outputs, notes)
    const created = readFileSync(file, 'utf8')
    assert.match(created, /^Previous summary\n- \*\*Status:\*\* Created draft PR/)
    assert.match(created, /\[Please review the PR\. Merging it approves the release notes\.\]\(https:\/\/example\.test\/pull\/12\)/)
    assert.match(created, /- \*\*Branch:\*\* `changelogs\/v1\.1\.0`\n\n\[Please review the PR/)
    assert.doesNotMatch(created, /^# Release notes v/m)
    assert.doesNotMatch(created, /Source:|Contributing commits:|Style warnings:/)
    assert.match(created, /修复了显示。/)
    assert.match(created, /Fixed display\./)

    writeFileSync(file, '')
    await writeSummary(outputs, notes)
    const draftReuse = readFileSync(file, 'utf8')
    assert.match(draftReuse, /\*\*Status:\*\* Created draft PR/)
    assert.match(draftReuse, /\[Please review the PR\. Merging it approves the release notes\.\]/)
    assert.doesNotMatch(draftReuse, /Source:|Contributing commits:|Style warnings:/)
    assert.match(draftReuse, /Fixed display\./)

    writeFileSync(file, '')
    await writeSummary({ ...outputs, 'pr-created': false })
    const reused = readFileSync(file, 'utf8')
    assert.match(reused, /\*\*Status:\*\* Reused PR/)
    assert.match(reused, /\[Please review the PR\. Merging it approves the release notes\.\]/)
    assert.doesNotMatch(reused, /Source:|Contributing commits:|Style warnings:|Fixed display/)

    rmSync(file)
    mkdirSync(file)
    const warnings: string[] = []
    const output = t.mock.method(process.stdout, 'write', (chunk: string | Uint8Array) => {
      warnings.push(String(chunk))
      return true
    })
    try {
      await assert.doesNotReject(writeSummary(outputs, notes))
      assert.ok(warnings.some((message) => message.includes('::warning::Unable to write release notes job summary:')))
      assert.equal(core.summary.isEmptyBuffer(), true)
    } finally {
      output.mock.restore()
    }
  } finally {
    if (previous === undefined) delete process.env.GITHUB_STEP_SUMMARY
    else process.env.GITHUB_STEP_SUMMARY = previous
    rmSync(dir, { recursive: true, force: true })
  }
})
