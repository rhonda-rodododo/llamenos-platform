/**
 * esbuild configuration for the Node.js server build.
 *
 * Bundles src/platform/node/server.ts → dist/server/index.js
 * with the key alias: 'cloudflare:workers' → 'src/platform/index.ts'
 *
 * This transparently swaps the CF DurableObject base class
 * with our PostgreSQL-backed shim, without changing any DO source files.
 */
import * as esbuild from 'esbuild'
import path from 'path'
import fs from 'fs'
const { readFileSync } = fs

// Build-time constants for reproducible builds (Epic 79)
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))
const buildTime = process.env.SOURCE_DATE_EPOCH
  ? new Date(parseInt(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString()
  : new Date().toISOString()
const buildCommit = process.env.GITHUB_SHA || 'dev'

await esbuild.build({
  entryPoints: ['src/platform/node/server.ts'],
  bundle: true,
  outfile: 'dist/server/index.js',
  platform: 'node',
  target: 'node20',
  format: 'esm',
  sourcemap: true,
  minify: false,

  // Key alias: swap CF's DurableObject with our Node.js shim
  alias: {
    'cloudflare:workers': './src/platform/index.ts',
  },

  // Path aliases matching tsconfig.json
  // These are resolved relative to the working directory
  plugins: [{
    name: 'path-aliases',
    setup(build) {
      const { existsSync } = fs

      // Try resolving with common extensions if the exact path doesn't exist
      function resolveWithExtensions(basePath) {
        if (existsSync(basePath)) return basePath
        for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
          const withExt = basePath + ext
          if (existsSync(withExt)) return withExt
        }
        // Try index files
        for (const ext of ['.ts', '.tsx', '.js']) {
          const indexPath = path.join(basePath, 'index' + ext)
          if (existsSync(indexPath)) return indexPath
        }
        return basePath
      }

      // Resolve @worker/* imports
      build.onResolve({ filter: /^@worker\// }, (args) => ({
        path: resolveWithExtensions(path.resolve('src/worker', args.path.replace('@worker/', ''))),
      }))
      // Resolve @shared/* imports
      build.onResolve({ filter: /^@shared\// }, (args) => ({
        path: resolveWithExtensions(path.resolve('src/shared', args.path.replace('@shared/', ''))),
      }))
      // Resolve @/* imports (client — shouldn't be used in server code, but just in case)
      build.onResolve({ filter: /^@\// }, (args) => ({
        path: resolveWithExtensions(path.resolve('src/client', args.path.replace('@/', ''))),
      }))
    },
  }],

  // Don't bundle these — they're installed as runtime deps
  external: [
    'postgres',
    'ws',
  ],

  // Banner to set up Node.js globals that Workers code expects
  banner: {
    js: `
// Node.js compatibility shims for Workers code
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
`,
  },

  // Define build-time constants
  define: {
    'process.env.PLATFORM': '"node"',
    '__BUILD_TIME__': JSON.stringify(buildTime),
    '__BUILD_COMMIT__': JSON.stringify(buildCommit),
    '__BUILD_VERSION__': JSON.stringify(pkg.version),
  },
})

console.log('[esbuild] Node.js server built → dist/server/index.js')
