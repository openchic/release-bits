const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
export const BUMPS = ['major', 'minor', 'patch']

function parts(version: string) {
  const match = VERSION.exec(version.trim())
  if (!match) throw new Error('version must use X.Y.Z format')
  return match.slice(1).map(BigInt)
}

export function effectiveVersion(version: string, kind = '') {
  const values = parts(version)
  if (!kind) return values.join('.')
  const index = BUMPS.indexOf(kind)
  if (index < 0) throw new Error('version-type must be major, minor or patch')
  values[index] += 1n
  return values.fill(0n, index + 1).join('.')
}

export function isNewer(candidate: string, previous: string) {
  const left = parts(candidate)
  const right = parts(previous)
  const i = left.findIndex((value, index) => value !== right[index])
  return i >= 0 && left[i] > right[i]
}
