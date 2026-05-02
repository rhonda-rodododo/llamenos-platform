import { vi } from 'vitest'

// Polyfill vi.mocked which is absent from bun's vitest compatibility shim.
// At runtime vi.mocked(fn) is a no-op identity cast — it only exists for TypeScript types.
if (!('mocked' in vi)) {
  Object.assign(vi, { mocked: <T>(fn: T): T => fn })
}
