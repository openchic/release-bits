import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { existsSync, readFileSync, statSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs'

const repository = process.env.GITHUB_REPOSITORY
const existingTag = process.env['INPUT_TAG-NAME']
const tag = existingTag || 'v1.2.3'
const notes = '- Fixed the release fixture.'
const prefix = '/repos/' + repository
const draftMode = process.env.FIXTURE_DRAFT_STATE
const retryState = process.env.FIXTURE_RETRY_STATE
const saved = retryState && existsSync(retryState) ? JSON.parse(readFileSync(retryState, 'utf8')) : {}
const expectedAssets = retryState ? new Map([
  ['App.dmg', Buffer.from([0, 255, 128, 10])],
  ['App-intel.dmg', Buffer.from([1, 254, 129, 13])],
]) : new Map([['asset.txt', Buffer.from('release-bits asset fixture\n')]])
const unrelatedDraft = { id: 13, tag_name: tag, name: tag, body: notes, draft: true, prerelease: false }
let checkedLastPage = false
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const tagObject = 'd'.repeat(40)
let tagCommit = saved.tagCommit ?? (existingTag || draftMode ? head : undefined)
let createdDraft = saved.createdDraft
const assets = saved.assets || []
const writes = saved.writes || []

function draftResponse() {
  return { ...createdDraft,
    upload_url: 'http://127.0.0.1:' + server.address().port + '/uploads/12/assets{?name,label}' }
}
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
  const body = Buffer.concat(chunks)
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
      value = createdDraft ? [draftResponse()] : draftMode ? [unrelatedDraft] : []
    } else {
      url.host = '127.0.0.1:' + server.address().port
      url.searchParams.set('page', '2')
      res.setHeader('link', `<${url}>; rel="next"`)
      value = draftMode === 'duplicate'
        ? [{ ...unrelatedDraft, id: 14, draft: false }]
        : [{ tag_name: 'v1.2.2', draft: false }]
    }
  } else if (req.method === 'POST' && path === prefix + '/git/refs') {
    const { ref, sha } = JSON.parse(body)
    if (checkedLastPage && !tagCommit && ref === 'refs/tags/' + tag && sha === head) {
      status = 201
      value = { ref, object: { sha, type: 'commit' } }
      tagCommit = sha
      writes.push('tag')
    } else {
      status = 400
      value = { message: 'Unexpected tag creation' }
    }
  } else if (req.method === 'POST' && path === prefix + '/releases') {
    const release = JSON.parse(body)
    if (tagCommit && !createdDraft && release.tag_name === tag && release.name === tag && release.draft === true &&
        release.target_commitish === head && release.body.startsWith(notes + '\n\n<!-- release-bits:publish:v1:')) {
      const asset = process.env.FIXTURE_MUTABLE_ASSET
      if (process.env.FIXTURE_ASSET_CHANGE === 'delete') unlinkSync(asset)
      if (process.env.FIXTURE_ASSET_CHANGE === 'replace') {
        const { size, atime, mtime } = statSync(asset)
        writeFileSync(asset, Buffer.alloc(size, 'x'))
        utimesSync(asset, atime, mtime)
      }
      status = 201
      createdDraft = {
        id: 12,
        tag_name: tag,
        name: tag,
        body: release.body,
        draft: true,
        prerelease: false,
        html_url: 'https://example.test/releases/' + tag,
      }
      value = draftResponse()
      writes.push('draft')
    } else {
      status = 400
      value = { message: 'Unexpected release payload' }
    }
  } else if (req.method === 'GET' && path === prefix + '/releases/12' && createdDraft) {
    status = 200
    value = draftResponse()
  } else if (req.method === 'GET' && path === prefix + '/releases/12/assets') {
    status = 200
    value = assets
  } else if (req.method === 'DELETE' && path === prefix + '/releases/assets/99') {
    const starter = assets.findIndex((asset) => asset.id === 99 && asset.state === 'starter')
    if (starter >= 0) {
      assets.splice(starter, 1)
      writes.push('delete:99')
      status = 204
    }
  } else if (req.method === 'POST' && path === '/uploads/12/assets') {
    const name = url.searchParams.get('name')
    const expected = expectedAssets.get(name)
    if (createdDraft?.draft && expected && !assets.some((asset) => asset.name === name) &&
        req.headers.authorization === 'token fixture' &&
        req.headers['content-type'] === 'application/octet-stream' &&
        Number(req.headers['content-length']) === body.length && expected.equals(body)) {
      if (retryState && name === 'App-intel.dmg' && !writes.includes('interrupted')) {
        status = 502
        value = { message: 'fixture upload interrupted' }
        assets.push({ id: 99, name, label: null, state: 'starter', size: 0 })
        writes.push('interrupted')
      } else {
        status = 201
        value = {
          id: 42 + assets.length, name, label: url.searchParams.get('label'), state: 'uploaded',
          size: body.length, digest: 'sha256:' + createHash('sha256').update(body).digest('hex'),
        }
        assets.push(value)
        writes.push('upload:' + name)
      }
    } else {
      status = 400
      value = { message: 'Unexpected release asset request' }
    }
  } else if (req.method === 'PATCH' && path === prefix + '/releases/12') {
    const update = JSON.parse(body)
    if (createdDraft?.draft && update.draft === false && update.body === notes && update.target_commitish === head &&
        assets.filter((asset) => asset.state === 'uploaded').length === expectedAssets.size) {
      status = 200
      createdDraft = { ...createdDraft, draft: false, body: notes }
      value = draftResponse()
      writes.push('publish')
    } else {
      status = 400
      value = { message: 'Unexpected release update' }
    }
  } else {
    status = 400
    value = { message: 'Unexpected request: ' + req.method + ' ' + url.pathname }
  }

  if (retryState) writeFileSync(retryState, JSON.stringify({ tagCommit, createdDraft, assets, writes }))
  res.writeHead(status, { 'content-type': 'application/json', connection: 'close' })
  res.end(JSON.stringify(value))
})

server.listen(0, '127.0.0.1')
await once(server, 'listening')
server.unref()
process.env.GITHUB_API_URL = 'http://127.0.0.1:' + server.address().port
process.env.NO_PROXY = '127.0.0.1'
process.env.no_proxy = '127.0.0.1'
