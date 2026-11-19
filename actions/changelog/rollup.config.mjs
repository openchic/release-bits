import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import typescript from '@rollup/plugin-typescript'
import { readFileSync, readdirSync, existsSync, rmSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { isBuiltin } from 'node:module'

function distribution() {
  return {
    name: 'distribution',
    buildStart() {
      // Remove stale chunks when a source module is renamed or removed.
      rmSync(new URL('./dist/', import.meta.url), { recursive: true, force: true })
    },
    generateBundle() {
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

export default {
  input: { index: 'src/index.ts' },
  external: isBuiltin,
  plugins: [distribution(), resolve({ preferBuiltins: true }), commonjs({ ignoreTryCatch: false }), json(), typescript({ include: ['src/**/*.ts'] })],
  output: { dir: 'dist', format: 'es', entryFileNames: '[name].mjs', chunkFileNames: '[name].mjs' },
}
