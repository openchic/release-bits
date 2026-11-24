import * as core from '@actions/core'
import { markdown, type Notes } from './notes.ts'
import type { prepare } from './prepare.ts'

type Outputs = Awaited<ReturnType<typeof prepare>>['outputs']

/** Append the completed PR result without failing preparation if reporting fails. */
export async function writeSummary(outputs: Outputs, notes?: Notes) {
  try {
    const status = outputs['pr-created'] ? 'Created draft PR' : 'Reused PR'
    const lines = [
      '- **Status:** ' + status,
      '- **Branch:** `' + outputs.branch + '`',
      '',
      '[Please review the PR. Merging it approves the release notes.](' + outputs['pr-url'] + ')',
    ]
    if (notes) lines.push('', markdown(notes))
    await core.summary.addRaw(lines.join('\n') + '\n').write()
  } catch (error) {
    core.summary.emptyBuffer()
    core.warning('Unable to write release notes job summary: ' +
      (error instanceof Error ? error.message : String(error)))
  }
}
