import { strict as assert } from 'node:assert'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Product } from '../src/build.ts'
import { profileData, withIdentity, type Credentials, type Profile } from '../src/credentials.ts'
import { createSignedImage, describe, notarize } from '../src/package.ts'
import { signingPermissions } from '../src/permissions.ts'
import { signApp } from '../src/sign.ts'
import { run, type Run } from '../src/utils.ts'

const team = 'TEAM123456'
const id = { team, fingerprint: createHash('sha1').update('cert').digest('hex').toUpperCase(), keychain: '/tmp/example' }
const key = 'com.apple.application-identifier'
const group = 'keychain-access-groups'
const profile: Profile = { TeamIdentifier: [team], Platform: ['OSX'], ProvisionsAllDevices: true,
  ApplicationIdentifierPrefix: ['PREFIX'], ExpirationDate: '2099-01-01T00:00:00Z',
  DeveloperCertificates: [Buffer.from('cert').toString('base64')], Entitlements: {
    [key]: 'PREFIX.org.example.app', 'com.apple.developer.team-identifier': team, [group]: ['PREFIX.*'] } }
const app: Product = { bundleId: 'org.example.app', permissions: { [group]: ['$(AppIdentifierPrefix)$(PRODUCT_BUNDLE_IDENTIFIER)'] },
  name: 'Sample', version: '2.4.0', settings: {}, mode: 'universal', path: '/tmp/Sample.app' }
const creds: Credentials = { key: 'private-key-fixture', password: 'password-fixture', p12: 'p12-fixture',
  issuer: 'issuer', keyId: 'keyid', profile: '' }

test('resolves only requested rights using the profile prefix and signing team', () => {
  assert.deepEqual(signingPermissions(app, id, profile), { [group]: ['PREFIX.org.example.app'],
    [key]: 'PREFIX.org.example.app', 'com.apple.developer.team-identifier': team })
  assert.deepEqual(signingPermissions(app, id, profile, true), { [group]: ['PREFIX.org.example.app'],
    [key]: 'PREFIX.org.example.app', 'com.apple.developer.team-identifier': team })
  const wildcardAppId = { ...profile, Entitlements: { ...profile.Entitlements, [key]: 'PREFIX.*' } }
  assert.deepEqual(signingPermissions(app, id, wildcardAppId)[key], 'PREFIX.org.example.app')
  assert.throws(() => signingPermissions(app, id, wildcardAppId, true),
    /Main app org\.example\.app: profile application identifier is wildcarded/)
  assert.throws(() => signingPermissions(app, id, undefined, true),
    /Main app org\.example\.app: provisioning profile is required/)
  const missingAppId = { ...profile, Entitlements: { ...profile.Entitlements } }
  delete missingAppId.Entitlements[key]
  assert.throws(() => signingPermissions(app, id, missingAppId, true),
    /Main app org\.example\.app: profile is missing com\.apple\.application-identifier/)
  const mismatchedAppId = { ...profile, Entitlements: { ...profile.Entitlements, [key]: 'PREFIX.org.other' } }
  assert.throws(() => signingPermissions(app, id, mismatchedAppId, true),
    /Main app org\.example\.app: profile application identifier does not match the Bundle ID/)
  assert.throws(() => signingPermissions(app, id), /authorize entitlement/)
  assert.throws(() => signingPermissions(app, id, { ...profile, ExpirationDate: '2001-01-01' }), /current/)
  assert.throws(() => signingPermissions(app, { ...id, fingerprint: '00' }, profile), /certificate/)
  assert.throws(() => signingPermissions({ ...app, bundleId: 'org.other' }, id, profile), /entitlement/)
  assert.throws(() => signingPermissions({ ...app, permissions: { [group]: ['$(UNKNOWN)'] } }, id, profile), /Unresolved/)
})

test('main and extension must each authorize their own identifier and permissions',
  { skip: process.platform !== 'darwin' }, (t) => {
    const work = mkdtempSync(join(tmpdir(), 'profile-'))
    t.after(() => rmSync(work, { recursive: true }))
    const root = join(work, 'Sample.app')
    const child = join(root, 'Contents/PlugIns/Share.appex')
    const childId = 'org.example.app.share'
    function xml(data: unknown) {
      return run('/usr/bin/plutil', ['-convert', 'xml1', '-o', '-', '--', '-'], { input: JSON.stringify(data) })
    }
    for (const [path, identifier] of [[root, app.bundleId], [child, childId]]) {
      mkdirSync(join(path, 'Contents/MacOS'), { recursive: true })
      writeFileSync(join(path, 'Contents/MacOS/Executable'), '')
      writeFileSync(join(path, 'Contents/Info.plist'), xml({ CFBundleIdentifier: identifier, CFBundleExecutable: 'Executable' }))
    }
    const rightsFile = join(work, 'component.entitlements')
    const tool: Run = (command, args, options) => {
      if (command.endsWith('/lipo')) return Buffer.from('x86_64 arm64')
      if (command.endsWith('/security')) return readFileSync(args.at(-1)!)
      if (command.endsWith('/codesign')) return args.includes('-d') ? readFileSync(rightsFile) : Buffer.alloc(0)
      return run(command, args, options)
    }
    const encoded = xml(profile).toString('base64')
    assert.throws(() => profileData(work, JSON.stringify({ [app.bundleId]: encoded }), tool), /one Base64/)
    const main = profileData(work, encoded, tool)
    const product = { ...app, componentTargets: new Map([[childId + '/Share.appex', app]]) }
    const childFile = join(child, 'Contents/embedded.provisionprofile')
    assert.throws(() => signApp(root, product, work, id, main, tool, true),
      /Share.appex: Profile does not authorize/)
    assert.equal(existsSync(childFile), false)
    writeFileSync(childFile, xml(profile))
    assert.throws(() => signApp(root, product, work, id, main, tool, true),
      /Share.appex: Profile does not authorize/)
    const wildcard = xml({ ...profile, Entitlements: { ...profile.Entitlements, [key]: 'PREFIX.org.example.app.*' } })
    writeFileSync(childFile, wildcard)
    signApp(root, product, work, id, main, tool, true)
    assert.deepEqual(readFileSync(childFile), wildcard)
    assert.equal(readFileSync(join(root, 'Contents/embedded.provisionprofile')).toString('base64'), encoded)
  })

