import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import typescript from '@rollup/plugin-typescript'
import { isBuiltin } from 'node:module'
import { distribution } from '../../scripts/rollup-distribution.mjs'

export default {
  input: { index: 'src/index.ts' },
  external: isBuiltin,
  plugins: [
    distribution(import.meta.url),
    resolve(),
    commonjs({ ignoreTryCatch: false }),
    typescript({ include: ['src/**/*.ts', '../shared/**/*.mts'] }),
  ],
  output: { dir: 'dist', format: 'es', entryFileNames: '[name].mjs', chunkFileNames: '[name].mjs' },
}
