import { readdirSync, readFileSync, existsSync, realpathSync, statSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import { BUMPS, effectiveVersion } from '../../../shared/version.mts'
import { components } from './components.ts'
import { resolveComponentSettings, targetSettings, workspaceMembers } from './targets.ts'
import { plist, run, within } from './utils.ts'

export const ARCHS = { universal: ['arm64', 'x86_64'], intel: ['x86_64'], 'apple-silicon': ['arm64'] }
export type Mode = keyof typeof ARCHS
export type Inputs = { project: string, scheme: string, name: string, version: string,
  configuration: string, entitlements: string }
export type Settings = Record<string, string>
export type Product = { mode: Mode, path: string, name: string, version: string, bundleId: string,
  permissions: Record<string, unknown>, settings: Settings, componentTargets?: Map<string, SigningTarget> }
export type SigningTarget = { settings: Settings, permissions: Record<string, unknown> }
const ignored = new Set(['Pods', 'Carthage', 'node_modules', 'DerivedData', 'build', 'SourcePackages', 'vendor'])

export function architectures(get: (key: Mode) => string): Mode[] {
  const keys = Object.keys(ARCHS) as Mode[]
  const specified = keys.filter((key) => get(key) !== '')
  if (!specified.length) return ['universal']
  for (const key of specified) {
    if (!['true', 'false'].includes(get(key))) throw new Error(key + ' must be true or false')
  }
  const selected = specified.filter((key) => get(key) === 'true')
  if (!selected.length) throw new Error('Select at least one architecture')
  return selected
}

function unique<T>(candidates: T[], input: string): T {
  if (candidates.length !== 1) {
    throw new Error('Specify ' + input + '. Candidates: ' + (candidates.join(', ') || '(none)'))
  }
  return candidates[0]
}

export function findProject(root: string, override: string) {
  const types = ['.xcodeproj', '.xcworkspace']
  if (override) {
    const path = within(root, resolve(root, override))
    if (!types.includes(extname(path)) || !statSync(path).isDirectory()) throw new Error('Invalid project-path')
    return path
  }
  const candidates = new Set<string>()
  function visit(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || ignored.has(entry.name)) continue
      const path = join(dir, entry.name)
      if (types.includes(extname(path))) candidates.add(path)
      else visit(path)
    }
  }
  visit(realpathSync(root))
  // Resolve workspace members, including FileRefs relative to nested Xcode groups.
  for (const path of [...candidates].filter((p) => p.endsWith('.xcworkspace'))) {
    for (const member of workspaceMembers(path)) candidates.delete(member)
  }
  return unique([...candidates].sort(), 'project-path')
}

function apps(rows: Settings[]) {
  return rows.filter((s) => s.PRODUCT_TYPE === 'com.apple.product-type.application'
    && (s.SUPPORTED_PLATFORMS || s.PLATFORM_NAME || '').split(/\s+/).includes('macosx'))
}

export function schemeArgs(root: string, inputs: Inputs, tool = run, derived?: string) {
  const path = findProject(root, inputs.project)
  const kind = path.endsWith('.xcworkspace') ? 'workspace' : 'project'
  const prefix = ['-' + kind, path]
  let scheme = inputs.scheme
  if (!scheme) {
    const listing = JSON.parse(tool('/usr/bin/xcodebuild', [...prefix, '-list', '-json']).toString())
    const schemes: string[] = listing[kind].schemes ?? []
    const candidates: string[] = []
    const failures: string[] = []
    for (const name of schemes) {
      try {
        const settings = targetSettings(tool, [...prefix, '-scheme', name, '-configuration',
          inputs.configuration, ...(derived ? ['-derivedDataPath', derived] : [])])
        if (apps(settings).length) candidates.push(name)
      } catch (error) {
        failures.push(name + ': ' + (error instanceof Error ? error.message : String(error)))
      }
    }
    if (!candidates.length && failures.length) {
      throw new Error('Specify scheme. No usable macOS App scheme found. Probe failures:\n' + failures.join('\n'))
    }
    scheme = unique(candidates, 'scheme')
    if (failures.length) console.warn('Could not read build settings for some schemes:\n' + failures.join('\n'))
  }
  return [...prefix, '-scheme', scheme, '-configuration', inputs.configuration, '-destination', 'generic/platform=macOS']
}

