import * as core from '@actions/core'
import { architectures } from './build.ts'
import { takeCredentials } from './credentials.ts'
import { prepare } from './prepare.ts'

function main() {
  if (process.platform !== 'darwin') throw new Error('build-macos requires a macOS runner')
  const get = core.getInput
  const modes = architectures(get)
  const credentials = takeCredentials()
  const root = process.env.GITHUB_WORKSPACE
  const temp = process.env.RUNNER_TEMP
  if (!root || !temp) throw new Error('Missing GITHUB_WORKSPACE or RUNNER_TEMP')
  const { version, packages } = prepare(root, temp, { project: get('project-path'), scheme: get('scheme'),
    name: get('app-name'), version: get('version'), versionType: get('version-type'), configuration: get('build-mode') || 'Release',
    entitlements: get('entitlements-path') }, modes, credentials, (work) => core.saveState('work', work))
  core.setOutput('packages-json', packages)
  core.setOutput('version', version)
}

try { main() }
catch (error) { core.setFailed(error instanceof Error ? error.message : String(error)) }
