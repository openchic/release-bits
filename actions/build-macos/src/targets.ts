import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import type { Settings, SigningTarget } from './build.ts'
import type { Component } from './components.ts'
import { plist, run, within, type Run } from './utils.ts'

export function targetSettings(tool: Run, args: string[]): Settings[] {
  const rows: { buildSettings: Settings, error?: string }[] = JSON.parse(tool('/usr/bin/xcodebuild',
    [...args, '-showBuildSettings', '-json']).toString())
  if (rows.some((row) => row.error)) throw new Error('Xcode could not read build settings: ' + rows.find((row) => row.error)?.error)
  return rows.map((r) => r.buildSettings)
}

export function workspaceMembers(path: string): string[] {
  const members = [
    'import json, os, sys, xml.etree.ElementTree as ET',
    'base, xml = sys.argv[1:]',
    'def walk(node, parent):',
    '    for ref in node:',
    '        kind, _, name = ref.get("location", "group:").partition(":")',
    '        path = os.path.realpath(os.path.join(base if kind == "container" else parent, name))',
    '        if ref.tag == "FileRef": yield path',
    '        if ref.tag == "Group": yield from walk(ref, path)',
    'print(json.dumps(list(walk(ET.parse(xml).getroot(), base))))',
  ].join('\n')
  return JSON.parse(run('/usr/bin/python3', ['-I', '-c', members, dirname(path),
    join(path, 'contents.xcworkspacedata')]).toString())
}

// Resolve project references from the selected workspace and PBX groups. Scheme
// settings alone can omit implicit dependencies such as embedded extension targets.
function projects(entry: string) {
  const found = new Set<string>()
  const visited = new Set<string>()
  function visit(input: string) {
    if (!existsSync(input)) return
    const path = realpathSync(input)
    if (visited.has(path)) return
    visited.add(path)
    if (extname(path) === '.xcworkspace') { workspaceMembers(path).forEach(visit); return }
    if (extname(path) !== '.xcodeproj') return
    found.add(path)
    const data = JSON.parse(run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', join(path, 'project.pbxproj')]).toString())
    const base = dirname(path)
    function group(key: string, parent: string) {
      const item = data.objects[key]
      if (!item) return
      const location = resolve(item.sourceTree === 'SOURCE_ROOT' ? base : parent, item.path || '')
      if (item.isa === 'PBXFileReference' && item.path?.endsWith('.xcodeproj')) visit(location)
      if (item.children) for (const child of item.children) group(child, location)
    }
    group(data.objects[data.rootObject].mainGroup, base)
  }
  visit(entry)
  return [...found]
}

export function componentKey(unit: Component) {
  return [unit.bundleId ?? '', basename(unit.path)].join('/')
}

export function resolveComponentSettings(root: string, entry: string, units: Component[], initial: Settings[],
  configuration: string, overrides: string[], tool: Run) {
  const targets = new Map<string, SigningTarget>()
  if (!units.length) return targets
  function matches(unit: Component, settings: Settings) {
    return settings.FULL_PRODUCT_NAME === basename(unit.path)
      && (!unit.bundleId || settings.PRODUCT_BUNDLE_IDENTIFIER === unit.bundleId)
  }
  let rows = initial
  if (units.some((unit) => !rows.some((s) => matches(unit, s)))) {
    rows = [...initial]
    for (const project of projects(entry)) {
      rows.push(...targetSettings(tool, ['-project', project, '-alltargets', '-configuration', configuration,
        '-sdk', 'macosx', ...overrides]))
    }
  }
  for (const unit of units) {
    const matching = rows.filter((s) => matches(unit, s))
    if (!matching.length) continue // A vendored binary may have its own signed entitlements.
    const owners = new Set(matching.map((s) => s.PROJECT_FILE_PATH + ':' + s.TARGET_NAME))
    if (owners.size > 1) throw new Error('Ambiguous signing target for ' + unit.path)
    const settings = matching[0]
    const file = settings.CODE_SIGN_ENTITLEMENTS
    const permissions = file ? plist(readFileSync(within(root, resolve(settings.SRCROOT, file)))) : {}
    targets.set(componentKey(unit), { settings, permissions })
  }
  return targets
}
