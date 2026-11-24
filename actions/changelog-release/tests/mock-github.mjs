import { createServer } from 'node:http'
import { once } from 'node:events'
import { unlinkSync } from 'node:fs'

const repository = process.env.GITHUB_REPOSITORY
const tag = 'v1.2.3'
const prefix = '/repos/' + repository
const hasDraft = process.env.FIXTURE_EXISTING_DRAFT === 'true'
let checkedLastPage = false
let tagCreated = false
let assetUploaded = false
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const body = Buffer.concat(chunks).toString('utf8')
  let status = 404
  let value = { message: 'Not Found' }

  if (req.method === 'GET' && url.pathname === prefix + '/releases') {
    status = 200
    if (url.searchParams.get('page') === '2') {
      checkedLastPage = true
      value = hasDraft ? [{ tag_name: tag, draft: true }] : []
    } else {
      url.host = '127.0.0.1:' + server.address().port
      url.searchParams.set('page', '2')
      res.setHeader('link', `<${url}>; rel="next"`)
      value = [{ tag_name: 'v1.2.2', draft: false }]
    }
  } else if (req.method === 'POST' && url.pathname === prefix + '/git/refs') {
    const { ref, sha } = JSON.parse(body)
    if (checkedLastPage && !hasDraft && ref === 'refs/tags/' + tag && /^[0-9a-f]{40}$/.test(sha)) {
      status = 201
      value = { ref, object: { sha, type: 'commit' } }
      tagCreated = true
    } else {
      status = 400
      value = { message: 'Unexpected tag creation' }
    }
  } else if (req.method === 'POST' && url.pathname === prefix + '/releases') {
    const release = JSON.parse(body)
    if (tagCreated && release.tag_name === tag && release.name === tag && release.draft === true &&
        release.body === '- Fixed the release fixture.') {
      if (process.env.FIXTURE_DISAPPEARING_ASSET) unlinkSync(process.env.FIXTURE_DISAPPEARING_ASSET)
      status = 201
      value = {
        id: 12,
        tag_name: tag,
        name: tag,
        body: release.body,
        draft: true,
        html_url: 'https://example.test/releases/' + tag,
        upload_url: 'http://127.0.0.1:' + server.address().port + '/uploads/12/assets{?name,label}',
      }
    } else {
      status = 400
      value = { message: 'Unexpected release payload' }
    }
  } else if (req.method === 'POST' && url.pathname === '/uploads/12/assets') {
    if (url.searchParams.get('name') === 'asset.txt' &&
        req.headers.authorization === 'token fixture' &&
        req.headers['content-type'] === 'application/octet-stream' &&
        Number(req.headers['content-length']) === Buffer.byteLength(body) &&
        body === 'release-bits asset fixture\n') {
      status = 201
      value = { name: 'asset.txt', state: 'uploaded' }
      assetUploaded = true
    } else {
      status = 400
      value = { message: 'Unexpected release asset request' }
    }
  } else if (req.method === 'PATCH' && url.pathname === prefix + '/releases/12') {
    if (JSON.parse(body).draft === false && assetUploaded) {
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
