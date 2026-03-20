const E164_REGEX = /^\+\d{7,15}$/

export function isValidE164(phone: string): boolean {
  return E164_REGEX.test(phone)
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

type AudioUrlMapSource =
  | { fetch(req: Request): Promise<Response> }
  | { getIvrAudioList(): Promise<{ recordings: Array<{ promptType: string; language: string }> }> }

export async function buildAudioUrlMap(settings: AudioUrlMapSource, origin: string): Promise<Record<string, string>> {
  let recordings: Array<{ promptType: string; language: string }>
  if ('getIvrAudioList' in settings) {
    const result = await settings.getIvrAudioList()
    recordings = result.recordings
  } else {
    const audioRes = await settings.fetch(new Request('http://do/settings/ivr-audio'))
    const data = await audioRes.json() as { recordings: Array<{ promptType: string; language: string }> }
    recordings = data.recordings
  }
  const map: Record<string, string> = {}
  for (const rec of recordings) {
    map[`${rec.promptType}:${rec.language}`] = `${origin}/api/ivr-audio/${rec.promptType}/${rec.language}`
  }
  return map
}

export function telephonyResponse(response: { contentType: string; body: string }): Response {
  return new Response(response.body, { headers: { 'Content-Type': response.contentType } })
}

export async function checkRateLimit(settings: { checkRateLimit(data: { key: string; maxPerMinute: number }): Promise<{ limited: boolean }> }, key: string, maxPerMinute: number): Promise<boolean> {
  const result = await settings.checkRateLimit({ key, maxPerMinute })
  return result.limited
}
