import assert from 'node:assert/strict'
import { test } from 'node:test'
import { publishRelease, type Release, type ReleaseApi } from '../src/publish.ts'

const commit = 'a'.repeat(40)
const url = 'https://example.test/releases/v1.2.3'
const input = {
  version: '1.2.3',
  body: '- Fixed the issue.',
  targetCommit: commit,
  assets: [
    { name: 'App.dmg', blob: new Blob(['universal!']), size: 10, sha256: 'a'.repeat(64) },
    { name: 'App-intel.dmg', blob: new Blob(['intel']), size: 5, sha256: 'b'.repeat(64) },
  ],
}

function fixture(tagCommit?: string) {
  const writes: string[] = []
  const assets: Awaited<ReturnType<ReleaseApi['listAssets']>> = []
  const state: { commit?: string, release?: Release } = { commit: tagCommit }
  const api: ReleaseApi = {
    findTagCommit: async () => state.commit,
    findRelease: async () => state.release,
    getRelease: async (id) => {
      assert.equal(id, state.release?.id)
      return state.release!
    },
    createTag: async (tag, sha) => {
      writes.push(`tag:${tag}`)
      state.commit = sha
    },
    createDraft: async (name, body) => {
      writes.push(`draft:${name}`)
      const release = { id: 7, url, uploadUrl: '', tagName: name, name, body, draft: true, prerelease: false }
      state.release = release
      return release
    },
    listAssets: async () => assets,
    deleteAsset: async (id) => {
      writes.push(`delete:${id}`)
      assets.splice(assets.findIndex((asset) => asset.id === id), 1)
    },
    uploadAsset: async (_release, asset) => {
      writes.push(`upload:${asset.name}`)
      assets.push({
        id: 7 + assets.length, name: asset.name, label: null, state: 'uploaded',
        size: asset.size, digest: `sha256:${asset.sha256}`,
      })
    },
    publishDraft: async (id, body, sha) => {
      assert.equal(id, state.release?.id)
      assert.equal(sha, commit)
      writes.push('publish')
      state.release = { ...state.release!, body, draft: false }
      return url
    },
  }
  return { api, assets, state, writes }
}

test('creates a tag and draft, verifies assets, and publishes the English notes', async () => {
  const { api, state, writes } = fixture()
  const result = await publishRelease(input, api)
  assert.deepEqual(result, { tagName: 'v1.2.3', url })
  assert.deepEqual(writes, ['tag:v1.2.3', 'draft:v1.2.3', 'upload:App.dmg', 'upload:App-intel.dmg', 'publish'])
  assert.equal(state.release?.body, input.body)
})

test('can use an independently named existing tag and publish without assets', async () => {
  const { api, writes } = fixture(commit)
  const tag = 'app/v1.2.3'
  const result = await publishRelease({ ...input, existingTag: tag, assets: [] }, api)
  assert.equal(result.tagName, tag)
  assert.deepEqual(writes, [`draft:${tag}`, 'publish'])
})

test('rejects a missing explicit tag or a different commit before writing', async () => {
  for (const remoteCommit of [undefined, 'different']) {
    const { api, writes } = fixture(remoteCommit)
    await assert.rejects(publishRelease({ ...input, existingTag: 'app-1.2.3' }, api), /Remote tag app-1\.2\.3/)
    assert.deepEqual(writes, [])
  }
})

test('reuses the default tag after the tag creation response was lost', async () => {
  const { api, writes } = fixture()
  const createTag = api.createTag
  api.createTag = async (tag, sha) => {
    await createTag(tag, sha)
    throw new Error('Request timed out')
  }
  await assert.rejects(publishRelease(input, api), /Request timed out/)
  await publishRelease(input, api)
  assert.equal(writes.filter((write) => write.startsWith('tag:')).length, 1)
  assert.equal(writes.at(-1), 'publish')
})

test('resumes a draft after partial upload, skips the verified asset and replaces the starter', async () => {
  const { api, assets, state, writes } = fixture()
  const upload = api.uploadAsset
  api.uploadAsset = async (release, asset) => {
    if (asset.name === 'App.dmg') return upload(release, asset)
    assets.push({ id: 123, name: asset.name, label: null, state: 'starter', size: 0 })
    throw new Error('502 Bad Gateway')
  }
  await assert.rejects(publishRelease(input, api), /https:\/\/example\.test\/releases.*502/)
  assert.equal(state.release?.draft, true)
  assert.match(state.release?.body || '', /<!-- release-bits:publish:v1:[a-f0-9]{64} -->/)

  await assert.rejects(publishRelease({ ...input, assets: input.assets.slice(0, 1) }, api), /does not match/)
  writes.length = 0
  api.uploadAsset = upload
  await publishRelease({ ...input, assets: [...input.assets].reverse() }, api)
  assert.deepEqual(writes, ['delete:123', 'upload:App-intel.dmg', 'publish'])
})

test('refuses to overwrite a completed asset that does not match the draft', async () => {
  const { api, assets, writes } = fixture(commit)
  const publish = api.publishDraft
  api.publishDraft = async () => { throw new Error('publication failed') }
  await assert.rejects(publishRelease(input, api), /publication failed/)
  assets[0].digest = 'sha256:different'
  api.publishDraft = publish
  writes.length = 0
  await assert.rejects(publishRelease(input, api), /does not match the requested file: App\.dmg/)
  assert.deepEqual(writes, [])
})

test('rejects an unrelated draft or a changed draft body', async () => {
  const { api, writes } = fixture(commit)
  await api.createDraft('v1.2.3', 'Edited notes', commit)
  writes.length = 0
  await assert.rejects(publishRelease(input, api), /does not match the requested publication/)
  assert.deepEqual(writes, [])
})

test('returns the published URL after a lost response and rejects different published assets', async () => {
  const { api, assets, writes } = fixture(commit)
  const publish = api.publishDraft
  api.publishDraft = async (...args) => {
    await publish(...args)
    throw new Error('Request timed out')
  }
  await assert.rejects(publishRelease(input, api), /Request timed out/)
  writes.length = 0
  assert.deepEqual(await publishRelease(input, api), { tagName: 'v1.2.3', url })
  assets.pop()
  await assert.rejects(publishRelease(input, api), /Published Release is missing assets: App-intel\.dmg/)
  assert.deepEqual(writes, [])
})

test('does not publish a draft if the tag moves during upload', async () => {
  const { api, state, writes } = fixture(commit)
  const upload = api.uploadAsset
  api.uploadAsset = async (release, asset) => {
    await upload(release, asset)
    state.commit = 'different'
  }
  await assert.rejects(publishRelease(input, api), /Remote tag v1\.2\.3 points to different/)
  assert.equal(state.release?.draft, true)
  assert(!writes.includes('publish'))
})

test('does not overwrite edits made to the draft during upload', async () => {
  const { api, state, writes } = fixture(commit)
  const upload = api.uploadAsset
  api.uploadAsset = async (release, asset) => {
    await upload(release, asset)
    state.release = { ...release, body: 'Edited during upload' }
  }
  await assert.rejects(publishRelease(input, api), /does not match the requested publication/)
  assert.equal(state.release?.body, 'Edited during upload')
  assert.equal(state.release?.draft, true)
  assert(!writes.includes('publish'))
})
