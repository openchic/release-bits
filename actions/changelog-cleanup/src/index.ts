import * as core from '@actions/core'
import { context, getOctokit } from '@actions/github'
import { cleanupTarget, deleteBranch } from './cleanup.ts'
import { requiredEnv } from '../../../shared/env.mts'

async function run() {
  const repo = context.repo
  const target = cleanupTarget({
    eventName: context.eventName,
    payload: context.payload,
    ...repo,
  })
  if (!target) {
    core.info('Skipping branch cleanup for this event or pull request.')
    return
  }

  const api = getOctokit(requiredEnv('GITHUB_TOKEN'), { request: { timeout: 120_000 } })
  const result = await deleteBranch(target, {
    readRef: async (ref) => (await api.rest.git.getRef({ ...repo, ref })).data.object.sha,
    hasOpenPullRequest: async (branch) => {
      const pages = api.paginate.iterator(api.rest.pulls.list, {
        ...repo, state: 'open', head: `${repo.owner}:${branch}`, per_page: 100,
      })
      const repository = `${repo.owner}/${repo.repo}`
      for await (const { data } of pages) {
        if (data.some((pr) => pr.head.repo?.full_name === repository && pr.head.ref === branch)) return true
      }
      return false
    },
    removeRef: async (ref) => { await api.rest.git.deleteRef({ ...repo, ref }) },
  })
  const { branch } = target
  core.info({
    deleted: `Deleted changelog branch ${branch}.`,
    missing: `Changelog branch ${branch} was already deleted.`,
    changed: `Skipping ${branch} because its head changed after the pull request closed.`,
    'in-use': `Skipping ${branch} because an open pull request still uses it.`,
  }[result])
}

run().catch((error: unknown) => core.setFailed(error instanceof Error ? error.message : String(error)))
