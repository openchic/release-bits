import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { isDeepStrictEqual } from 'node:util'

function git(args, input) {
  // Git tree records can contain filenames that are not valid UTF-8.
  return execFileSync('git', args, {
    input,
    encoding: 'latin1',
    stdio: ['pipe', 'pipe', 'inherit'],
  })
}

function sha(ref) {
  return git(['rev-parse', '--verify', ref]).trim()
}

function readTree(ref) {
  const entries = new Map()
  for (const record of git(['ls-tree', '-z', ref]).split('\0')) {
    if (record) entries.set(record.slice(record.indexOf('\t') + 1), record)
  }
  return entries
}

function writeTree(entries) {
  const records = Array.from(entries.values(), (record) => record + '\0').join('')
  return git(['mktree', '-z'], Buffer.from(records, 'latin1')).trim()
}

function snapshotActionTree(packagePath) {
  const distPath = packagePath + '/dist'
  if (git(['diff', '--cached', '--name-only']).trim()) {
    throw new Error('Release index must be clean before staging generated dist')
  }
  git(['add', '-f', '--', distPath])
  try {
    const stagedTree = git(['write-tree']).trim()
    return sha(stagedTree + ':' + packagePath)
  } finally {
    git(['reset', '--quiet', 'HEAD', '--', distPath])
  }
}

function requireBuiltAction(packagePath) {
  const distPath = packagePath + '/dist'
  if (!existsSync(distPath) || !readdirSync(distPath).length) {
    throw new Error('Build the selected Action before publishing')
  }
}

function readPackage(ref, path) {
  const text = Buffer.from(git(['show', ref + ':' + path + '/package.json']), 'latin1')
    .toString('utf8')
  return JSON.parse(text)
}

function isAncestor(source, target) {
  try {
    git(['merge-base', '--is-ancestor', source, target])
    return true
  } catch (error) {
    if (error.status === 1) return false
    throw error
  }
}

function publicationBase(source, packagePath) {
  const main = sha('refs/remotes/origin/main')
  if (main === source) return main

  const stale = () => new Error('main changed since this run was verified; start a new publish run')
  if (!isAncestor(source, main)) throw stale()

  const changes = git(['diff', '--no-renames', '--name-status', '-z', source, main])
    .split('\0').filter(Boolean)
  // Queued runs can share a verified source. Only sibling version bumps are safe to carry forward.
  for (let index = 0; index < changes.length; index += 2) {
    const [status, path] = [changes[index], changes[index + 1]]
    const match = /^(actions\/[a-z][a-z0-9-]*)\/package\.json$/.exec(path)
    if (status !== 'M' || !match || match[1] === packagePath) throw stale()

    const { version: oldVersion, ...oldManifest } = readPackage(source, match[1])
    const { version: newVersion, ...newManifest } = readPackage(main, match[1])
    if (typeof oldVersion !== 'string' || typeof newVersion !== 'string' ||
        !isDeepStrictEqual(oldManifest, newManifest)) throw stale()
  }
  return main
}

function trailer(body, name) {
  return body.split('\n').find((line) => line.startsWith(name + ': '))?.slice(name.length + 2)
}

function snapshotSource(body) {
  return /^[a-z][a-z0-9-]*-source: (.+)$/im.exec(body)?.[1]
}

function releaseNotes(previousSource, source, packagePath, tag) {
  const range = previousSource ? previousSource + '..' + source : source
  const records = git(['log', '--format=%H%x1f%s', range, '--', packagePath])
    .trimEnd()
    .split('\n')
    .filter(Boolean)
    .map((record) => {
      const [commit, subject] = record.split('\x1f')
      const match = /^(feat|fix)(?:\([^)]*\))?!?:\s*(.+)$/.exec(subject)
      return match && { type: match[1], subject: match[2], commit }
    })
    .filter(Boolean)
  const sections = ['feat', 'fix'].map((type) => {
    const entries = records.filter((record) => record.type === type)
    if (!entries.length) return ''
    const heading = type === 'feat' ? 'Features' : 'Fixes'
    const bullets = entries.map(({ subject, commit }) => {
      const short = commit.slice(0, 7)
      const url = process.env.GITHUB_SERVER_URL + '/' + process.env.GITHUB_REPOSITORY +
        '/commit/' + commit
      return '- ' + subject + ' ([`' + short + '`](' + url + '))'
    })
    return '## ' + heading + '\n\n' + bullets.join('\n')
  }).filter(Boolean)
  const body = sections.length ? sections.join('\n\n') : 'No feat or fix commits for this release.'
  const sourceUrl = process.env.GITHUB_SERVER_URL + '/' + process.env.GITHUB_REPOSITORY +
    '/commit/' + source
  const notes = body + '\n\n---\n\nPublished from [' + source.slice(0, 7) + '](' +
    sourceUrl + ') as `' + tag + '`.\n'
  const output = process.env.RELEASE_BITS_RELEASE_NOTES_FILE
  if (!output) throw new Error('RELEASE_BITS_RELEASE_NOTES_FILE is required')
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, notes)
}

