import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { build, projectVersion, resolveVersion, schemeArgs, type Mode, type Inputs } from './build.ts'
import { profileData, withIdentity, type Credentials } from './credentials.ts'
import { createSignedImage, describe, notarize } from './package.ts'
import { run } from './utils.ts'

function phase<T>(description: string, action: () => T): T {
  console.log(description)
  try { return action() }
  catch (error) { throw new Error(description + ': ' + (error instanceof Error ? error.message : String(error))) }
}

export function prepare(root: string, temp: string, options: Inputs & { versionType: string }, modes: Mode[], credentials: Credentials,
  remember: (path: string) => void, explicitProfileAppId = false) {
  const work = mkdtempSync(join(temp, 'build-macos-'))
  const output = join(work, 'packages')
  const privateDir = join(work, 'private')
  try {
    remember(work)
    mkdirSync(privateDir, { mode: 0o700 })
    mkdirSync(output)
    const derived = join(privateDir, 'discovery')
    const args = schemeArgs(root, options, undefined, derived)
    const version = resolveVersion(options.version, options.versionType,
      () => projectVersion([...args, '-derivedDataPath', derived], options.name))
    const resolved = { ...options, version }
    const apps = modes.map((mode) => phase('Build ' + mode,
      () => build(root, privateDir, args, mode, resolved)))
    const profile = profileData(privateDir, credentials.profile)
    const images = withIdentity(privateDir, credentials, (identity) => apps.map((app) => ({
      mode: app.mode,
      path: phase('Sign ' + app.mode, () => createSignedImage(app, privateDir, output, identity, profile,
        run, explicitProfileAppId)),
    })))
    const keyFile = join(privateDir, 'notary.p8')
    writeFileSync(keyFile, credentials.key, { mode: 0o600, flag: 'wx' })
    const packages = images.map(({ mode, path }) => phase('Notarize ' + mode, () => {
      notarize(path, keyFile, credentials)
      return describe(mode, path)
    }))
    rmSync(privateDir, { recursive: true })
    return { version, packages }
  } catch (error) {
    rmSync(work, { recursive: true, force: true })
    throw error
  }
}
