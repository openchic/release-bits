import { parseArgs } from 'node:util'
import { DEFAULT_MODEL } from './gemini.ts'
import { generate, markdown, maxLength, preview, warnings } from './notes.ts'
import { effectiveVersion } from './version.ts'

async function run() {
  const [command, ...args] = process.argv.slice(2)
  const usage = 'shipkit changelog --version X.Y.Z [--version-type major|minor|patch] [--base-ref REF] [--max-chars N] [--model MODEL] [--output-dir DIR]'
  if (command === '--help' || (command === 'changelog' && args.includes('--help'))) {
    console.log(usage)
    return
  }
  if (command !== 'changelog') throw new Error(usage)
  const { values } = parseArgs({ args, options: {
    version: { type: 'string' }, 'version-type': { type: 'string' }, 'base-ref': { type: 'string' },
    'max-chars': { type: 'string' }, model: { type: 'string' }, 'output-dir': { type: 'string' },
  } })
  const version = effectiveVersion(values.version || '', values['version-type'])
  const max = maxLength(values['max-chars'] || '50')
  const { source, notes } = await generate(version, values['base-ref'] || '', max, values.model || DEFAULT_MODEL)
  const paths = preview(version, source, notes, values['output-dir'])
  for (const message of warnings(notes, max)) console.warn('Style: ' + message)
  console.log(markdown(notes))
  console.error('JSON: ' + paths['notes-json-path'] + '\nMarkdown: ' + paths['notes-markdown-path'])
}

run().catch((error: Error) => { console.error('Error: ' + error.message); process.exitCode = 1 })
