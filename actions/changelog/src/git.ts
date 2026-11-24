import { spawnSync } from 'node:child_process'
import { CREDENTIAL_NAMES } from './env.ts'

const OPERATIONS = new Set(['add', 'check-ref-format', 'commit', 'describe', 'diff', 'fetch', 'log',
  'ls-remote', 'ls-tree', 'merge-base', 'push', 'rev-parse', 'show', 'status', 'switch'])

function operation(args: string[]) {
  return args.find((arg) => OPERATIONS.has(arg)) ?? 'operation'
}

export function gitResult(...args: string[]) {
  const env = { ...process.env }
  for (const name of CREDENTIAL_NAMES) delete env[name]
  const result = spawnSync('git', args, {
    env, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
  })
  if (result.error || result.status === null) throw new Error(`Git ${operation(args)} did not complete`)
  return { status: result.status, stdout: result.stdout }
}

export function git(...args: string[]) {
  const result = gitResult(...args)
  if (result.status !== 0) throw new Error(`Git ${operation(args)} failed (exit code ${result.status})`)
  return result.stdout
}

export function head() {
  return git('rev-parse', 'HEAD').trim()
}

export function commitsSince(baseRef?: string) {
  const base = baseRef
    ? git('rev-parse', '--verify', '--end-of-options', baseRef + '^{commit}').trim()
    : gitResult('describe', '--tags', '--abbrev=0', 'HEAD').stdout.trim()
  if (!base) console.warn('Warning: no tag found; using the full history')
  const log = git('log', '--no-merges', '--topo-order', '-z', '--format=%H%x00%s%x00%b',
    base ? base + '..HEAD' : 'HEAD', '--')
  const fields = log.split('\0')
  const commits = []
  for (let i = 0; i + 2 < fields.length; i += 3) {
    commits.push({ sha: fields[i], subject: fields[i + 1].trim(), body: fields[i + 2].trim() })
  }
  return commits
}
