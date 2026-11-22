import { chmodSync, copyFileSync, existsSync, lstatSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { ARCHS, type Product } from './build.ts'
import { components, type Component } from './components.ts'
import { readProfile, type Identity, type DistributionProfile } from './credentials.ts'
import { signingPermissions } from './permissions.ts'
import { componentKey } from './targets.ts'
import { plist, run, type Run } from './utils.ts'

function selectSlices(binary: string, mode: Product['mode'], temp: string, tool: Run) {
  const actual = tool('/usr/bin/lipo', ['-archs', binary]).toString().trim().split(/\s+/)
  const required = ARCHS[mode]
  const missing = required.filter((arch) => !actual.includes(arch))
  if (missing.length) throw new Error('Missing architecture ' + missing.join(', ') + ' in ' + binary)
  if (required.length === actual.length) return
  const select = required.length === 1 ? ['-thin', required[0]] : required.flatMap((arch) => ['-extract', arch])
  tool('/usr/bin/lipo', [binary, ...select, '-output', temp])
  chmodSync(temp, statSync(binary).mode & 0o7777)
  renameSync(temp, binary)
}

function existingPermissions(unit: Component, architectures: string[], tool: Run) {
  if (!unit.binary) return {}
  const binary = unit.binary
  const permissions = architectures.map((arch) => {
    const commands = tool('/usr/bin/otool', ['-arch', arch, '-l', binary]).toString()
    if (!/\bcmd LC_CODE_SIGNATURE\b/.test(commands)) return {}
    const bytes = tool('/usr/bin/codesign', ['-d', '--arch', arch, '--entitlements', '-', '--xml', binary], { quiet: true })
    return bytes.length ? plist(bytes) : {}
  })
  if (!permissions.every((rights) => isDeepStrictEqual(rights, permissions[0]))) {
    throw new Error('Prebuilt entitlements differ between selected architectures')
  }
  return permissions[0]
}

/** Sign each physical framework version, executable and bundle before its enclosing bundle. */
export function signApp(app: string, product: Product, work: string, identity: Identity,
  mainProfile?: DistributionProfile, tool = run) {
  const units = components(app)
  for (const unit of units) {
    const main = unit === units.at(-1)
    const version = unit.frameworkVersion ? ['--bundle-version', unit.frameworkVersion] : []
    try {
      const target = main ? product : product.componentTargets?.get(componentKey(unit))
      if (unit.binary) selectSlices(unit.binary, product.mode, join(work, 'selected-slices'), tool)
      const permissions = target?.permissions ?? existingPermissions(unit, ARCHS[product.mode], tool)
      const bundleId = unit.bundleId || target?.settings.PRODUCT_BUNDLE_IDENTIFIER || basename(unit.path)
      const location = unit.profilePath
      const supplied = main ? mainProfile : undefined
      if (location && lstatSync(location, { throwIfNoEntry: false })?.isSymbolicLink()) {
        throw new Error('Profile destination must be a regular file')
      }
      const profile = supplied || (location && existsSync(location) ? readProfile(location, tool) : undefined)
      const rights = signingPermissions({ bundleId, permissions, settings: target?.settings ?? {} }, identity, profile?.profile)
      if (location && supplied) copyFileSync(supplied.path, location)
      const args = ['--force', '--options', 'runtime', '--keychain', identity.keychain, '--sign',
        identity.fingerprint, '--timestamp', ...version]
      if (Object.keys(rights).length) {
        const file = join(work, 'component.entitlements')
        writeFileSync(file, tool('/usr/bin/plutil', ['-convert', 'xml1', '-o', '-', '--', '-'],
          { input: JSON.stringify(rights) }), { mode: 0o600 })
        args.push('--entitlements', file)
      }
      tool('/usr/bin/codesign', [...args, unit.path])
      tool('/usr/bin/codesign', ['--verify', '--strict', '--all-architectures', ...version,
        '-R=anchor apple generic and certificate leaf[field.1.2.840.113635.100.6.1.13] exists', unit.path])
      if (Object.keys(rights).length) {
        const signed = plist(tool('/usr/bin/codesign', ['-d', '--entitlements', '-', '--xml', ...version, unit.path]))
        if (!isDeepStrictEqual(signed, rights)) throw new Error('Signed entitlements differ')
      }
    } catch (error) {
      throw new Error((relative(realpathSync(app), unit.path) || basename(app)) + ': ' + (error instanceof Error ? error.message : String(error)))
    }
  }
  tool('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--all-architectures', app])
}
