/**
 * Platform abstraction module.
 *
 * When building for Node.js, the bundler (esbuild) aliases
 * 'cloudflare:workers' to this module. This way, all DO files
 * keep their `import { DurableObject } from 'cloudflare:workers'`
 * unchanged — the bundler transparently swaps the import target.
 *
 * - CF build (wrangler): resolves 'cloudflare:workers' natively
 * - Node build (esbuild): resolves 'cloudflare:workers' → this file
 */
export { DurableObject } from './node/durable-object'
