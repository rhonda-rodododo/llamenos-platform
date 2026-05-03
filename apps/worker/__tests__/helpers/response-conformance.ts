/**
 * Response conformance helper — validates that a Hono route returns a response
 * body that matches its declared Zod response schema.
 *
 * Usage:
 *   const result = await assertConformsToSchema(app, 'GET', '/path', responseSchema)
 *   // throws if the response body does not parse cleanly against the schema
 */
import type { ZodTypeAny, z } from 'zod'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyHono = import('hono').Hono<any, any, any>

export interface ConformanceResult<T> {
  status: number
  raw: unknown
  parsed: T
}

/**
 * Makes a request against a Hono app and validates the response body against
 * a Zod schema.  Throws a descriptive error if validation fails.
 */
export async function assertConformsToSchema<S extends ZodTypeAny>(
  app: AnyHono,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  schema: S,
  opts: {
    body?: unknown
    headers?: Record<string, string>
    expectedStatus?: number
    env?: Record<string, unknown>
  } = {},
): Promise<ConformanceResult<z.infer<S>>> {
  const { body, headers = {}, expectedStatus = 200, env } = opts

  const requestInit: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  }
  if (body !== undefined) {
    requestInit.body = JSON.stringify(body)
  }

  // Hono's app.request(input, init, env) — pass env bindings as 3rd argument
  const res = await app.request(path, requestInit, env as Record<string, string> | undefined)

  if (res.status !== expectedStatus) {
    let detail = ''
    try {
      detail = await res.text()
    } catch {
      // ignore
    }
    throw new Error(
      `Expected HTTP ${expectedStatus} but got ${res.status} for ${method} ${path}. Body: ${detail}`,
    )
  }

  const raw = await res.json()
  const result = schema.safeParse(raw)

  if (!result.success) {
    const issues = result.error.issues
      .map(i => `  [${i.path.join('.')}] ${i.message} (code: ${i.code})`)
      .join('\n')
    throw new Error(
      `Response from ${method} ${path} does not conform to schema:\n${issues}\n\nActual response:\n${JSON.stringify(raw, null, 2)}`,
    )
  }

  return { status: res.status, raw, parsed: result.data }
}
