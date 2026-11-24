import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { statSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs'

const repository = process.env.GITHUB_REPOSITORY
const existingTag = process.env['INPUT_TAG-NAME']
const tag = existingTag || 'v1.2.3'
const notes = '- Fixed the release fixture.'
const prefix = '/repos/' + repository
const hasDraft = process.env.FIXTURE_EXISTING_DRAFT === 'true'
let checkedLastPage = false
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const tagObject = 'd'.repeat(40)
let tagCommit = existingTag || hasDraft ? head : undefined
let createdDraft
const assets = []
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const path = decodeURIComponent(url.pathname)
  const chunks = []
  try {
    for await (const chunk of req) chunks.push(chunk)
  } catch (error) {
    if (req.aborted) return
    throw error
  }
  const body = Buffer.concat(chunks).toString('utf8')
  let status = 404
  let value = { message: 'Not Found' }

  if (req.method === 'GET' && path === prefix + '/git/ref/tags/' + tag) {
    if (tagCommit) {
      status = 200
      value = { object: existingTag ? { type: 'tag', sha: tagObject } : { type: 'commit', sha: tagCommit } }
    }
  } else if (req.method === 'GET' && path === prefix + '/git/tags/' + tagObject) {
    status = 200
    value = { object: { type: 'commit', sha: tagCommit } }
  } else if (req.method === 'GET' && path === prefix + '/releases') {
    status = 200
    if (url.searchParams.get('page') === '2') {
      checkedLastPage = true
      value = hasDraft ? [{ id: 12, tag_name: tag, name: tag, body: notes, draft: true, prerelease: false }] : []
    } else {
      url.host = '127.0.0.1:' + server.address().port
      url.searchParams.set('page', '2')
      res.setHeader('link', `<${url}>; rel="next"`)
      value = [{ tag_name: 'v1.2.2', draft: false }]
    }
  } else if (req.method === 'POST' && path === prefix + '/git/refs') {
    const { ref, sha } = JSON.parse(body)
    if (checkedLastPage && !tagCommit && ref === 'refs/tags/' + tag && sha === head) {
      status = 201
      value = { ref, object: { sha, type: 'commit' } }
      tagCommit = sha
    } else {
      status = 400
      value = { message: 'Unexpected tag creation' }
    }
  } else if (req.method === 'POST' && path === prefix + '/releases') {
    const release = JSON.parse(body)
    if (tagCommit && release.tag_name === tag && release.name === tag && release.draft === true &&
        release.target_commitish === head && release.body.startsWith(notes + '\n\n<!-- release-bits:publish:v1:')) {
      const asset = process.env.FIXTURE_MUTABLE_ASSET
      if (process.env.FIXTURE_ASSET_CHANGE === 'delete') unlinkSync(asset)
      if (process.env.FIXTURE_ASSET_CHANGE === 'replace') {
        const { size, atime, mtime } = statSync(asset)
        writeFileSync(asset, Buffer.alloc(size, 'x'))
        utimesSync(asset, atime, mtime)
      }
      status = 201
      value = createdDraft = {
        id: 12,
        tag_name: tag,
        name: tag,
        body: release.body,
        draft: true,
        prerelease: false,
        html_url: 'https://example.test/releases/' + tag,
        upload_url: 'http://127.0.0.1:' + server.address().port + '/uploads/12/assets{?name,label}',
      }
    } else {
      status = 400
      value = { message: 'Unexpected release payload' }
    }
  } else if (req.method === 'GET' && path === prefix + '/releases/12' && createdDraft) {
    status = 200
    value = createdDraft
  } else if (req.method === 'GET' && path === prefix + '/releases/12/assets') {
    status = 200
    value = assets
  } else if (req.method === 'POST' && path === '/uploads/12/assets') {
    if (url.searchParams.get('name') === 'asset.txt' &&
        req.headers.authorization === 'token fixture' &&
        req.headers['content-type'] === 'application/octet-stream' &&
        Number(req.headers['content-length']) === Buffer.byteLength(body) &&
        body === 'release-bits asset fixture\n') {
      status = 201
      value = {
        id: 42, name: 'asset.txt', label: url.searchParams.get('label'), state: 'uploaded',
        size: Buffer.byteLength(body), digest: 'sha256:' + createHash('sha256').update(body).digest('hex'),
      }
      assets.push(value)
    } else {
      status = 400
      value = { message: 'Unexpected release asset request' }
    }
  } else if (req.method === 'PATCH' && path === prefix + '/releases/12') {
    const update = JSON.parse(body)
    if (update.draft === false && update.body === notes && update.target_commitish === head && assets.length) {
      status = 200
      value = {
        id: 12,
        tag_name: tag,
        draft: false,
        html_url: 'https://example.test/releases/' + tag,
      }
    } else {
      status = 400
      value = { message: 'Unexpected release update' }
    }
  } else {
    status = 400
    value = { message: 'Unexpected request: ' + req.method + ' ' + url.pathname }
  }

  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(value))
})

server.listen(0, '127.0.0.1')
await once(server, 'listening')
server.unref()
process.env.GITHUB_API_URL = 'http://127.0.0.1:' + server.address().port
process.env.NO_PROXY = '127.0.0.1'
process.env.no_proxy = '127.0.0.1'
