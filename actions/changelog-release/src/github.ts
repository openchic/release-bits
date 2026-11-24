import { getOctokit } from '@actions/github'
import type { Release, ReleaseApi } from './publish.ts'

function releaseDetails(data: {
  id: number
  html_url: string
  upload_url: string
  tag_name: string
  name: string | null
  body?: string | null
  draft: boolean
  prerelease: boolean
}): Release {
  const { id, html_url: url, upload_url: uploadUrl, tag_name: tagName, name, body, draft, prerelease } = data
  return { id, url, uploadUrl, tagName, name, body, draft, prerelease }
}

export function githubReleaseApi(token: string, repo: { owner: string, repo: string }): ReleaseApi {
  const octokit = getOctokit(token, { request: { timeout: 120_000 } })
  return {
    async findTagCommit(tagName) {
      let target: { type: string, sha: string }
      try {
        const { data } = await octokit.rest.git.getRef({ ...repo, ref: `tags/${tagName}` })
        target = data.object
      } catch (error) {
        if (error && typeof error === 'object' && 'status' in error && error.status === 404) return
        throw error
      }

      while (target.type === 'tag') {
        const { data } = await octokit.rest.git.getTag({ ...repo, tag_sha: target.sha })
        target = data.object
      }
      if (target.type !== 'commit') throw new Error(`Remote tag ${tagName} does not point to a commit`)
      return target.sha
    },
    async findRelease(tagName) {
      let match: Release | undefined
      const pages = octokit.paginate.iterator(octokit.rest.repos.listReleases, { ...repo, per_page: 100 })
      for await (const { data } of pages) {
        for (const release of data) {
          if (release.tag_name !== tagName) continue
          if (match) throw new Error(`Multiple Releases match tag ${tagName}`)
          match = releaseDetails(release)
        }
      }
      return match
    },
    async createTag(tagName, sha) {
      await octokit.rest.git.createRef({ ...repo, ref: `refs/tags/${tagName}`, sha })
    },
    async getRelease(releaseId) {
      const { data } = await octokit.rest.repos.getRelease({ ...repo, release_id: releaseId })
      return releaseDetails(data)
    },
    async createDraft(tagName, body, targetCommit) {
      const { data } = await octokit.rest.repos.createRelease({
        ...repo,
        tag_name: tagName,
        target_commitish: targetCommit,
        name: tagName,
        body,
        draft: true,
        prerelease: false,
      })
      return releaseDetails(data)
    },
    async listAssets(releaseId) {
      return octokit.paginate(octokit.rest.repos.listReleaseAssets, {
        ...repo, release_id: releaseId, per_page: 100,
      })
    },
    async deleteAsset(assetId) {
      await octokit.rest.repos.deleteReleaseAsset({ ...repo, asset_id: assetId })
    },
    async uploadAsset(release, asset) {
      const url = new URL(release.uploadUrl.replace(/\{\?name,label\}$/, ''))
      url.searchParams.set('name', asset.name)
      url.searchParams.set('label', asset.name)
      await octokit.request(`POST ${url}`, {
        data: asset.blob,
        headers: { 'content-type': 'application/octet-stream' },
        request: { redirect: 'error' },
      })
    },
    async publishDraft(releaseId, body, targetCommit) {
      const { data } = await octokit.rest.repos.updateRelease({
        ...repo,
        release_id: releaseId,
        target_commitish: targetCommit,
        draft: false,
        body,
      })
      return data.html_url
    },
  }
}
