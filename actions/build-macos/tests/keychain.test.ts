import { strict as assert } from 'node:assert'
import { X509Certificate, randomBytes } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ARCHS, build, schemeArgs, type Mode } from '../src/build.ts'
import { components } from '../src/components.ts'
import { test } from 'node:test'
import { createSignedImage, describe } from '../src/package.ts'
import { withIdentity } from '../src/credentials.ts'
import { plist, run, type Run } from '../src/utils.ts'

test('a temporary P12 permits unattended codesign and is cleaned up', { skip: process.platform !== 'darwin' }, (t) => {
  const work = mkdtempSync(join(tmpdir(), 'releasebits-identity-'))
  t.after(() => rmSync(work, { recursive: true, force: true }))
  const password = randomBytes(24).toString('hex')
  const opts = { cwd: work, quiet: true, env: { ...process.env, TEST_PASSWORD: password } }
  writeFileSync(join(work, 'cert.conf'), [
    '[req]', 'distinguished_name=dn', 'x509_extensions=ext', 'prompt=no', '[dn]',
    'CN=ReleaseBits Temporary Test', '[ext]', 'extendedKeyUsage=codeSigning', 'keyUsage=digitalSignature',
  ].join('\n'))
  run('/usr/bin/openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-config', 'cert.conf', '-out', 'cert.pem', '-keyout', 'key.pem'], opts)
  run('/usr/bin/openssl', ['pkcs12', '-export', '-inkey', 'key.pem', '-in', 'cert.pem',
    '-out', 'fixture.p12', '-passout', 'env:TEST_PASSWORD', '-keypbe', 'PBE-SHA1-3DES',
    '-certpbe', 'PBE-SHA1-3DES', '-macalg', 'sha1'], opts)
  const hash = new X509Certificate(readFileSync(join(work, 'cert.pem'))).fingerprint.replaceAll(':', '')
  // Only Apple's Developer ID lookup is simulated; import, partition ACL, signing,
  // verification and cleanup use system tools and a throwaway, untrusted identity.
  const nativeTool: Run = (tool, args, options) => args[0] === 'find-identity'
    ? Buffer.from('1) ' + hash + ' "Developer ID Application: Fixture (FIXTURE123)"')
    : run(tool, args, options)
  writeFileSync(join(work, 'main.c'), 'int main(void) { return 0; }\n')
  run('/usr/bin/xcrun', ['clang', 'main.c', '-o', 'probe'], opts)
  const root = join(work, 'repo')
  cpSync(fileURLToPath(new URL('./fixture', import.meta.url)), root, { recursive: true })
  const options = { project: '', scheme: 'Sample', name: '', version: '2.4.0', configuration: 'Release', entitlements: '' }
  const product = build(root, work, schemeArgs(root, options), 'universal', options)
  const app = product.path
  const framework = join(app, 'Contents/Frameworks/SampleKit.framework')
  cpSync(join(framework, 'Versions/A'), join(framework, 'Versions/B'), { recursive: true, verbatimSymlinks: true })
  const helper = join(app, 'Contents/Library/LoginItems/Assistant.app/Contents')
  mkdirSync(join(helper, 'MacOS'), { recursive: true })
  cpSync(join(app, 'Contents/MacOS/Sample'), join(helper, 'MacOS/Assistant'))
  writeFileSync(join(helper, 'Info.plist'), run('/usr/bin/plutil', ['-convert', 'xml1', '-o', '-', '--', '-'],
    { input: JSON.stringify({ CFBundleExecutable: 'Assistant', CFBundleIdentifier: 'org.example.assistant',
      CFBundlePackageType: 'APPL', CFBundleVersion: '1' }) }))
  const library = join(app, 'Contents/Frameworks/libExtra.dylib')
  run('/usr/bin/xcrun', ['clang', '-arch', 'arm64', '-arch', 'x86_64', '-dynamiclib',
    join(root, 'library.c'), '-o', library])
  withIdentity(work, { p12: readFileSync(join(work, 'fixture.p12')).toString('base64'),
    password, key: '', keyId: '', issuer: '', profile: '' }, (identity) => {
    const { keychain, fingerprint } = identity
    run('/usr/bin/codesign', ['--force', '--keychain', keychain, '--timestamp=none', '--sign', fingerprint, join(work, 'probe')])
    run('/usr/bin/codesign', ['--verify', '--strict', join(work, 'probe')])
    // Use real codesign and hdiutil. Only checks requiring an Apple-issued identity
    // are replaced for this disposable certificate.
    const localDistribution: Run = (tool, args, options) => {
      if (tool.endsWith('/codesign')) args = args.filter((a) => !a.startsWith('-R='))
        .map((a) => a === '--timestamp' ? '--timestamp=none' : a)
      return run(tool, args, options)
    }
    const resources = join(app, 'Contents/Resources')
    mkdirSync(resources, { recursive: true })
    // Minimal class extending java.lang.Object with no fields or methods.
    writeFileSync(join(resources, 'Example.class'), Buffer.from(
      'cafebabe0000003400050100074578616d706c650700010100106a6176612f6c616e672f4f626a656374' +
      '0700030021000200040000000000000000', 'hex'))
    const helperRights = { 'com.apple.security.app-sandbox': true, 'com.apple.security.files.user-selected.read-only': true }
    const rightsFile = join(work, 'helper.entitlements')
    writeFileSync(rightsFile, run('/usr/bin/plutil', ['-convert', 'xml1', '-o', '-', '--', '-'], { input: JSON.stringify(helperRights) }))
    run('/usr/bin/codesign', ['--force', '--sign', '-', '--entitlements', rightsFile, join(helper, '..')])
    for (const mode of Object.keys(ARCHS) as Mode[]) {
      const path = createSignedImage({ ...product, mode }, work, work, identity, undefined, localDistribution)
      const signed = join(work, 'stage-' + mode, 'Sample.app')
      const units = components(signed)
      for (const name of ['Sample.app', 'Assistant.app', 'Worker.xpc', 'Share.appex', 'libExtra.dylib']) {
        assert.ok(units.some((u) => basename(u.path) === name), name)
      }
      assert.deepEqual(units.filter((u) => u.frameworkVersion).map((u) => u.frameworkVersion).sort(), ['A', 'B'])
      for (const u of units) {
        if (u.binary) assert.deepEqual(run('/usr/bin/lipo', ['-archs', u.binary]).toString().trim().split(/\s+/).sort(), [...ARCHS[mode]].sort())
        if (u.bundleId === 'org.example.assistant') {
          assert.deepEqual(plist(run('/usr/bin/codesign', ['-d', '--entitlements', '-', '--xml', u.path])), helperRights)
        }
        if (u.bundleId === 'org.example.sample.worker') {
          assert.deepEqual(plist(run('/usr/bin/codesign', ['-d', '--entitlements', '-', '--xml', u.path])), {
            'com.apple.security.app-sandbox': true, 'com.apple.security.network.client': true,
          })
        }
      }
      run('/usr/bin/codesign', ['--verify', '--deep', '--strict', signed])
      const image = describe(mode, path)
      assert.equal(image.filename, 'Sample-2.4.0' + (mode === 'universal' ? '' : '-' + mode) + '.dmg')
      assert.ok(image.size > 0)
      assert.match(image.sha256, /^[a-f0-9]{64}$/)
      run('/usr/bin/codesign', ['--verify', '--strict', image.path])
    }
    assert.deepEqual(run('/usr/bin/lipo', ['-archs', library]).toString().trim().split(/\s+/).sort(), [...ARCHS.universal].sort())
    const failure = join(work, 'missing-architecture')
    mkdirSync(failure)
    run('/usr/bin/lipo', [library, '-thin', 'arm64', '-output', join(framework, 'Versions/A/IntelMissing')])
    assert.throws(() => createSignedImage(product, failure, failure, identity, undefined, localDistribution),
      /IntelMissing: Missing architecture x86_64/)
    assert.equal(existsSync(join(failure, 'Sample-2.4.0.dmg')), false)
    rmSync(join(framework, 'Versions/A/IntelMissing'))
    const conflict = join(work, 'conflicting-rights')
    mkdirSync(conflict)
    const helperBinary = join(helper, 'MacOS/Assistant')
    const slices = ARCHS.universal.map((arch) => {
      const path = join(conflict, arch)
      run('/usr/bin/lipo', [helperBinary, '-thin', arch, '-output', path])
      return path
    })
    run('/usr/bin/codesign', ['--force', '--sign', '-', slices[0]])
    run('/usr/bin/lipo', ['-create', ...slices, '-output', helperBinary])
    assert.throws(() => createSignedImage(product, conflict, conflict, identity, undefined, localDistribution),
      /Assistant.app: Prebuilt entitlements differ between selected architectures/)
  }, nativeTool)
  assert.equal(existsSync(join(work, 'signing.keychain-db')), false)
})
