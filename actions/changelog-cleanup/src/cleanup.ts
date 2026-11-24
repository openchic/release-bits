export type Context = {
  eventName: string
  payload: Record<string, unknown>
  owner: string
  repo: string
}

type Target = { branch: string, sha: string }
type CleanupApi = {
  readRef: (ref: string) => Promise<string>
  hasOpenPullRequest: (branch: string) => Promise<boolean>
  removeRef: (ref: string) => Promise<void>
}

function object(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

/** Select the branch and commit recorded when an eligible pull request closed. */
export function cleanupTarget(context: Context): Target | undefined {
  if (context.eventName !== 'pull_request' || context.payload.action !== 'closed') return

  const pullRequest = object(context.payload.pull_request)
  const head = object(pullRequest?.head)
  const headRepository = object(head?.repo)
  const repository = context.owner + '/' + context.repo
  const branch = head?.ref
  const sha = head?.sha
  if (headRepository?.full_name !== repository || typeof branch !== 'string') return
  if (!branch.startsWith('changelogs/') || typeof sha !== 'string' || !sha) return

  return { branch, sha }
}

/** Delete an unchanged branch only after checking that no open pull request uses it. */
export async function deleteBranch({ branch, sha }: Target, api: CleanupApi) {
  const ref = 'heads/' + branch
  try {
    if (await api.readRef(ref) !== sha) return 'changed'
  } catch (error) {
    if (isNotFound(error)) return 'missing'
    throw error
  }
  if (await api.hasOpenPullRequest(branch)) return 'in-use'
  try {
    await api.removeRef(ref)
    return 'deleted'
  } catch (error) {
    if (isNotFound(error)) return 'missing'
    throw error
  }
}

function isNotFound(error: unknown) {
  return typeof error === 'object' && error !== null && 'status' in error && error.status === 404
}
