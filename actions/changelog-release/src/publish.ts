import { createHash } from 'node:crypto'
import type { ReleaseAsset } from './prepare.ts'

export type Release = {
  id: number
  url: string
  uploadUrl: string
  tagName: string
  name: string | null
  body?: string | null
  draft: boolean
  prerelease: boolean
}

type RemoteAsset = {
  id: number
  name: string
  label: string | null
  state: string
  size: number
  digest?: string | null
}

export type ReleaseApi = {
  findRelease: (tagName: string) => Promise<Release | undefined>
  findTagCommit: (tagName: string) => Promise<string | undefined>
  createTag: (tagName: string, targetCommit: string) => Promise<void>
  getRelease: (releaseId: number) => Promise<Release>
  createDraft: (tagName: string, body: string, targetCommit: string) => Promise<Release>
  listAssets: (releaseId: number) => Promise<RemoteAsset[]>
  deleteAsset: (assetId: number) => Promise<void>
  uploadAsset: (release: Release, asset: ReleaseAsset) => Promise<void>
  publishDraft: (releaseId: number, body: string, targetCommit: string) => Promise<string>
}

type Publication = {
  version: string
  body: string
  targetCommit: string
  assets: ReleaseAsset[]
  existingTag?: string
}

function assertTag(tagName: string, actual: string | undefined, expected: string) {
  if (!actual) throw new Error(`Remote tag ${tagName} does not exist`)
  if (actual !== expected) {
    throw new Error(`Remote tag ${tagName} points to ${actual}, expected ${expected}`)
  }
}

function draftBody({ version, body, targetCommit, assets }: Publication) {
  const files = assets.map(({ name, size, sha256 }) => JSON.stringify([name, size, sha256])).sort()
  const fingerprint = createHash('sha256').update(JSON.stringify([version, targetCommit, body, files]))
  return `${body}\n\n<!-- release-bits:publish:v1:${fingerprint.digest('hex')} -->`
}

function assertRelease(release: Release, tagName: string, expectedBody: string) {
  if (release.tagName !== tagName || release.name !== tagName || release.prerelease || release.body !== expectedBody) {
    throw new Error(`Release ${tagName} does not match the requested publication`)
  }
}

function compareAssets(release: Release, expectedAssets: ReleaseAsset[], remoteAssets: RemoteAsset[]) {
  const pending = new Map(expectedAssets.map((asset) => [asset.name, asset]))
  const starters = new Map<string, number>()
  for (const asset of remoteAssets) {
    const name = pending.has(asset.name) ? asset.name : asset.label || asset.name
    const expected = pending.get(name)
    if (!expected || starters.has(name)) throw new Error(`Unexpected Release asset: ${asset.name}`)
    if (release.draft && asset.state === 'starter' && asset.size === 0) {
      starters.set(name, asset.id)
    } else if (asset.state === 'uploaded' && asset.size === expected.size &&
               asset.digest === `sha256:${expected.sha256}`) {
      pending.delete(name)
    } else {
      throw new Error(`Release asset does not match the requested file: ${name}`)
    }
  }
  return { pending, starters }
}

export async function publishRelease(publication: Publication, api: ReleaseApi) {
  const { version, body, targetCommit, assets, existingTag } = publication
  if (!targetCommit) throw new Error('Checked-out commit is required')
  const tagName = existingTag || `v${version}`
  const expectedDraftBody = draftBody(publication)
  let release: Release | undefined

  try {
    const remoteCommit = await api.findTagCommit(tagName)
    release = await api.findRelease(tagName)
    if (remoteCommit || existingTag || release) {
      assertTag(tagName, remoteCommit, targetCommit)
    } else {
      await api.createTag(tagName, targetCommit)
    }

    release ??= await api.createDraft(tagName, expectedDraftBody, targetCommit)
    assertRelease(release, tagName, release.draft ? expectedDraftBody : body)

    const { pending, starters } = compareAssets(release, assets, await api.listAssets(release.id))
    if (!release.draft) {
      if (pending.size) throw new Error(`Published Release is missing assets: ${[...pending.keys()].join(', ')}`)
      return { tagName, url: release.url }
    }

    for (const [name, asset] of pending) {
      const starter = starters.get(name)
      if (starter !== undefined) await api.deleteAsset(starter)
      await api.uploadAsset(release, asset)
    }

    const remaining = compareAssets(release, assets, await api.listAssets(release.id)).pending
    if (remaining.size) {
      throw new Error(`Draft Release is missing assets: ${[...remaining.keys()].join(', ')}`)
    }
    assertTag(tagName, await api.findTagCommit(tagName), targetCommit)
    release = await api.getRelease(release.id)
    assertRelease(release, tagName, release.draft ? expectedDraftBody : body)
    if (!release.draft) return { tagName, url: release.url }
    const url = await api.publishDraft(release.id, body, targetCommit)
    return { tagName, url: url || release.url }
  } catch (error) {
    const location = release?.url ? ` (${release.url})` : ''
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Unable to publish ${tagName}${location}: ${message}`, { cause: error })
  }
}
