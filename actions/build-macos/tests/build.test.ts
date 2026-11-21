import { strict as assert } from 'node:assert'
import { cpSync, existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { architectures, build, findProject, projectVersion, resolveVersion, schemeArgs, type Inputs } from '../src/build.ts'
import { takeCredentials } from '../src/credentials.ts'
import { run, type Run } from '../src/utils.ts'

const defaults: Inputs = { project: '', scheme: '', name: '', version: '', configuration: 'Release', entitlements: '' }

test('distinguishes omitted switches, explicit false, and all three selected', () => {
  assert.deepEqual(architectures(() => ''), ['universal'])
  assert.deepEqual(architectures((k) => k === 'intel' ? 'true' : ''), ['intel'])
  assert.deepEqual(architectures(() => 'true'), ['universal', 'intel', 'apple-silicon'])
  assert.throws(() => architectures(() => 'false'), /at least one/)
  assert.throws(() => architectures(() => '1'), /true or false/)
})

test('workspace members and dependency projects do not compete with workspace', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'projects-'))
  t.after(() => rmSync(root, { recursive: true }))
  for (const dir of ['App.xcodeproj/project.xcworkspace', 'Pods/Pods.xcodeproj', 'App.xcworkspace']) {
    mkdirSync(join(root, dir), { recursive: true })
  }
  writeFileSync(join(root, 'App.xcworkspace/contents.xcworkspacedata'),
    '<Workspace><FileRef location="group:App.xcodeproj"/></Workspace>')
  assert.match(findProject(root, ''), /App.xcworkspace$/)
  mkdirSync(join(root, 'Other.xcodeproj'))
  assert.throws(() => findProject(root, ''), /Specify project-path.*Other/)
  assert.match(findProject(root, 'Other.xcodeproj'), /Other.xcodeproj$/)
})

test('ambiguous App schemes require an explicit choice', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'schemes-'))
  t.after(() => rmSync(root, { recursive: true }))
  mkdirSync(join(root, 'App.xcodeproj'))
  assert.throws(() => schemeArgs(root, defaults, (_, args) => Buffer.from(JSON.stringify(args.includes('-list')
    ? { project: { schemes: ['Production', 'Staging'] } }
    : [{ buildSettings: { PRODUCT_TYPE: 'com.apple.product-type.application', SUPPORTED_PLATFORMS: 'macosx' } }]))),
  /Specify scheme.*Production, Staging/)
})

test('scheme discovery reports failed probes and continues looking for macOS apps', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'schemes-'))
  t.after(() => rmSync(root, { recursive: true }))
  mkdirSync(join(root, 'App.xcodeproj'))
  const warn = t.mock.method(console, 'warn', () => {})
  function xcode(schemes: string[]): Run {
    return (_, args) => {
      if (args.includes('-list')) return Buffer.from(JSON.stringify({ project: { schemes } }))
      const scheme = args[args.indexOf('-scheme') + 1]
      if (scheme === 'Broken') throw new Error('fixture build settings unavailable')
      return Buffer.from(JSON.stringify([{ buildSettings: {
        PRODUCT_TYPE: 'com.apple.product-type.application',
        SUPPORTED_PLATFORMS: scheme === 'Mac' ? 'macosx' : 'iphoneos iphonesimulator',
      } }]))
    }
  }

  const args = schemeArgs(root, defaults, xcode(['Broken', 'iOS', 'Mac']))
  assert.equal(args[args.indexOf('-scheme') + 1], 'Mac')
  assert.equal(warn.mock.callCount(), 1)
  assert.match(warn.mock.calls[0].arguments[0], /Broken: fixture build settings unavailable/)

  assert.throws(() => schemeArgs(root, defaults, xcode(['Broken', 'iOS'])),
    /No usable macOS App scheme found[\s\S]*Broken: fixture build settings unavailable/)
  assert.doesNotThrow(() => schemeArgs(root, { ...defaults, scheme: 'Mac' }, () => {
    throw new Error('explicit scheme must bypass discovery')
  }))
})

test('extracts all six credentials before launching project tools', () => {
  const env = Object.fromEntries(['DEVELOPER_ID_CERTIFICATE_P12', 'DEVELOPER_ID_CERTIFICATE_PASSWORD',
    'DEVELOPER_ID_PROVISIONING_PROFILE', 'API_KEY', 'API_KEY_ID', 'API_ISSUER_ID'].map((k) => ['APPLE_' + k, 'fixture']))
  assert.equal(takeCredentials(env).key, 'fixture')
  assert.deepEqual(env, {})
})

test('resolves direct versions and explicit or project-based increments before building', () => {
  function unexpectedLookup(): never { throw new Error('unexpected Xcode lookup') }
  assert.equal(resolveVersion('2.1.0', '', unexpectedLookup), '2.1.0')
  assert.equal(resolveVersion('2.1', '', unexpectedLookup), '2.1')
  for (const [kind, expected] of [['major', '2.0.0'], ['minor', '1.3.0'], ['patch', '1.2.4']]) {
    assert.equal(resolveVersion('1.2.3', kind, unexpectedLookup), expected)
    assert.equal(resolveVersion('', kind, () => '1.2.3'), expected)
  }
  assert.throws(() => resolveVersion('', '', unexpectedLookup), /version or version-type/)
  assert.throws(() => resolveVersion('', 'none', unexpectedLookup), /version-type/)
  assert.throws(() => resolveVersion('v2', '', unexpectedLookup), /Invalid version/)
  assert.throws(() => resolveVersion('1.2', 'patch', unexpectedLookup), /X.Y.Z/)
  for (const invalid of ['', '1.2', 'v1.2.3']) {
    assert.throws(() => resolveVersion('', 'patch', () => invalid), /MARKETING_VERSION/)
  }
})

test('real Xcode builds yield exact slices and resolve the final version and entitlements',
  { skip: process.platform !== 'darwin' }, (t) => {
    const work = mkdtempSync(join(tmpdir(), 'releasebits-build-'))
    t.after(() => rmSync(work, { recursive: true, force: true }))
    const root = join(work, 'repo')
    cpSync(fileURLToPath(new URL('./fixture', import.meta.url)), root, { recursive: true })
    const args = schemeArgs(root, { ...defaults, scheme: 'Sample' }, undefined, join(work, 'discovery'))
    const version = resolveVersion('', 'minor',
      () => projectVersion([...args, '-derivedDataPath', join(work, 'discovery')], 'Sample'))
    assert.equal(version, '2.5.0')
    for (const mode of architectures(() => 'true')) {
      const app = build(root, work, args, mode, { ...defaults, version })
      assert.equal(app.name, 'Sample')
      assert.deepEqual(app.componentTargets?.get('org.example.sample.worker/Worker.xpc')?.permissions, {
        'com.apple.security.app-sandbox': true, 'com.apple.security.network.client': true,
      })
      assert.equal(app.version, version)
      assert.deepEqual(app.permissions, { 'com.apple.security.app-sandbox': true })
      assert.equal(run('/usr/bin/plutil', ['-extract', 'CFBundleVersion', 'raw', '-o', '-', join(app.path, 'Contents/Info.plist')]).toString().trim(),
        version)
      assert.ok(existsSync(app.path))
    }
  })
