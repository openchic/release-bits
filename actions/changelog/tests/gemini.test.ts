import assert from 'node:assert/strict'
import { test, type TestContext } from 'node:test'
import { requestNotes } from '../src/gemini.ts'

const key = 'fixture-api-key'

function mockFetch(t: TestContext, fetch: typeof globalThis.fetch) {
  const previous = process.env.LLM_API_KEY
  process.env.LLM_API_KEY = key
  t.after(() => {
    if (previous === undefined) delete process.env.LLM_API_KEY
    else process.env.LLM_API_KEY = previous
  })
  return t.mock.method(globalThis, 'fetch', fetch)
}

test('sends the Gemini key in a header and extracts structured bilingual notes', async (t) => {
  const notes = { 'zh-CN': ['修复了显示。'], en: ['Fixed display.'] }
  const fetch = mockFetch(t, async (url, init) => {
    assert.equal(String(url), 'https://generativelanguage.googleapis.com/v1beta/models/test%2Fmodel:generateContent')
    assert.equal(init?.method, 'POST')
    const headers = new Headers(init?.headers)
    assert.equal(headers.get('x-goog-api-key'), key)
    assert.equal(headers.get('content-type'), 'application/json')
    const body = JSON.parse(String(init?.body))
    assert.deepEqual(body.contents, [{ parts: [{ text: 'fixture prompt' }] }])
    assert.equal(body.generationConfig.responseMimeType, 'application/json')
    assert.deepEqual(body.generationConfig.responseSchema.properties.notes.required, ['zh-CN', 'en'])
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ notes }) }] } }] })
  })

  assert.deepEqual(await requestNotes('fixture prompt', 'test/model'), notes)
  assert.equal(fetch.mock.callCount(), 1)
})

for (const { name, reply, error } of [
  { name: 'HTTP 429', reply: () => new Response(null, { status: 429 }), error: /HTTP 429/ },
  { name: 'missing candidates', reply: () => Response.json({}), error: /no valid structured notes/ },
  { name: 'invalid candidate JSON', reply: () => Response.json({ candidates: [{ content: { parts: [{ text: '{' }] } }] }),
    error: /no valid structured notes/ },
  { name: 'timeout', reply: () => { throw new DOMException('fixture timeout', 'TimeoutError') }, error: /fixture timeout/ },
]) {
  test(`reports Gemini ${name} without retrying the request`, async (t) => {
    const fetch = mockFetch(t, async () => reply())
    await assert.rejects(requestNotes('fixture prompt', 'test'), error)
    assert.equal(fetch.mock.callCount(), 1)
  })
}
