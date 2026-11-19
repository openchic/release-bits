export const DEFAULT_MODEL = 'gemini-3.5-flash-lite'
const list = { type: 'ARRAY', items: { type: 'STRING' } }
const responseSchema = {
  type: 'OBJECT', required: ['notes'], properties: { notes: {
    type: 'OBJECT', required: ['zh-CN', 'en'], properties: { 'zh-CN': list, en: list },
  } },
}

export async function requestNotes(prompt: string, model: string): Promise<unknown> {
  const key = process.env.SHIPKIT_GEMINI_API_KEY || process.env.GEMINI_API_KEY
  if (!key) throw new Error('SHIPKIT_GEMINI_API_KEY is required')
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(model) + ':generateContent'
  const response = await fetch(url, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(90_000),
    headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema, maxOutputTokens: 2048 },
    }),
  })
  if (!response.ok) throw new Error('Gemini generation failed (HTTP ' + response.status + ')')
  try {
    const result = await response.json()
    return JSON.parse(result.candidates[0].content.parts[0].text).notes
  } catch {
    throw new Error('Gemini returned no valid structured notes')
  }
}
