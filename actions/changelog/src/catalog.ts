import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, relative, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import { git } from './git.ts'
import { record } from './notes.ts'
import { isNewer } from '../../../shared/version.mts'

export function catalogPath(input: string) {
  const root = realpathSync(git('rev-parse', '--show-toplevel').trim())
  // Resolve the existing ancestor even when the catalog will be created by this run.
  let ancestor = resolve(root, input)
  const missing: string[] = []
  while (!lstatSync(ancestor, { throwIfNoEntry: false })) {
    missing.unshift(basename(ancestor))
    ancestor = dirname(ancestor)
  }
  const path = relative(root, resolve(realpathSync(ancestor), ...missing))
  if (!path || path === '..' || path.startsWith('..' + sep) || path.split(sep).includes('.git')) {
    throw new Error('catalog-path must stay inside the repository')
  }
  return path
}

function parse(text: string) {
  const records: unknown = JSON.parse(text, (_key, value, context?: { source?: string }) => {
    if (typeof value === 'number' && !Number.isSafeInteger(value) &&
        context?.source && /^-?\d+$/.test(context.source)) return BigInt(context.source)
    return value
  })
  if (!Array.isArray(records) || !records.every(record)) throw new Error('Invalid catalog records')
  return { text, records: records as Record<string, unknown>[] }
}

export function load(path: string) {
  return parse(existsSync(path) ? readFileSync(path, 'utf8') : '[]')
}

export function at(ref: string, path: string) {
  const exists = git('--literal-pathspecs', 'ls-tree', '-z', ref, '--', path)
  return parse(exists ? git('show', ref + ':' + path) : '[]')
}

export function checkVersions(records: Record<string, unknown>[], version: string) {
  for (const row of records) {
    if (typeof row.version !== 'string' || !isNewer(version, row.version)) {
      throw new Error('Version ' + version + ' must be newer than catalog history')
    }
  }
}

export function prepend(path: string, draft: object, history: ReturnType<typeof load>) {
  mkdirSync(dirname(path), { recursive: true })
  const temp = path + '.' + randomUUID() + '.tmp'
  // Carry the original JSON forward verbatim, including numbers beyond JS integer precision.
  const item = JSON.stringify(draft, null, 2).replace(/^/gm, '  ')
  const tail = history.records.length ? ',' + history.text.slice(history.text.indexOf('[') + 1) : '\n]\n'
  try {
    writeFileSync(temp, '[\n' + item + tail, { flag: 'wx' })
    renameSync(temp, path)
  } finally {
    rmSync(temp, { force: true })
  }
}
