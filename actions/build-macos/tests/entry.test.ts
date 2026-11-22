import { strict as assert } from 'node:assert'
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const dist = fileURLToPath(new URL('../dist/', import.meta.url))

for (const scenario of [
  { name: 'uses the final changelog version directly', version: '3.8.4', expected: '3.8.4' },
  { name: 'increments the project version', kind: 'patch', expected: '2.4.1' },
  { name: 'increments an explicit base instead of the project version', version: '1.9.7', kind: 'minor', expected: '1.10.0' },
  { name: 'rejects missing version inputs before building' },
]) {
  test('packaged action ' + scenario.name, { skip: process.platform !== 'darwin' }, (t) => {
    const temp = mkdtempSync(join(tmpdir(), 'releasebits-version-'))
    t.after(() => rmSync(temp, { recursive: true, force: true }))
    const root = join(temp, 'repo')
    cpSync(new URL('./fixture/', import.meta.url), root, { recursive: true })
    const project = join(root, 'Sample.xcodeproj/project.pbxproj')
    const original = readFileSync(project, 'utf8')
    const output = join(temp, 'output')
    writeFileSync(output, '')

    // Keep the unsigned product available for inspection after the Action cleans its work directory.
    const config = join(temp, 'test.xcconfig')
    writeFileSync(config, 'CONFIGURATION_BUILD_DIR = ' + join(temp, 'products') + '\n')
    const env: NodeJS.ProcessEnv = {
      HOME: process.env.HOME, PATH: process.env.PATH, TMPDIR: temp, XCODE_XCCONFIG_FILE: config,
      RUNNER_TEMP: temp, GITHUB_WORKSPACE: root, GITHUB_OUTPUT: output,
      INPUT_SCHEME: 'Sample', INPUT_INTEL: 'true',
      APPLE_DEVELOPER_ID_CERTIFICATE_P12: 'fixture', APPLE_DEVELOPER_ID_CERTIFICATE_PASSWORD: 'fixture',
      APPLE_API_KEY: 'fixture', APPLE_API_KEY_ID: 'fixture', APPLE_API_ISSUER_ID: 'fixture',
      // Stop after the versioned build, before importing a signing identity or contacting Apple.
      APPLE_DEVELOPER_ID_PROVISIONING_PROFILE: '!invalid!',
    }
    if (scenario.version) env.INPUT_VERSION = scenario.version
    if (scenario.kind) env['INPUT_VERSION-TYPE'] = scenario.kind
    const child = spawnSync(process.execPath, [join(dist, 'index.mjs')], { env, cwd: root, encoding: 'utf8' })
    const log = child.stdout + child.stderr
    assert.equal(child.status, 1, log)
    assert.equal(readFileSync(output, 'utf8'), '')
    assert.equal(readFileSync(project, 'utf8'), original)
    const info = join(temp, 'products/Sample.app/Contents/Info.plist')
    if (scenario.expected) {
      assert.match(log, /APPLE_DEVELOPER_ID_PROVISIONING_PROFILE must contain one Base64-encoded profile/)
      const plist = JSON.parse(execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', info], { encoding: 'utf8' }))
      assert.equal(plist.CFBundleShortVersionString, scenario.expected)
      assert.equal(plist.CFBundleVersion, scenario.expected)
    } else {
      assert.match(log, /Specify version or version-type/)
      assert.doesNotMatch(log, /Build intel/)
      assert.equal(existsSync(info), false)
    }
  })
}

test('bundled invocation rejects unsupported runner or empty selection without output', (t) => {
  const temp = mkdtempSync(join(tmpdir(), 'releasebits-entry-'))
  t.after(() => rmSync(temp, { recursive: true, force: true }))
  const output = join(temp, 'output')
  writeFileSync(output, '')
  const child = spawnSync(process.execPath, [join(dist, 'index.mjs')], { encoding: 'utf8',
    env: { RUNNER_TEMP: temp, GITHUB_WORKSPACE: temp, GITHUB_OUTPUT: output, INPUT_INTEL: 'false' } })
  assert.equal(child.status, 1)
  assert.match(child.stdout + child.stderr, process.platform === 'darwin' ? /Select at least one/ : /macOS runner/)
  assert.equal(readFileSync(output, 'utf8'), '')
})

test('action forwards the profile App ID input and publishes package outputs', { skip: process.platform !== 'darwin' }, (t) => {
  const temp = mkdtempSync(join(tmpdir(), 'releasebits-outputs-'))
  t.after(() => rmSync(temp, { recursive: true, force: true }))
  const output = join(temp, 'output')
  const packages = [{ architecture: 'universal', path: join(temp, 'App-2.5.0.dmg'),
    filename: 'App-2.5.0.dmg', sha256: 'a'.repeat(64), size: 10 }]
  // Check the input received by prepare and exercise the real GitHub output writer.
  const entry = new URL('../src/index.ts', import.meta.url).href
  const mock = 'data:text/javascript,' + encodeURIComponent(`
    import { strict as assert } from 'node:assert'
    export function prepare(root, temp, options, modes, credentials, remember, explicitProfileAppId) {
      assert.equal(explicitProfileAppId, process.env.EXPECT_EXPLICIT_PROFILE_APP_ID === 'true')
      return ${JSON.stringify({ version: '2.5.0', packages })}
    }
  `)
  const script = `
    import { registerHooks } from 'node:module'
    registerHooks({
      resolve(specifier, context, nextResolve) {
        if (context.parentURL === ${JSON.stringify(entry)} && specifier === './prepare.ts') {
          return { url: ${JSON.stringify(mock)}, shortCircuit: true }
        }
        return nextResolve(specifier, context)
      }
    })
    await import(${JSON.stringify(entry)})
  `
  for (const [input, expected] of [[undefined, false], ['false', false], ['true', true]] as const) {
    writeFileSync(output, '')
    const env: NodeJS.ProcessEnv = {
      RUNNER_TEMP: temp, GITHUB_WORKSPACE: temp, GITHUB_OUTPUT: output,
      'INPUT_VERSION-TYPE': 'minor',
      EXPECT_EXPLICIT_PROFILE_APP_ID: String(expected),
      APPLE_DEVELOPER_ID_CERTIFICATE_P12: 'fixture', APPLE_DEVELOPER_ID_CERTIFICATE_PASSWORD: 'fixture',
      APPLE_API_KEY: 'fixture', APPLE_API_KEY_ID: 'fixture', APPLE_API_ISSUER_ID: 'fixture',
    }
    if (input !== undefined) env['INPUT_EXPLICIT-PROFILE-APP-ID'] = input
    const child = spawnSync(process.execPath, ['--input-type=module', '--eval', script], { encoding: 'utf8', env })
    assert.equal(child.status, 0, `Input ${input ?? '(omitted)'}: ${child.stdout}${child.stderr}`)
    const written = readFileSync(output, 'utf8')
    assert.match(written, /^version<<([^\n]+)\n2\.5\.0\n\1$/m)
    const manifest = written.match(/^packages-json<<([^\n]+)\n([^\n]+)\n\1$/m)
    assert.ok(manifest)
    assert.deepEqual(JSON.parse(manifest[2]), packages)
  }
})

test('bundled post action cleans only the recorded runner directory', (t) => {
  const temp = mkdtempSync(join(tmpdir(), 'releasebits-post-'))
  t.after(() => rmSync(temp, { recursive: true, force: true }))
  const work = mkdtempSync(join(temp, 'build-macos-'))
  const other = join(temp, 'unrelated')
  mkdirSync(other)
  for (const path of [work, other]) {
    const result = spawnSync(process.execPath, [join(dist, 'post.mjs')], {
      env: { RUNNER_TEMP: temp, STATE_work: path }, encoding: 'utf8',
    })
    assert.equal(result.status, path === work ? 0 : 1, result.stdout + result.stderr)
  }
  assert.equal(existsSync(work), false)
  assert.equal(existsSync(other), true)
})
