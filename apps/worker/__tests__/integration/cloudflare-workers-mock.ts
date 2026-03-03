/**
 * Mock for `cloudflare:workers` module.
 *
 * Provides a minimal DurableObject base class that stores ctx and env
 * on the instance, matching the real Workers runtime behavior.
 */

export class DurableObject<E = unknown> {
  protected ctx: unknown
  protected env: E

  constructor(ctx: unknown, env: E) {
    this.ctx = ctx
    this.env = env
  }
}
