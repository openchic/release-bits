import { readFileSync, readdirSync, existsSync, rmSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

export function distribution(actionUrl, assets = {}) {
  return {
    name: 'distribution',
    buildStart() {
      // Remove stale chunks when a source module is renamed or removed.
      rmSync(new URL('./dist/', actionUrl), { recursive: true, force: true })
    },
    generateBundle() {
      for (const [fileName, source] of Object.entries(assets)) {
        this.emitFile({ type: 'asset', fileName, source: readFileSync(new URL(source, actionUrl)) })
      }
      const notices = new Map()
      for (const id of this.getModuleIds()) {
        if (!id.includes('/node_modules/') || id.startsWith('\0')) continue
        let dir = dirname(id)
        while (dir !== dirname(dir) && !existsSync(join(dir, 'package.json'))) dir = dirname(dir)
        const file = readdirSync(dir).find((name) => /^licen[cs]e(?:\..*)?$/i.test(name))
        if (file) {
          const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
          const key = (pkg.name || basename(dir)) + '@' + pkg.version
          if (!notices.has(key)) notices.set(key, readFileSync(join(dir, file), 'utf8').trim())
        }
      }
      this.emitFile({ type: 'asset', fileName: 'licenses.txt',
        source: [...notices.keys()].sort().map((key) => key + '\n\n' + notices.get(key)).join('\n\n') + '\n' })
    },
  }
}
