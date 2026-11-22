import * as core from '@actions/core'
import { existsSync, rmSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { deleteKeychain } from './credentials.ts'

function clean() {
  const work = core.getState('work')
  if (!work || !existsSync(work)) return
  const temp = process.env.RUNNER_TEMP
  if (!temp || dirname(resolve(work)) !== resolve(temp) || !/^build-macos-[a-zA-Z0-9]{6}$/.test(basename(work))) {
    throw new Error('Unexpected cleanup directory')
  }
  try {
    const keychain = join(work, 'private/signing.keychain-db')
    deleteKeychain(keychain)
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

try { clean() }
catch (error) { core.setFailed(error instanceof Error ? error.message : String(error)) }
