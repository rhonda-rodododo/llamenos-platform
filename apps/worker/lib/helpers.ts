const E164_REGEX = /^\+\d{7,15}$/

export function isValidE164(phone: string): boolean {
  return E164_REGEX.test(phone)
}

export function extractPathParam(path: string, prefix: string): string | null {
  const param = path.split(prefix)[1]
  if (!param || param.includes('/')) return null // Reject path traversal
  return param
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status })
}

export function error(message: string, status = 400): Response {
  return Response.json({ error: message }, { status })
}

export function uint8ArrayToBase64URL(bytes: Uint8Array): string {
  const binary = String.fromCharCode(...bytes)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function buildAudioUrlMap(settings: { fetch(req: Request): Promise<Response> }, origin: string): Promise<Record<string, string>> {
  const audioRes = await settings.fetch(new Request('http://do/settings/ivr-audio'))
  const { recordings } = await audioRes.json() as { recordings: Array<{ promptType: string; language: string }> }
  const map: Record<string, string> = {}
  for (const rec of recordings) {
    map[`${rec.promptType}:${rec.language}`] = `${origin}/api/ivr-audio/${rec.promptType}/${rec.language}`
  }
  return map
}

export function telephonyResponse(response: { contentType: string; body: string }): Response {
  return new Response(response.body, { headers: { 'Content-Type': response.contentType } })
}

export async function checkRateLimit(settings: { fetch(req: Request): Promise<Response> }, key: string, maxPerMinute: number): Promise<boolean> {
  const rlRes = await settings.fetch(new Request('http://do/rate-limit/check', {
    method: 'POST',
    body: JSON.stringify({ key, maxPerMinute }),
  }))
  const rlData = await rlRes.json() as { limited: boolean }
  return rlData.limited
}
