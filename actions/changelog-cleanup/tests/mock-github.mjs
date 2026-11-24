import assert from 'node:assert/strict'
import { appendFileSync } from 'node:fs'

const repository = 'openchic/app'
const branch = 'changelogs/v1.2.3'
const prefix = `/repos/${repository}`
const record = (call) => appendFileSync(process.env.FIXTURE_CALLS, `${call}\n`)

globalThis.fetch = async (input, init) => {
  const request = new Request(input, init)
  const url = new URL(request.url)
  const path = decodeURIComponent(url.pathname)
  assert.equal(url.origin, 'https://github.test')
  assert.equal(request.headers.get('authorization'), 'token fixture')

  if (request.method === 'GET' && path === `${prefix}/git/ref/heads/${branch}`) {
    record('read')
    return Response.json({ object: { sha: 'a'.repeat(40) } })
  }
  if (request.method === 'GET' && path === `${prefix}/pulls`) {
    assert.equal(url.searchParams.get('state'), 'open')
    assert.equal(url.searchParams.get('head'), `openchic:${branch}`)
    if (url.searchParams.get('page') === '2') {
      record('pulls:2')
      return Response.json(process.env.FIXTURE_OPEN_PR === 'true'
        ? [{ head: { ref: branch, repo: { full_name: repository } } }] : [])
    }
    record('pulls:1')
    url.searchParams.set('page', '2')
    return Response.json([], { headers: { link: `<${url}>; rel="next"` } })
  }
  if (request.method === 'DELETE' && path === `${prefix}/git/refs/heads/${branch}`) {
    record('delete')
    if (process.env.FIXTURE_DELETE_STATUS === '403') {
      return Response.json({ message: 'fixture denied branch deletion' }, { status: 403 })
    }
    return new Response(null, { status: 204 })
  }
  assert.fail(`Unexpected request: ${request.method} ${path}`)
}