test('strict main app profile failure precedes main signing and DMG creation',
  { skip: process.platform !== 'darwin' }, (t) => {
  const work = mkdtempSync(join(tmpdir(), 'explicit-profile-'))
  t.after(() => rmSync(work, { recursive: true, force: true }))
  const source = join(work, 'Sample.app')
  const contents = join(source, 'Contents')
  const binary = join(contents, 'MacOS/Executable')
  mkdirSync(join(contents, 'MacOS'), { recursive: true })
  writeFileSync(binary, 'fixture')
  const info = run('/usr/bin/plutil', ['-convert', 'xml1', '-o', '-', '--', '-'], {
    input: JSON.stringify({ CFBundleIdentifier: app.bundleId, CFBundleExecutable: 'Executable' }),
  })
  writeFileSync(join(contents, 'Info.plist'), info)

  const commands: Array<{ command: string, args: string[] }> = []
  const tool: Run = (command, args, options) => {
    commands.push({ command, args })
    if (command.endsWith('/ditto')) {
      cpSync(args[0], args[1], { recursive: true })
      return Buffer.alloc(0)
    }
    if (command.endsWith('/lipo')) return Buffer.from('arm64 x86_64')
    return Buffer.alloc(0)
  }

  assert.throws(() => createSignedImage({ ...app, path: source }, work, join(work, 'packages'), id,
    undefined, tool, true), /Main app org\.example\.app: provisioning profile is required/)
  assert.ok(commands.some(({ command }) => command.endsWith('/ditto')))
  assert.ok(!commands.some(({ command, args }) => command.endsWith('/codesign') && args.includes('--sign')))
  assert.ok(!commands.some(({ command }) => command.endsWith('/hdiutil')))
})

test('secrets never enter tool arguments and keychain is removed on error', (t) => {
  const work = mkdtempSync(join(tmpdir(), 'identity-'))
  t.after(() => rmSync(work, { recursive: true }))
  const commands: string[][] = []
  const tool: Run = (tool, args, opts) => {
    commands.push([tool, ...args])
    if (args[0] === 'delete-keychain') assert.deepEqual(opts?.env, { HOME: process.env.HOME })
    if (tool.endsWith('import-identity')) {
      assert.equal(opts?.env?.APPLE_DEVELOPER_ID_CERTIFICATE_PASSWORD, creds.password)
      writeFileSync(args[0], '')
    }
    if (args[0] === 'find-identity') return Buffer.from('  1) ' + 'A'.repeat(40) + ' "Developer ID Application: Test (' + team + ')"')
    return Buffer.from('')
  }
  assert.throws(() => withIdentity(work, creds, () => { throw new Error('fixture') }, tool), /fixture/)
  assert.ok(commands.some((args) => args.includes('delete-keychain')))
  for (const secret of [creds.password, creds.p12, creds.key]) assert.ok(!JSON.stringify(commands).includes(secret))
})

test('digest and size describe final stapled bytes, rejected submissions stop before stapling', (t) => {
  const work = mkdtempSync(join(tmpdir(), 'notary-'))
  t.after(() => rmSync(work, { recursive: true }))
  const dmg = join(work, 'App.dmg')
  writeFileSync(dmg, 'initial')
  let status = 'Rejected'
  const commands: string[][] = []
  const tool: Run = (_, args) => {
    commands.push(args)
    if (args.includes('submit')) return Buffer.from('{"id":"submission"}')
    if (args.includes('wait')) return Buffer.from(JSON.stringify({ status }))
    if (args.includes('staple')) writeFileSync(dmg, 'stapled')
    return Buffer.alloc(0)
  }
  assert.throws(() => notarize(dmg, 'file', creds, tool), /submission: Rejected/)
  assert.equal(commands.length, 2)
  status = 'Accepted'
  notarize(dmg, 'file', creds, tool)
  assert.deepEqual(describe('universal', dmg), { architecture: 'universal', path: dmg, filename: 'App.dmg',
    size: 7, sha256: createHash('sha256').update('stapled').digest('hex') })
  assert.ok(commands.at(-1)?.includes('--assess'))
})
