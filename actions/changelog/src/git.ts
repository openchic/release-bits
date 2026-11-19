import { spawnSync } from 'node:child_process'

export function gitResult(...args: string[]) {
  const result = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 })
  if (result.error) throw result.error
  if (result.status === null) throw new Error('Git process interrupted')
  return result
}

export function git(...args: string[]) {
  const result = gitResult(...args)
  if (result.status !== 0) throw new Error(result.stderr.trim() || 'Git command failed')
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
