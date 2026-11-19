// Preload only in smoke tests so the packaged Octokit client talks to a local fixture.
import { createServer } from 'node:http'
import { once } from 'node:events'

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const expected = process.env.GITHUB_REPOSITORY.split('/')[0] + ':changelogs/v1.2.3'
  const matches = req.method === 'GET' && url.pathname === '/repos/' + process.env.GITHUB_REPOSITORY + '/pulls' &&
    url.searchParams.get('head') === expected && url.searchParams.get('state') === 'open'
  res.writeHead(matches ? 200 : 400, { 'content-type': 'application/json' })
  res.end(JSON.stringify(matches ? [{ html_url: 'https://example.test/pull/12' }] : { message: 'unexpected request' }))
})
server.listen(0, '127.0.0.1')
await once(server, 'listening')
server.unref()
process.env.GITHUB_API_URL = 'http://127.0.0.1:' + server.address().port
process.env.no_proxy = '127.0.0.1'
