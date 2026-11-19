import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

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

function readPackage(ref, path) {
  const text = Buffer.from(git(['show', ref + ':' + path + '/package.json']), 'latin1')
    .toString('utf8')
  return JSON.parse(text)
}

function trailer(body, name) {
  return body.split('\n').find((line) => line.startsWith(name + ': '))?.slice(name.length + 2)
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
  const output = process.env.SHIPKIT_RELEASE_NOTES_FILE
  if (!output) throw new Error('SHIPKIT_RELEASE_NOTES_FILE is required')
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, notes)
}

function promote(action, versionType, sourceRef) {
  if (!/^[a-z][a-z0-9-]*$/.test(action)) throw new Error('Invalid action name')
  if (!['major', 'minor', 'patch'].includes(versionType)) throw new Error('Invalid version type')

  const source = sha(sourceRef + '^{commit}')
  if (sha('HEAD') !== source) throw new Error('Checkout must match the source commit')
  const packagePath = 'actions/' + action
  git(['cat-file', '-e', source + ':' + packagePath + '/action.yml'])
  git(['fetch', '--force', '--tags', 'origin'])
  const tags = new Set(git(['tag', '--list']).trimEnd().split('\n').filter(Boolean))
  const sourceTrailer = 'Shipkit-source: ' + source
  const actionTags = git(['tag', '--list', '--sort=-version:refname', action + '-v*'])
    .trimEnd().split('\n').filter(Boolean)

  let resumedTag = ''
  for (const name of actionTags) {
    const body = git(['log', '-1', '--format=%B', name])
    if (body.split('\n').includes(sourceTrailer)) {
      resumedTag = name
      break
    }
  }

  const resumedIndex = actionTags.indexOf(resumedTag)
  const previousTag = resumedTag
    ? actionTags[resumedIndex + 1] || ''
    : actionTags[0] || ''
  const previousSource = previousTag
    ? trailer(git(['log', '-1', '--format=%B', previousTag]), 'Shipkit-source')
    : ''
  const resumedSource = resumedTag
    ? trailer(git(['log', '-1', '--format=%B', resumedTag]), 'Shipkit-source')
    : ''
  let version = JSON.parse(readFileSync(packagePath + '/package.json', 'utf8')).version
  let releaseSource = source

  if (!resumedTag) {
    if (actionTags.length) {
      const previousPackage = readPackage(actionTags[0], packagePath)
      if (previousPackage.version !== version) {
        throw new Error('Action package.json version does not match its latest release')
      }
    }

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
      '-m', 'Shipkit-action: ' + action,
      '-m', 'Shipkit-version: ' + version,
      '-m', 'Shipkit-source: ' + source,
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
  actions.set(action, '040000 tree ' + sha(releaseSource + ':' + packagePath) + '\t' + action)
  root.set('actions', '040000 tree ' + writeTree(actions) + '\tactions')
  const parent = previous ? ['-p', sha(previous + '^{commit}')] : []
  const snapshot = git([
    '-c', 'user.name=github-actions[bot]',
    '-c', 'user.email=github-actions[bot]@users.noreply.github.com',
    '-c', 'commit.gpgsign=false', 'commit-tree', writeTree(root), ...parent,
    '-m', tag, '-m', 'Shipkit-source: ' + source,
    '-m', 'Shipkit-version-commit: ' + releaseSource,
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
