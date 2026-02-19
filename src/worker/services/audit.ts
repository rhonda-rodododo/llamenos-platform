import type { DOStub } from '../types'
import { hashIP } from '../lib/crypto'

export async function audit(
  records: DOStub,
  event: string,
  actorPubkey: string,
  details: Record<string, unknown> = {},
  request?: Request,
) {
  const meta: Record<string, unknown> = {}
  if (request) {
    const rawIp = request.headers.get('CF-Connecting-IP')
    meta.ip = rawIp ? hashIP(rawIp) : null
    meta.country = request.headers.get('CF-IPCountry')
    meta.ua = request.headers.get('User-Agent')
  }
  await records.fetch(new Request('http://do/audit', {
    method: 'POST',
    body: JSON.stringify({ event, actorPubkey, details: { ...details, ...meta } }),
  }))
}
