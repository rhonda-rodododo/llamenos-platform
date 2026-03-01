type Handler = (req: Request, params: Record<string, string>) => Promise<Response> | Response

interface Route {
  method: string
  segments: string[]
  handler: Handler
}

export class DORouter {
  private routes: Route[] = []

  get(pattern: string, handler: Handler) { this.routes.push({ method: 'GET', segments: pattern.split('/').filter(Boolean), handler }) }
  post(pattern: string, handler: Handler) { this.routes.push({ method: 'POST', segments: pattern.split('/').filter(Boolean), handler }) }
  patch(pattern: string, handler: Handler) { this.routes.push({ method: 'PATCH', segments: pattern.split('/').filter(Boolean), handler }) }
  put(pattern: string, handler: Handler) { this.routes.push({ method: 'PUT', segments: pattern.split('/').filter(Boolean), handler }) }
  delete(pattern: string, handler: Handler) { this.routes.push({ method: 'DELETE', segments: pattern.split('/').filter(Boolean), handler }) }
  all(pattern: string, handler: Handler) { for (const m of ['GET','POST','PATCH','PUT','DELETE']) this.routes.push({ method: m, segments: pattern.split('/').filter(Boolean), handler }) }

  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const method = request.method
    const pathSegments = url.pathname.split('/').filter(Boolean)

    for (const route of this.routes) {
      if (route.method !== method) continue
      if (route.segments.length !== pathSegments.length) continue

      const params: Record<string, string> = {}
      let match = true
      for (let i = 0; i < route.segments.length; i++) {
        const seg = route.segments[i]
        if (seg.startsWith(':')) {
          params[seg.slice(1)] = decodeURIComponent(pathSegments[i])
        } else if (seg !== pathSegments[i]) {
          match = false
          break
        }
      }
      if (match) return route.handler(request, params)
    }

    return new Response('Not Found', { status: 404 })
  }
}
