import { createHash } from 'node:crypto'
import { accessSync, constants, openAsBlob, readFileSync, realpathSync, statSync } from 'node:fs'
import { copyFile } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { effectiveVersion } from '../../../shared/version.mts'

const MAX_ASSETS = 1_000
const ASSET_SIZE_LIMIT = 2 * 1024 ** 3

type AssetFile = { path: string, name: string, size: number }
export type ReleaseAsset = { name: string, size: number, sha256: string, blob: Blob }
export type ReleaseNotes = { version: string, notesEn: string[], markdown: string }

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function inside(root: string, target: string) {
  const path = relative(root, target)
  return path !== '' && path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path)
}

export function workspaceRoot(input: string) {
  const root = realpathSync(input)
  if (!statSync(root).isDirectory()) throw new Error('GITHUB_WORKSPACE must be a directory')
  return root
}

function repositoryFile(root: string, input: string, label: string) {
  const value = input.trim()
  if (!value) throw new Error(`${label} path is required`)
  if (isAbsolute(value)) throw new Error(`${label} path must be relative to the repository root`)

  const candidate = resolve(root, value)
  let path: string
  try {
    path = realpathSync(candidate)
  } catch {
    throw new Error(`${label} file does not exist: ${value}`)
  }
  if (!inside(root, path)) throw new Error(`${label} path must stay inside the repository root`)

  const stats = statSync(path)
  if (!stats.isFile()) throw new Error(`${label} path must be a regular file: ${value}`)
  try {
    accessSync(path, constants.R_OK)
  } catch {
    throw new Error(`${label} file is not readable: ${value}`)
  }
  return { path, name: basename(candidate), size: stats.size }
}

export function loadNotes(root: string, catalogPath: string, versionInput: string): ReleaseNotes {
  const repository = workspaceRoot(root)
  const requested = versionInput.trim()
  if (!requested) throw new Error('version is required')
  const version = effectiveVersion(requested)
  const file = repositoryFile(repository, catalogPath, 'catalog')

  let value: unknown
  try {
    value = JSON.parse(readFileSync(file.path, 'utf8'))
  } catch (error) {
    throw new Error('Unable to read catalog JSON: ' + (error instanceof Error ? error.message : String(error)))
  }
  if (!Array.isArray(value) || !value.every(record)) throw new Error('Invalid catalog records')

  const matches = value.filter((item: Record<string, unknown>) => item.version === version)
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one catalog record for ${version}; found ${matches.length}`)
  }

  const notes = record(matches[0].notes) ? matches[0].notes.en : undefined
  if (!Array.isArray(notes) || !notes.length ||
      !notes.every((item) => typeof item === 'string' && item.trim())) {
    throw new Error(`Catalog notes.en for ${version} must be a non-empty array of non-empty strings`)
  }

  const notesEn = notes.map((item: string) => item.trim())
  const markdown = notesEn.map((item) => '- ' + item.replace(/\r?\n/g, '\n  ')).join('\n')
  return { version, notesEn, markdown }
}

export function prepareAssets(root: string, inputs: string[]): AssetFile[] {
  if (inputs.length > MAX_ASSETS) throw new Error(`A Release can have at most ${MAX_ASSETS} assets`)
  const repository = workspaceRoot(root)
  const names = new Set<string>()
  return inputs.map((input) => {
    const asset = repositoryFile(repository, input, 'asset')
    if (asset.size >= ASSET_SIZE_LIMIT) {
      throw new Error(`Release asset must be smaller than 2 GiB: ${input}`)
    }
    const key = asset.name.toLowerCase()
    if (names.has(key)) throw new Error(`Duplicate release asset filename: ${asset.name}`)
    names.add(key)
    return asset
  })
}

export async function stageAssets(files: AssetFile[], directory: string): Promise<ReleaseAsset[]> {
  const assets: ReleaseAsset[] = []
  for (const file of files) {
    const stagedPath = join(directory, String(assets.length))
    await copyFile(file.path, stagedPath, constants.COPYFILE_FICLONE)
    const blob = await openAsBlob(stagedPath)
    if (blob.size !== file.size) throw new Error(`Release asset size changed after validation: ${file.name}`)
    const hash = createHash('sha256')
    for await (const chunk of blob.stream()) hash.update(chunk)
    assets.push({ name: file.name, size: blob.size, sha256: hash.digest('hex'), blob })
  }
  return assets
}
