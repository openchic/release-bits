import { execFileSync } from 'node:child_process'
import { openAsBlob } from 'node:fs'
import * as core from '@actions/core'
import { context, getOctokit } from '@actions/github'
import { requiredEnv } from '../../../shared/env.mts'
import { loadNotes, prepareAssets, workspaceRoot } from './prepare.ts'
import { publishRelease } from './publish.ts'

function head(root: string) {
  try {
    return execFileSync('git', ['rev-parse', '--verify', 'HEAD^{commit}'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch {
    throw new Error('Unable to resolve the checked-out commit; checkout the target release commit first')
  }
}

function uploadUrl(template: string, name: string) {
  const endpoint = template.replace(/\{\?name,label\}$/, '')
  const url = new URL(endpoint)
  url.searchParams.set('name', name)
  return url.toString()
}

async function run() {
  const root = workspaceRoot(process.env.GITHUB_WORKSPACE || process.cwd())
  const versionInput = core.getInput('version', { required: true })
  const catalog = loadNotes(root, core.getInput('catalog-path') || 'changelogs.json', versionInput)
  const assets = prepareAssets(root, core.getMultilineInput('files'))
  const targetCommit = head(root)
  const token = requiredEnv('GITHUB_TOKEN')
  const octokit = getOctokit(token, { request: { timeout: 120_000 } })
  const repo = context.repo

  const release = await publishRelease(catalog.version, catalog.markdown, targetCommit, assets, {
    hasRelease: async (tagName) => {
      const pages = octokit.paginate.iterator(octokit.rest.repos.listReleases, {
        ...repo,
        per_page: 100,
      })
      for await (const { data } of pages) {
        if (data.some((release) => release.tag_name === tagName)) return true
      }
      return false
    },
    createTag: async (tagName, sha) => {
      await octokit.rest.git.createRef({ ...repo, ref: 'refs/tags/' + tagName, sha })
    },
    createDraft: async ({ tagName, body }) => {
      const { data } = await octokit.rest.repos.createRelease({
        ...repo,
        tag_name: tagName,
        name: tagName,
        body,
        draft: true,
        prerelease: false,
      })
      return { id: data.id, url: data.html_url, uploadUrl: data.upload_url }
    },
    uploadAsset: async (release, asset) => {
      const file = await openAsBlob(asset.path)
      if (file.size !== asset.size) {
        throw new Error(`Release asset size changed after validation: ${asset.name}`)
      }
      await octokit.request(`POST ${uploadUrl(release.uploadUrl, asset.name)}`, {
        data: file,
        headers: { 'content-type': 'application/octet-stream' },
        request: { redirect: 'error' },
      })
    },
    publishDraft: async (releaseId) => {
      const { data } = await octokit.rest.repos.updateRelease({
        ...repo,
        release_id: releaseId,
        draft: false,
      })
      return { url: data.html_url }
    },
  })

  core.setOutput('notes-en', catalog.markdown)
  core.setOutput('tag-name', release.tagName)
  core.setOutput('release-url', release.url)
  core.info(`Published ${release.tagName}: ${release.url}`)
}

run().catch((error: unknown) => core.setFailed(error instanceof Error ? error.message : String(error)))
