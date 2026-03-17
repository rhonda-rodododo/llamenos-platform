/**
 * Platform abstraction module.
 *
 * For the Bun self-hosted runtime, the 'cloudflare:workers' import
 * is aliased to this module via tsconfig.json paths. All DO files
 * keep their `import { DurableObject } from 'cloudflare:workers'`
 * unchanged — Bun's runtime module resolution swaps the import target.
 */
export { DurableObject } from './bun/durable-object'
