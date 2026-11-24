import { execFileSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as core from '@actions/core'
import { context } from '@actions/github'
import { requiredEnv } from '../../../shared/env.mts'
import { githubReleaseApi } from './github.ts'
import { loadNotes, prepareAssets, stageAssets, workspaceRoot } from './prepare.ts'
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

async function run() {
  const root = workspaceRoot(process.env.GITHUB_WORKSPACE || process.cwd())
  const versionInput = core.getInput('version', { required: true })
  const catalog = loadNotes(root, core.getInput('catalog-path') || 'changelogs.json', versionInput)
  const targetCommit = head(root)
  const token = requiredEnv('GITHUB_TOKEN')
  const files = prepareAssets(root, core.getMultilineInput('files'))
  const staging = await mkdtemp(join(process.env.RUNNER_TEMP || tmpdir(), 'release-bits-assets-'))
  try {
    const assets = await stageAssets(files, staging)
    const release = await publishRelease({
      version: catalog.version,
      body: catalog.markdown,
      targetCommit,
      assets,
      existingTag: core.getInput('tag-name'),
    }, githubReleaseApi(token, context.repo))

    core.setOutput('notes-en', catalog.markdown)
    core.setOutput('tag-name', release.tagName)
    core.setOutput('release-url', release.url)
    core.info(`Published ${release.tagName}: ${release.url}`)
  } finally {
    await rm(staging, { recursive: true, force: true }).catch((error: Error) => {
      core.warning(`Unable to clean up staged release assets: ${error.message}`)
    })
  }
}

run().catch((error: unknown) => core.setFailed(error instanceof Error ? error.message : String(error)))
