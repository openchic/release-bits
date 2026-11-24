import assert from 'node:assert/strict'
import { test } from 'node:test'
import { publishRelease, type ReleaseApi } from '../src/publish.ts'
import type { ReleaseAsset } from '../src/prepare.ts'

const assets: ReleaseAsset[] = [
  { path: '/workspace/App.dmg', name: 'App.dmg', size: 10 },
  { path: '/workspace/App-intel.dmg', name: 'App-intel.dmg', size: 5 },
]

function api(overrides: Partial<ReleaseApi> = {}, calls: string[] = []): ReleaseApi {
  return {
    hasRelease: async (tagName) => { calls.push(`find-release:${tagName}`); return false },
    createTag: async (tagName, targetCommit) => { calls.push(`tag:${tagName}:${targetCommit}`) },
    createDraft: async ({ tagName, body }) => {
      calls.push(`draft:${tagName}:${body}`)
      return {
        id: 7,
        url: 'https://example.test/releases/v1.2.3',
        uploadUrl: 'https://uploads.example.test/releases/7/assets{?name,label}',
      }
    },
    uploadAsset: async (_release, asset) => { calls.push('upload:' + asset.name) },
    publishDraft: async () => {
      calls.push('publish')
      return { url: 'https://example.test/releases/v1.2.3' }
    },
    ...overrides,
  }
}

test('creates the tag and draft, uploads all assets, then publishes the Release', async () => {
  const calls: string[] = []
  const result = await publishRelease('1.2.3', '- Fixed the issue.', 'a'.repeat(40), assets,
    api({}, calls))

  assert.deepEqual(result, {
    tagName: 'v1.2.3',
    url: 'https://example.test/releases/v1.2.3',
  })
  assert.deepEqual(calls, [
    'find-release:v1.2.3',
    `tag:v1.2.3:${'a'.repeat(40)}`,
    'draft:v1.2.3:- Fixed the issue.',
    'upload:App.dmg',
    'upload:App-intel.dmg',
    'publish',
  ])
})

test('creates and publishes a Release without assets', async () => {
  const calls: string[] = []
  await publishRelease('1.2.3', '- Fixed the issue.', 'a'.repeat(40), [], api({}, calls))
  assert.equal(calls.at(-1), 'publish')
  assert.equal(calls.includes('upload:App.dmg'), false)
})

test('refuses an existing Release or tag before creating a draft', async () => {
  const releaseCalls: string[] = []
  await assert.rejects(publishRelease('1.2.3', 'notes', 'a'.repeat(40), [], api({
    hasRelease: async () => { releaseCalls.push('release'); return true },
  }, releaseCalls)), /Release v1\.2\.3 already exists/)
  assert.deepEqual(releaseCalls, ['release'])

  const tagCalls: string[] = []
  await assert.rejects(publishRelease('1.2.3', 'notes', 'a'.repeat(40), [], api({
    createTag: async () => {
      tagCalls.push('tag')
      throw Object.assign(new Error('Reference already exists'), { status: 422 })
    },
  }, tagCalls)), /Unable to create tag v1\.2\.3: Reference already exists/)
  assert.deepEqual(tagCalls, ['find-release:v1.2.3', 'tag'])
})

test('reports the created tag when draft creation fails', async () => {
  await assert.rejects(publishRelease('1.2.3', 'notes', 'a'.repeat(40), [], api({
    createDraft: async () => { throw new Error('draft creation denied') },
  })), /tag v1\.2\.3 was created.*draft creation denied/)
})

test('keeps a failed asset upload unpublished and reports the draft URL and tag', async () => {
  let published = false
  await assert.rejects(publishRelease('1.2.3', 'notes', 'a'.repeat(40), assets, api({
    uploadAsset: async () => { throw new Error('upload denied') },
    publishDraft: async () => { published = true; return { url: '' } },
  })), /Release at https:\/\/example\.test\/releases\/v1\.2\.3 and tag v1\.2\.3: upload denied/)
  assert.equal(published, false)
})

test('reports the Release URL and API error when publication fails', async () => {
  await assert.rejects(publishRelease('1.2.3', 'notes', 'a'.repeat(40), [], api({
    publishDraft: async () => { throw new Error('publish denied') },
  })), /check the Release at .*publish denied/)
})

test('propagates preflight API errors before attempting to write', async () => {
  const error = Object.assign(new Error('Forbidden'), { status: 403 })
  await assert.rejects(publishRelease('1.2.3', 'notes', 'a'.repeat(40), [], api({
    hasRelease: async () => { throw error },
  })), error)
})