function mainApp(rows: Settings[], name: string) {
  const candidates = apps(rows).filter((s) => !name || s.FULL_PRODUCT_NAME === name + '.app')
  unique(candidates.map((s) => s.FULL_PRODUCT_NAME), 'app-name')
  return candidates[0]
}

/** Resolve the version once for every architecture in this invocation. */
export function resolveVersion(version: string, kind: string, projectVersion: () => string) {
  if (!kind) {
    if (!version) throw new Error('Specify version or version-type')
    if (!/^\d+(?:\.\d+){0,2}$/.test(version)) throw new Error('Invalid version: expected one to three numeric components')
    return version
  }
  if (!BUMPS.includes(kind)) throw new Error('version-type must be major, minor or patch')
  if (version) return effectiveVersion(version, kind)
  const base = projectVersion()
  if (!base) throw new Error('Missing MARKETING_VERSION for the selected app')
  try { return effectiveVersion(base, kind) }
  catch { throw new Error('MARKETING_VERSION must use X.Y.Z format') }
}

export function projectVersion(args: string[], name: string, tool = run) {
  return mainApp(targetSettings(tool, args), name).MARKETING_VERSION
}

export function build(root: string, work: string, base: string[], mode: Mode, inputs: Inputs, tool = run): Product {
  const args = [...base, '-derivedDataPath', join(work, mode), 'ONLY_ACTIVE_ARCH=NO',
    'ARCHS=' + ARCHS[mode].join(' '), 'CODE_SIGNING_ALLOWED=NO']
  args.push('MARKETING_VERSION=' + inputs.version, 'CURRENT_PROJECT_VERSION=' + inputs.version)
  const rows = targetSettings(tool, args)
  const settings = mainApp(rows, inputs.name)
  const product = settings.FULL_PRODUCT_NAME
  tool('/usr/bin/xcodebuild', [...args, '-quiet', 'build'])
  const path = join(settings.TARGET_BUILD_DIR, product)
  const info = plist(readFileSync(join(path, 'Contents/Info.plist')))
  const { CFBundleShortVersionString: version, CFBundleIdentifier: bundleId, CFBundleExecutable: executable } = info
  if (typeof version !== 'string' || !/^\d+(?:\.\d+){0,2}$/.test(version)) throw new Error('Invalid app version')
  if (version !== inputs.version || info.CFBundleVersion !== version) throw new Error('Version override missing from built app')
  if (typeof bundleId !== 'string' || !bundleId || typeof executable !== 'string') throw new Error('Missing app metadata')
  const binary = within(path, join(path, 'Contents/MacOS', executable))
  const slices = tool('/usr/bin/lipo', ['-archs', binary]).toString().trim().split(/\s+/)
  if (slices.sort().join() !== [...ARCHS[mode]].sort().join()) throw new Error('Unexpected executable architectures')
  const file = inputs.entitlements ? resolve(root, inputs.entitlements)
    : settings.CODE_SIGN_ENTITLEMENTS && resolve(settings.SRCROOT, settings.CODE_SIGN_ENTITLEMENTS)
  if (file && !existsSync(file)) throw new Error('Missing entitlements file: ' + file)
  const componentTargets = resolveComponentSettings(root, base[1], components(path).slice(0, -1),
    rows, inputs.configuration, args.filter((arg) => /^[A-Z_]+=/.test(arg)), tool)
  return { mode, path, componentTargets, name: basename(product, '.app'), version, bundleId, settings,
    permissions: file ? plist(readFileSync(within(root, file))) : {} }
}
