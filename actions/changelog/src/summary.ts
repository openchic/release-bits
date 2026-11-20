import { readFileSync } from 'node:fs'
import * as core from '@actions/core'
import type { prepare } from './prepare.ts'

type Outputs = Awaited<ReturnType<typeof prepare>>['outputs']

/** Append the completed PR result without failing preparation if reporting fails. */
export async function writeSummary(outputs: Outputs) {
  try {
    const status = outputs['pr-created'] ? 'Created draft PR' : 'Reused PR'
    const lines = [
      '- **Status:** ' + status,
      '- **Branch:** `' + outputs.branch + '`',
      '',
      '[Please review the PR. Merging it approves the release notes.](' + outputs['pr-url'] + ')',
    ]
    if (outputs['notes-markdown-path']) {
      lines.push('', readFileSync(outputs['notes-markdown-path'], 'utf8').trimEnd())
    }
    await core.summary.addRaw(lines.join('\n') + '\n').write()
  } catch (error) {
    core.summary.emptyBuffer()
    core.warning('Unable to write release notes job summary: ' +
      (error instanceof Error ? error.message : String(error)))
  }
}
