import { createHash } from 'node:crypto'
import { mkdirSync, statSync, symlinkSync } from 'node:fs'
import { basename, join } from 'node:path'
import { signApp } from './sign.ts'
import type { Product } from './build.ts'
import type { Credentials, Identity, DistributionProfile } from './credentials.ts'
import { readBlocks, run, type Run } from './utils.ts'

export function notarize(path: string, keyFile: string, credentials: Credentials, tool: Run = run) {
  const auth = ['--key', keyFile, '--key-id', credentials.keyId, '--issuer', credentials.issuer, '--output-format', 'json']
  const result = JSON.parse(tool('/usr/bin/xcrun', ['notarytool', 'submit', path, ...auth]).toString())
  if (typeof result.id !== 'string' || !result.id) throw new Error('Missing notarization submission ID')
  console.log('Notarization submission ' + result.id)
  const outcome = JSON.parse(tool('/usr/bin/xcrun', ['notarytool', 'wait', result.id, '--timeout', '1h', ...auth]).toString())
  if (outcome.status !== 'Accepted') throw new Error('Notarization ' + result.id + ': ' + outcome.status)
  tool('/usr/bin/xcrun', ['stapler', 'staple', path])
  tool('/usr/bin/xcrun', ['stapler', 'validate', path])
  tool('/usr/sbin/spctl', ['--assess', '--type', 'open', '--context', 'context:primary-signature', path])
}

export function describe(mode: Product['mode'], path: string) {
  const hash = createHash('sha256')
  readBlocks(path, 1024 * 1024, (bytes) => { hash.update(bytes); return true })
  return { architecture: mode, path, filename: basename(path), sha256: hash.digest('hex'), size: statSync(path).size }
}

export function createSignedImage(product: Product, work: string, output: string, identity: Identity,
  mainProfile: DistributionProfile | undefined, tool: Run = run) {
  const staging = join(work, 'stage-' + product.mode)
  mkdirSync(staging)
  const app = join(staging, basename(product.path))
  tool('/usr/bin/ditto', [product.path, app])
  signApp(app, product, work, identity, mainProfile, tool)
  symlinkSync('/Applications', join(staging, 'Applications'))
  const suffix = product.mode === 'universal' ? '' : '-' + product.mode
  const dmg = join(output, product.name + '-' + product.version + suffix + '.dmg')
  tool('/usr/bin/hdiutil', ['create', '-volname', product.name, '-srcfolder', staging, '-format', 'UDZO', dmg])
  tool('/usr/bin/codesign', ['--force', '--keychain', identity.keychain, '--sign', identity.fingerprint, '--timestamp', dmg])
  return dmg
}
