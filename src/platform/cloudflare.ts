/**
 * Cloudflare platform — re-exports from cloudflare:workers.
 * This module is used when PLATFORM !== 'node'.
 * Wrangler's bundler resolves 'cloudflare:workers' natively.
 */
export { DurableObject } from 'cloudflare:workers'
