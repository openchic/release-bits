import type { ReleaseAsset } from './prepare.ts'

type DraftRelease = { id: number, url: string, uploadUrl: string }
type PublishedRelease = { url: string }

export type ReleaseApi = {
  hasRelease: (tagName: string) => Promise<boolean>
  createTag: (tagName: string, targetCommit: string) => Promise<void>
  createDraft: (input: { tagName: string, body: string }) => Promise<DraftRelease>
  uploadAsset: (release: DraftRelease, asset: ReleaseAsset) => Promise<void>
  publishDraft: (releaseId: number) => Promise<PublishedRelease>
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

/** Publish notes and assets for a new tag, leaving any partial result for inspection. */
export async function publishRelease(
  version: string,
  body: string,
  targetCommit: string,
  assets: ReleaseAsset[],
  api: ReleaseApi,
) {
  if (!targetCommit) throw new Error('Checked-out commit is required')
  const tagName = 'v' + version
  if (await api.hasRelease(tagName)) {
    throw new Error(`Release ${tagName} already exists; refusing to modify it`)
  }
  try {
    await api.createTag(tagName, targetCommit)
  } catch (error) {
    throw new Error(`Unable to create tag ${tagName}: ${message(error)}`, { cause: error })
  }

  let draft: DraftRelease | undefined
  try {
    draft = await api.createDraft({ tagName, body })
    for (const asset of assets) await api.uploadAsset(draft, asset)
    const published = await api.publishDraft(draft.id)
    return { tagName, url: published.url || draft.url }
  } catch (error) {
    const recovery = draft
      ? `check the Release at ${draft.url} and tag ${tagName}`
      : `tag ${tagName} was created; check for a draft Release before retrying`
    throw new Error(
      `Unable to publish ${tagName}; ${recovery}: ${message(error)}`,
      { cause: error },
    )
  }
}
