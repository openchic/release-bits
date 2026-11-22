import { spawnSync } from 'node:child_process'
import { closeSync, openSync, readSync, realpathSync } from 'node:fs'
import { relative, isAbsolute, sep } from 'node:path'

type RunOptions = {
  input?: string | Buffer
  env?: NodeJS.ProcessEnv
  cwd?: string
  quiet?: boolean
}

export type Run = typeof run

/** Invoke a tool without shell interpolation. Credential tools suppress diagnostics. */
export function run(tool: string, args: string[], options: RunOptions = {}): Buffer {
  const result = spawnSync(tool, args, {
    input: options.input, env: options.env ?? process.env, cwd: options.cwd,
    maxBuffer: 32 * 1024 * 1024, stdio: ['pipe', 'pipe', options.quiet ? 'ignore' : 'inherit'],
  })
  if (result.error || result.status !== 0) {
    throw new Error(tool + ' failed (' + (result.status ?? result.error?.name ?? result.signal) + ')')
  }
  return result.stdout
}

export function within(root: string, path: string) {
  const actual = realpathSync(path)
  const rel = relative(realpathSync(root), actual)
  if (isAbsolute(rel) || rel === '..' || rel.startsWith('..' + sep)) throw new Error('Path outside ' + root)
  return actual
}

/** Read a file in bounded chunks until the visitor returns false. */
export function readBlocks(path: string, size: number, visit: (bytes: Buffer) => boolean) {
  const fd = openSync(path, 'r')
  const buffer = Buffer.allocUnsafe(size)
  try {
    for (;;) {
      const bytes = readSync(fd, buffer)
      if (!bytes || !visit(buffer.subarray(0, bytes))) break
    }
  } finally {
    closeSync(fd)
  }
}

/** Decode Apple's binary/XML plists, including CMS dates and DER certificate bytes. */
export function plist(input: Buffer): Record<string, unknown> {
  const decoder = [
    'import base64, datetime, json, plistlib, sys',
    'def encode(value):',
    '    if isinstance(value, bytes): return base64.b64encode(value).decode()',
    '    if isinstance(value, datetime.datetime): return value.isoformat() + "Z"',
    '    raise TypeError("Unsupported plist value")',
    'print(json.dumps(plistlib.loads(sys.stdin.buffer.read()), default=encode))',
  ].join('\n')
  return JSON.parse(run('/usr/bin/python3', ['-I', '-c', decoder], { input, quiet: true }).toString())
}
