import * as core from '@actions/core'
import { context, getOctokit } from '@actions/github'
import { DEFAULT_MODEL } from './gemini.ts'
import { maxLength } from './notes.ts'
import { prepare } from './prepare.ts'

async function run() {
  const token = process.env.GH_TOKEN
  if (!token) throw new Error('GH_TOKEN is required')
  const base = core.getInput('base-branch') || context.payload.repository?.default_branch || 'main'
  const api = getOctokit(token, { request: { timeout: 120_000 } })
  const repo = context.repo
  const result = await prepare({
    version: core.getInput('version', { required: true }), bump: core.getInput('version-type'),
    catalog: core.getInput('catalog-path') || 'changelogs.json', base, since: core.getInput('base-ref'),
    max: maxLength(core.getInput('max-chars') || '50'), model: core.getInput('model') || DEFAULT_MODEL,
  }, {
    async find(branch) {
      const { data } = await api.rest.pulls.list({ ...repo, state: 'open', base, head: repo.owner + ':' + branch })
      return data[0]?.html_url
    },
    async create(head, title, body) {
      const { data } = await api.rest.pulls.create({ ...repo, head, base, title, body, draft: true })
      return data.html_url
    },
  })
  for (const [name, value] of Object.entries(result.outputs)) core.setOutput(name, value)
  for (const message of result.warnings) core.warning(message)
  if (process.env.GITHUB_STEP_SUMMARY) {
    await core.summary.addHeading('Release notes v' + result.outputs.version, 3)
      .addLink('Draft PR', result.outputs['pr-url'])
      .addList(['Branch: ' + result.outputs.branch, 'Commits: ' + result.outputs['commit-count'],
        'Warnings: ' + result.outputs['warning-count'], ...result.warnings]).write()
  }
}

run().catch((error: unknown) => core.setFailed(error instanceof Error ? error.message : String(error)))
