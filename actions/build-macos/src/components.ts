import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { plist, readBlocks, run, within } from './utils.ts'

export type Component = {
  path: string
  binary?: string
  bundleId?: string
  profilePath?: string
  frameworkVersion?: string
}

const MACH_HEADERS = new Set(['feedface', 'cefaedfe', 'feedfacf', 'cffaedfe',
  'cafebabe', 'bebafeca', 'cafebabf', 'bfbafeca'])

function isMachCode(path: string) {
  let magic = ''
  readBlocks(path, 4, (bytes) => { magic = bytes.toString('hex'); return false })
  if (!MACH_HEADERS.has(magic)) return false
  // Fat archives and Java class resources can also carry the Universal magic.
  const description = run('/usr/bin/file', ['-b', path]).toString()
  return /Mach-O.*(?:executable|shared library|bundle|kext|dynamic linker)/i.test(description)
}

/** Enumerate physical code once, in the order required for sealing nested bundles. */
export function components(app: string): Component[] {
  const result: Component[] = []
  const root = realpathSync(app)
  const owned = new Set<string>()
  function bundle(path: string, content: string, infoPath: string, version?: string): Component | undefined {
    const info = plist(readFileSync(within(root, infoPath)))
    const name = info.CFBundleExecutable
    if (!name && info.CFBundlePackageType !== 'KEXT') return undefined // resource-only bundle
    const id = info.CFBundleIdentifier
    if (typeof id !== 'string' || !id) throw new Error('Missing CFBundleIdentifier in ' + infoPath)
    let binary: string | undefined
    if (name !== undefined) {
      if (typeof name !== 'string' || !name || basename(name) !== name) throw new Error('Invalid executable in ' + infoPath)
      const location = basename(content) === 'Contents' ? join(content, 'MacOS', name) : join(content, name)
      binary = within(content, location)
      owned.add(binary)
    }
    return { path, binary, bundleId: id, frameworkVersion: version,
      profilePath: path.endsWith('.framework') ? undefined : join(content, 'embedded.provisionprofile') }
  }

  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isSymbolicLink()) { within(root, path); continue }
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile() && !owned.has(path) && isMachCode(path)) result.push({ path, binary: path })
    }
  }
  function visit(path: string) {
    const versions = join(path, 'Versions')
    if (path.endsWith('.framework') && existsSync(versions)) {
      within(root, versions)
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) within(root, join(path, entry.name))
      }
      for (const entry of readdirSync(versions, { withFileTypes: true })) {
        const dir = join(versions, entry.name)
        if (entry.isSymbolicLink()) { within(root, dir); continue }
        if (!entry.isDirectory()) continue
        const unit = bundle(path, dir, join(dir, 'Resources/Info.plist'), entry.name)
        walk(dir)
        if (unit) result.push(unit)
      }
      return
    }
    const contents = join(path, 'Contents')
    let unit: Component | undefined
    if (existsSync(join(contents, 'Info.plist'))) {
      unit = bundle(path, contents, join(contents, 'Info.plist'))
    } else if (path.endsWith('.framework')) {
      const info = [join(path, 'Resources/Info.plist'), join(path, 'Info.plist')].find(existsSync)
      if (!info) throw new Error('Missing framework Info.plist: ' + path)
      unit = bundle(path, path, info)
    } else if (/\.(app|appex|xpc|bundle|plugin|systemextension|dext|kext)$/i.test(path)
        && existsSync(join(path, 'Info.plist'))) {
      unit = bundle(path, path, join(path, 'Info.plist'))
    }
    walk(path)
    if (unit) result.push(unit)
  }
  visit(root)
  if (result.at(-1)?.path !== root) throw new Error('Missing executable for ' + relative(root, app))
  return result
}
