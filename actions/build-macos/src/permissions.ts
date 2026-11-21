import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import type { Product } from './build.ts'
import type { Identity, Profile } from './credentials.ts'

function permits(rule: unknown, value: unknown): boolean {
  if (Array.isArray(rule)) {
    return (Array.isArray(value) ? value : [value]).every((v) => rule.some((r) => permits(r, v)))
  }
  if (typeof rule === 'string' && rule.endsWith('*') && typeof value === 'string') {
    return value.startsWith(rule.slice(0, -1))
  }
  return isDeepStrictEqual(rule, value)
}

function expand(value: unknown, vars: Record<string, string>): unknown {
  if (Array.isArray(value)) return value.map((v) => expand(v, vars))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, expand(v, vars)]))
  }
  if (typeof value !== 'string') return value
  return value.replace(/\$\(([^)]+)\)|\$\{([^}]+)\}/g, (_, a, b) => {
    const replacement = vars[a ?? b]
    if (typeof replacement !== 'string' || replacement.includes('$')) throw new Error('Unresolved entitlement variable: ' + (a ?? b))
    return replacement
  })
}

export function signingPermissions(app: Pick<Product, 'bundleId' | 'permissions' | 'settings'>, identity: Identity, profile?: Profile) {
  const appKey = 'com.apple.application-identifier'
  const teamKey = 'com.apple.developer.team-identifier'
  let prefix = identity.team
  if (profile) {
    if (!(Date.parse(profile.ExpirationDate) > Date.now()) || !profile.Platform?.includes('OSX')
        || !profile.ProvisionsAllDevices || profile.ProvisionedDevices
        || profile.Entitlements?.['com.apple.security.get-task-allow'] || profile.Entitlements?.['get-task-allow']) {
      throw new Error('Expected a current macOS Developer ID distribution profile')
    }
    if (!isDeepStrictEqual(profile.TeamIdentifier, [identity.team]) || profile.ApplicationIdentifierPrefix?.length !== 1) {
      throw new Error('Profile team or application prefix mismatch')
    }
    if (!profile.DeveloperCertificates?.some((der) => createHash('sha1').update(Buffer.from(der, 'base64'))
      .digest('hex').toUpperCase() === identity.fingerprint)) throw new Error('Profile does not authorize signing certificate')
    prefix = profile.ApplicationIdentifierPrefix[0]
  }
  const identifier = prefix + '.' + app.bundleId
  const vars = { ...app.settings, AppIdentifierPrefix: prefix + '.', TeamIdentifierPrefix: identity.team + '.',
    PRODUCT_BUNDLE_IDENTIFIER: app.bundleId }
  const values: Record<string, unknown> = Object.fromEntries(Object.entries(app.permissions)
    .map(([key, v]) => [key, expand(v, vars)]))
  if (profile) {
    for (const [key, value] of [[appKey, identifier], [teamKey, identity.team]]) {
      if (key in values && values[key] !== value) throw new Error('Conflicting entitlement: ' + key)
      values[key] = value
    }
  }
  for (const [key, value] of Object.entries(values)) {
    if (['get-task-allow', 'com.apple.security.get-task-allow'].includes(key) && value) {
      throw new Error('Debugging entitlement cannot be distributed')
    }
    const restricted = [appKey, 'keychain-access-groups', 'aps-environment'].includes(key)
      || key.startsWith('com.apple.developer.')
    const allowed = profile?.Entitlements ?? {}
    if ((restricted || key in allowed) && !permits(allowed[key], value)) {
      throw new Error('Profile does not authorize entitlement: ' + key)
    }
  }
  return values
}
