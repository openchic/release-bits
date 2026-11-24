import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cleanupTarget, deleteBranch, type Context } from '../src/cleanup.ts'

const branch = 'changelogs/v1.2.3'
const sha = 'a'.repeat(40)
const target = { branch, sha }

function event(overrides: Partial<Context> = {}): Context {
  return {
    eventName: 'pull_request',
    owner: 'openchic',
    repo: 'app',
    payload: {
      action: 'closed',
      pull_request: {
        merged: true,
        head: { ref: branch, sha, repo: { full_name: 'openchic/app' } },
      },
    },
    ...overrides,
  }
}

test('selects the recorded branch and SHA on merged or unmerged close', () => {
  assert.deepEqual(cleanupTarget(event()), target)
  const original = event()
  const pull = original.payload.pull_request as Record<string, unknown>
  assert.deepEqual(cleanupTarget(event({
    payload: { ...original.payload, pull_request: { ...pull, merged: false } },
  })), target)
})

test('skips other events, fork pull requests, unrelated branches and missing SHAs', () => {
  assert.equal(cleanupTarget(event({ eventName: 'push' })), undefined)
  assert.equal(cleanupTarget(event({ payload: { ...event().payload, action: 'opened' } })), undefined)
  for (const head of [
    { ref: branch, sha, repo: { full_name: 'contributor/app' } },
    { ref: 'feature/change', sha, repo: { full_name: 'openchic/app' } },
    { ref: branch, repo: { full_name: 'openchic/app' } },
  ]) {
    const payload = { action: 'closed', pull_request: { head } }
    assert.equal(cleanupTarget(event({ payload })), undefined)
  }
})

test('deletes the unchanged branch when no open pull request uses it', async () => {
  const requested: string[] = []
  const result = await deleteBranch(target, {
    readRef: async (ref) => { requested.push(ref); return sha },
    hasOpenPullRequest: async (name) => { requested.push(name); return false },
    removeRef: async (ref) => { requested.push(ref) },
  })
  assert.equal(result, 'deleted')
  assert.deepEqual(requested, ['heads/' + branch, branch, 'heads/' + branch])
})

test('preserves branches with newer commits or a new PR reusing the same commit', async () => {
  const api = {
    readRef: async () => 'b'.repeat(40),
    hasOpenPullRequest: async () => true,
    removeRef: async () => assert.fail('eligible branch must not be deleted'),
  }
  assert.equal(await deleteBranch(target, api), 'changed')
  assert.equal(await deleteBranch(target, { ...api, readRef: async () => sha }), 'in-use')
})

test('treats a 404 reading or deleting the ref as already cleaned up', async () => {
  const error = Object.assign(new Error('Not Found'), { status: 404 })
  const missing = async () => { throw error }
  const api = { readRef: async () => sha, hasOpenPullRequest: async () => false, removeRef: missing }
  assert.equal(await deleteBranch(target, { ...api, readRef: missing }), 'missing')
  assert.equal(await deleteBranch(target, api), 'missing')
})

test('fails closed if the open PR check cannot run', async () => {
  const error = Object.assign(new Error('Forbidden'), { status: 403 })
  await assert.rejects(deleteBranch(target, {
    readRef: async () => sha,
    hasOpenPullRequest: async () => { throw error },
    removeRef: async () => assert.fail('must verify the branch is not in use before deleting'),
  }), error)
})