function promote(action, versionType, sourceRef) {
  if (!/^[a-z][a-z0-9-]*$/.test(action)) throw new Error('Invalid action name')
  if (!['major', 'minor', 'patch'].includes(versionType)) throw new Error('Invalid version type')

  const source = sha(sourceRef + '^{commit}')
  if (sha('HEAD') !== source) throw new Error('Checkout must match the source commit')
  if (git(['diff', '--cached', '--name-only']).trim()) {
    throw new Error('Release checkout must have a clean Git index')
  }
  const packagePath = 'actions/' + action
  git(['cat-file', '-e', source + ':' + packagePath + '/action.yml'])
  requireBuiltAction(packagePath)
  git(['fetch', '--force', '--tags', 'origin', 'refs/heads/main:refs/remotes/origin/main'])
  const tags = new Set(git(['tag', '--list']).trimEnd().split('\n').filter(Boolean))
  const actionTags = git(['tag', '--list', '--sort=-version:refname', action + '-v*'])
    .trimEnd().split('\n').filter(Boolean)

  let resumedTag = ''
  for (const name of actionTags) {
    const body = git(['log', '-1', '--format=%B', name])
    if (snapshotSource(body) === source) {
      resumedTag = name
      break
    }
  }

  const resumedIndex = actionTags.indexOf(resumedTag)
  const previousTag = resumedTag
    ? actionTags[resumedIndex + 1] || ''
    : actionTags[0] || ''
  const previousSource = previousTag
    ? snapshotSource(git(['log', '-1', '--format=%B', previousTag]))
    : ''
  const resumedSource = resumedTag
    ? snapshotSource(git(['log', '-1', '--format=%B', resumedTag]))
    : ''
  let version = JSON.parse(readFileSync(packagePath + '/package.json', 'utf8')).version
  let releaseSource = source

  if (!resumedTag) {
    const base = publicationBase(source, packagePath)
    if (actionTags.length) {
      const previousPackage = readPackage(actionTags[0], packagePath)
      if (previousPackage.version !== version) {
        throw new Error('Action package.json version does not match its latest release')
      }
    }
    if (base !== source) git(['switch', '--detach', base])

    try {
      execFileSync('pnpm', ['version', versionType, '--no-git-tag-version'], {
        cwd: packagePath,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      if (error.stderr) process.stderr.write(error.stderr)
      throw error
    }
    version = JSON.parse(readFileSync(packagePath + '/package.json', 'utf8')).version
    git(['add', '--', packagePath + '/package.json'])
    git([
      '-c', 'user.name=github-actions[bot]',
      '-c', 'user.email=github-actions[bot]@users.noreply.github.com',
      '-c', 'commit.gpgsign=false', 'commit', '--only',
      '-m', 'chore(' + action + '): release v' + version,
      '-m', 'release-bits-action: ' + action,
      '-m', 'release-bits-version: ' + version,
      '-m', 'release-bits-source: ' + source,
      '--', packagePath + '/package.json',
    ])
    releaseSource = sha('HEAD')
  }

  const tag = resumedTag || action + '-v' + version
  if (resumedTag) {
    releaseNotes(previousSource, resumedSource, packagePath, tag)
    return resumedTag
  }
  const alias = 'v' + version.split('.')[0]
  if (tags.has(tag)) throw new Error('Version already released from another source')
  const ref = 'refs/tags/' + alias
  const previous = tags.has(alias) ? sha(ref) : ''
  const root = previous ? readTree(previous + '^{tree}') : new Map()
  if (!previous) {
    const license = readTree(releaseSource).get('LICENSE')
    if (license) root.set('LICENSE', license)
  }
  const actions = root.has('actions') ? readTree(previous + ':actions') : new Map()
  actions.set(action, '040000 tree ' + snapshotActionTree(packagePath) + '\t' + action)
  root.set('actions', '040000 tree ' + writeTree(actions) + '\tactions')
  const parent = previous ? ['-p', sha(previous + '^{commit}')] : []
  const snapshot = git([
    '-c', 'user.name=github-actions[bot]',
    '-c', 'user.email=github-actions[bot]@users.noreply.github.com',
    '-c', 'commit.gpgsign=false', 'commit-tree', writeTree(root), ...parent,
    '-m', tag, '-m', 'release-bits-source: ' + source,
    '-m', 'release-bits-version-commit: ' + releaseSource,
  ]).trim()
  git(['push', '--atomic', '--force-with-lease=' + ref + ':' + previous, 'origin',
    releaseSource + ':refs/heads/main', snapshot + ':refs/tags/' + tag,
    snapshot + ':' + ref])

  releaseNotes(previousSource, source, packagePath, tag)

  return tag
}

try {
  const [action, versionType, source] = process.argv.slice(2)
  if (!action || !versionType || !source) throw new Error('Expected action, version type and source SHA')
  console.log(promote(action, versionType, source))
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
