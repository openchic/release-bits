type RequiredEnv = 'GITHUB_TOKEN' | 'LLM_API_KEY'

export function requiredEnv(name: RequiredEnv): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}
