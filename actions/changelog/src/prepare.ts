import { isDeepStrictEqual } from 'node:util'
import * as catalog from './catalog.ts'
import { git, gitResult, head } from './git.ts'
import { generate, markdown, preview, validateNotes, warnings } from './notes.ts'
import { BUMPS, effectiveVersion } from './version.ts'

export type Inputs = {
  version: string, bump: string, catalog: string, base: string, since: string, max: number, model: string,
}
export type PullRequests = {
  find(branch: string): Promise<string | undefined>
  create(branch: string, title: string, body: string): Promise<string>
}

function verifyChanges(source: string, path: string) {
  git('merge-base', '--is-ancestor', source, 'HEAD')
  const changed = git('diff', '--name-only', '-z', source, 'HEAD', '--').split('\0').filter(Boolean)
  if (changed.some((file) => file !== path)) throw new Error('App code changed after notes generation')
}

/** Prepare release notes in the checked-out consumer repository. */
export async function prepare(input: Inputs, pulls: PullRequests, generateNotes = generate) {
  const version = effectiveVersion(input.version, input.bump)
  const branch = 'changelogs/v' + version
  const existing = await pulls.find(branch)
  const outputs = {
    version, branch, 'pr-created': false, 'pr-url': existing || '', 'source-sha': '',
    'commit-count': 0, 'warning-count': 0, 'notes-json-path': '', 'notes-markdown-path': '',
  }
  if (existing) return { outputs, warnings: [] }

  const shallow = git('rev-parse', '--is-shallow-repository').trim() === 'true'
  git('fetch', '--tags', ...(shallow ? ['--unshallow'] : []), 'origin')
  git('check-ref-format', 'refs/heads/' + input.base)
  git('fetch', 'origin', '+refs/heads/' + input.base + ':refs/remotes/origin/' + input.base)
  const remote = gitResult('ls-remote', '--exit-code', '--heads', 'origin', 'refs/heads/' + branch)
  if (remote.status !== 0 && remote.status !== 2) throw new Error('Unable to query release branch')
  const hasBranch = remote.status === 0
  if (hasBranch) {
    git('fetch', 'origin', 'refs/heads/' + branch)
    git('switch', '--detach', 'FETCH_HEAD')
  }
  const path = catalog.catalogPath(input.catalog)
  if (git('--literal-pathspecs', 'status', '--porcelain', '--', path).trim()) {
    throw new Error('The catalog has local changes')
  }
  const current = catalog.load(path)
  const base = catalog.at('refs/remotes/origin/' + input.base, path)
  catalog.checkVersions(base.records, version)
  let result: Awaited<ReturnType<typeof generate>>
  if (hasBranch && current.records.length) {
    const [draft, ...history] = current.records
    if (base.records.some((row) => isDeepStrictEqual(row, draft))) throw new Error('Branch contains no draft')
    if (draft.version !== version || typeof draft.source_sha !== 'string' || !/^[a-f0-9]{40}$/.test(draft.source_sha)) {
      throw new Error('Invalid draft version or source SHA')
    }
    if (draft.version_type != null && !BUMPS.includes(String(draft.version_type))) throw new Error('Invalid draft version_type')
    catalog.checkVersions(history, version)
    verifyChanges(draft.source_sha, path)
    if (!isDeepStrictEqual(catalog.at(draft.source_sha, path).records, history)) throw new Error('Published catalog history changed')
    result = { source: draft.source_sha, count: 0, notes: validateNotes(draft.notes) }
  } else {
    catalog.checkVersions(current.records, version)
    const source = head()
    result = await generateNotes(version, input.since, input.max, input.model)
    if (head() !== source || source !== result.source || !isDeepStrictEqual(current, catalog.load(path))) {
      throw new Error('Repository changed during generation')
    }
    git('switch', '--detach', source)
    catalog.prepend(path, {
      version, ...(input.bump && { version_type: input.bump }), source_sha: source, notes: result.notes,
    }, current)
    git('--literal-pathspecs', 'add', '--', path)
    git('--literal-pathspecs', '-c', 'user.name=github-actions[bot]', '-c',
      'user.email=github-actions[bot]@users.noreply.github.com', '-c', 'commit.gpgsign=false',
      'commit', '--only', '-m', 'docs: prepare v' + version + ' release notes', '--', path)
    verifyChanges(source, path)
    git('push', 'origin', 'HEAD:refs/heads/' + branch)
  }

  const issues = warnings(result.notes, input.max)
  const paths = preview(version, result.source, result.notes)
  const body = '## Release notes v' + version + '\n\n' + markdown(result.notes) +
    '\n\n---\n\nMerging this PR approves the release notes.\n'
  try {
    outputs['pr-url'] = await pulls.create(branch, 'docs: review v' + version + ' release notes', body)
    outputs['pr-created'] = true
  } catch (error) {
    const concurrent = await pulls.find(branch)
    if (!concurrent) throw error
    outputs['pr-url'] = concurrent
  }
  Object.assign(outputs, paths, {
    'source-sha': result.source, 'commit-count': result.count, 'warning-count': issues.length,
  })
  return { outputs, warnings: issues }
}
