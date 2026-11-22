import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import typescript from '@rollup/plugin-typescript'
import { isBuiltin } from 'node:module'
import { distribution } from '../../scripts/rollup-distribution.mjs'

export default {
  input: { index: 'src/index.ts', post: 'src/post.ts' },
  external: isBuiltin,
  plugins: [
    distribution(import.meta.url, { 'import_identity.m': './src/import_identity.m' }),
    resolve(),
    commonjs({ ignoreTryCatch: false }),
    typescript({ include: ['src/**/*.ts', '../shared/**/*.mts'] }),
  ],
  output: { dir: 'dist', format: 'es', entryFileNames: '[name].mjs', chunkFileNames: '[name].mjs' },
}
