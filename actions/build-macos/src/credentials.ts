import { randomBytes } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { run, plist } from './utils.ts'

const P12 = 'APPLE_DEVELOPER_ID_CERTIFICATE_P12'
const PASSWORD = 'APPLE_DEVELOPER_ID_CERTIFICATE_PASSWORD'
const PROFILE = 'APPLE_DEVELOPER_ID_PROVISIONING_PROFILE'

export function takeCredentials(env = process.env) {
  function take(name: string, required = true) {
    const value = env[name] ?? ''
    delete env[name]
    if (required && !value) throw new Error('Missing ' + name)
    return value
  }
  return { p12: take(P12), password: take(PASSWORD), profile: take(PROFILE, false),
    key: take('APPLE_API_KEY'), keyId: take('APPLE_API_KEY_ID'), issuer: take('APPLE_API_ISSUER_ID') }
}

export type Credentials = ReturnType<typeof takeCredentials>
export type Identity = { keychain: string, fingerprint: string, team: string }
export type Profile = { ExpirationDate: string, Platform: string[], ProvisionsAllDevices?: boolean,
  ProvisionedDevices?: string[], TeamIdentifier: string[], ApplicationIdentifierPrefix: string[],
  DeveloperCertificates: string[], Entitlements: Record<string, unknown> }

export function readProfile(path: string, tool = run) {
  const decoded = tool('/usr/bin/security', ['cms', '-D', '-i', path], { quiet: true })
  return { path, profile: plist(decoded) as Profile }
}

export type DistributionProfile = ReturnType<typeof readProfile>

/** Decode a single provisioning profile for the main app. */
export function profileData(work: string, encoded: string, tool = run) {
  if (!encoded) return undefined
  const base64 = encoded.replace(/\s/g, '')
  const bytes = Buffer.from(base64, 'base64')
  if (!bytes.length || bytes.toString('base64') !== base64) {
    throw new Error(PROFILE + ' must contain one Base64-encoded profile')
  }
  const path = join(work, 'distribution.provisionprofile')
  writeFileSync(path, bytes, { mode: 0o600, flag: 'wx' })
  return readProfile(path, tool)
}

/** Cleanup also runs as a fresh post-action process with the original step environment. */
export function deleteKeychain(path: string, tool = run) {
  if (existsSync(path)) tool('/usr/bin/security', ['delete-keychain', path], {
    env: { HOME: process.env.HOME },
  })
}

/** Keep the imported identity available only for the signed distribution phase. */
export function withIdentity<T>(work: string, credentials: Credentials, use: (id: Identity) => T, tool = run): T {
  const helper = join(work, 'import-identity')
  const keychain = join(work, 'signing.keychain-db')
  if (/["\\\r\n]/.test(keychain)) throw new Error('Unsupported runner temp path')
  const native = fileURLToPath(new URL('./import_identity.m', import.meta.url))
  tool('/usr/bin/xcrun', ['clang', '-fobjc-arc', '-Wno-deprecated-declarations', '-framework',
    'Security', '-framework', 'Foundation', native, '-o', helper])
  const password = randomBytes(32).toString('hex')
  const previous = tool('/usr/bin/security', ['list-keychains', '-d', 'user']).toString()
    .split('\n').map((s) => s.trim().replace(/^"|"$/g, '')).filter(Boolean)
  try {
    tool(helper, [keychain], { quiet: true, env: { ...process.env, [P12]: credentials.p12.replace(/\s/g, ''),
      [PASSWORD]: credentials.password, TEMP_KEYCHAIN_PASSWORD: password } })
    // Interactive security resolves keychain names against the user library. Use the full
    // quoted path and deliver the generated password on stdin with output suppressed.
    tool('/usr/bin/security', ['-i'], { input: 'set-key-partition-list -S apple-tool:,apple:,codesign: -s -k '
      + password + ' "' + keychain + '"\n', cwd: work, quiet: true })
    tool('/usr/bin/security', ['list-keychains', '-d', 'user', '-s', keychain, ...previous])
    const listing = tool('/usr/bin/security', ['find-identity', '-v', '-p', 'codesigning', keychain]).toString()
    const matches = [...listing.matchAll(/^\s*\d+\)\s+([A-Fa-f0-9]{40}) "Developer ID Application: .+ \(([A-Z0-9]+)\)"$/gm)]
    if (matches.length !== 1) throw new Error('The P12 must contain one valid Developer ID Application identity')
    return use({ keychain, fingerprint: matches[0][1].toUpperCase(), team: matches[0][2] })
  } finally {
    try {
      deleteKeychain(keychain, tool)
    } finally {
      tool('/usr/bin/security', ['list-keychains', '-d', 'user', '-s', ...previous])
    }
  }
}
