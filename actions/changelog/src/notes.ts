import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { commitsSince, head } from './git.ts'
import { requestNotes } from './gemini.ts'
import { buildPrompt } from './prompt.ts'

export type Notes = { 'zh-CN': string[], en: string[] }

export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function entries(value: unknown, locale: string): string[] {
  if (!Array.isArray(value) || !value.length ||
      !value.every((item) => typeof item === 'string' && item.trim())) {
    throw new Error('Missing release notes: ' + locale)
  }
  return value.map((item: string) => item.trim())
}

export function validateNotes(value: unknown): Notes {
  if (!record(value)) throw new Error('Missing release notes')
  const zh = entries(value['zh-CN'], 'zh-CN')
  const en = entries(value.en, 'en')
  if (zh.length !== en.length) throw new Error('Chinese and English notes must correspond')
  return { 'zh-CN': zh, en }
}

export function maxLength(input: string) {
  const n = Number(input)
  if (!/^\d+$/.test(input) || !Number.isSafeInteger(n) || n <= 0) {
    throw new Error('max-chars must be a positive integer')
  }
  return n
}

export function warnings(notes: Notes, maxChars: number) {
  const result: string[] = []
  for (const [i, zh] of notes['zh-CN'].entries()) {
    const prefix = '第 ' + (i + 1) + ' 条：'
    const en = notes.en[i]
    if (/(并|以及|同时)(优化|强化|改进|修复|新增|支持|保留|稳定|增强|完善|调整|移除|删除|显示|限制|更新)/.test(zh))
      result.push(prefix + '可能包含多个变化，请拆成一条一个变化。')
    if (/^(优化|强化|改进|完善|增强|调整)/.test(zh))
      result.push(prefix + '开头过于空泛，请写出具体对象和用户可见结果。')
    if ([...zh].length > maxChars + 10) result.push(prefix + '中文超过 ' + (maxChars + 10) + ' 字，请精简。')
    if (/^(add|change|display|fix|group|harden|improve|keep|limit|preserve|refine|remove|show|stabilize|support|update)[.,]*(?:\s|$)/i.test(en))
      result.push(prefix + '英文以祈使句开头，请使用一般过去时。')
    if (/\bnow\b/i.test(en)) result.push(prefix + '英文包含 now，请删除。')
  }
  return result
}

export function evidence(commits: ReturnType<typeof commitsSince>) {
  const children = new Map<string, string[]>()
  const reverts = new Set<string>()
  for (const commit of commits) {
    for (const match of commit.body.matchAll(/This reverts commit ([0-9a-f]{7,64})\b/gi)) {
      const targets = commits.filter(({ sha }) => sha.startsWith(match[1].toLowerCase()))
      if (targets.length !== 1) continue
      const target = targets[0].sha
      children.set(target, [...(children.get(target) || []), commit.sha])
      reverts.add(commit.sha)
    }
  }
  const active = new Map<string, boolean>()
  function isActive(sha: string): boolean {
    if (!active.has(sha)) {
      active.set(sha, false)
      active.set(sha, !(children.get(sha) || []).some(isActive))
    }
    return active.get(sha)!
  }
  const items = []
  for (const commit of commits) {
    if (!reverts.has(commit.sha) && isActive(commit.sha) && /^(feat|fix)(?:\([^)\n]*\))?!?:\s*\S/.test(commit.subject)) {
      items.push(commit.body ? { subject: commit.subject, body: commit.body } : { subject: commit.subject })
    }
  }
  if (!items.length) throw new Error('No feat or fix changes since the selected release')
  const json = JSON.stringify({ commits: items })
  if (Buffer.byteLength(json) > 200_000) throw new Error('Commit evidence is too large; narrow base-ref')
  return { json, count: items.length }
}

export async function generate(version: string, base: string, max: number, model: string, call = requestNotes) {
  const source = head()
  const { json, count } = evidence(commitsSince(base))
  const notes = validateNotes(await call(buildPrompt(version, json, max), model))
  if (head() !== source) throw new Error('Repository changed during generation')
  return { source, count, notes }
}

export function markdown(notes: Notes) {
  return ['## 简体中文', '', ...notes['zh-CN'].map((s) => '- ' + s),
    '', '## English', '', ...notes.en.map((s) => '- ' + s)].join('\n')
}

export function preview(version: string, source: string, notes: Notes, output?: string) {
  const dir = output ? resolve(output) : mkdtempSync(join(process.env.RUNNER_TEMP || tmpdir(), 'release-bits-notes-'))
  mkdirSync(dir, { recursive: true })
  const prefix = join(dir, 'release-notes-' + version)
  writeFileSync(prefix + '.json', JSON.stringify({ version, source_sha: source, notes }, null, 2) + '\n')
  writeFileSync(prefix + '.md', markdown(notes) + '\n')
  return { 'notes-json-path': prefix + '.json', 'notes-markdown-path': prefix + '.md' }
}
