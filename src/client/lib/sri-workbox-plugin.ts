/**
 * Vite plugin that post-processes the built service worker to inject
 * SRI (Subresource Integrity) hashes for precached assets.
 *
 * After VitePWA/Workbox generates sw.js with a precache manifest,
 * this plugin:
 * 1. Reads each precached file and computes SHA-384
 * 2. Injects an integrity map into the service worker
 * 3. Patches the fetch handler to include { integrity } when available
 *
 * Gracefully degrades when the browser doesn't support integrity on fetch.
 */

import type { Plugin } from 'vite'
import { createHash } from 'crypto'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, resolve } from 'path'

function computeSRI(filePath: string): string | null {
  try {
    const content = readFileSync(filePath)
    const hash = createHash('sha384').update(content).digest('base64')
    return `sha384-${hash}`
  } catch {
    return null
  }
}

export function sriWorkboxPlugin(): Plugin {
  let outDir: string

  return {
    name: 'sri-workbox-plugin',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      const swPath = join(outDir, 'sw.js')
      if (!existsSync(swPath)) return

      let swContent = readFileSync(swPath, 'utf-8')

      // Workbox inlines the precache manifest as {url:"...",revision:...} entries.
      // Extract all URL references from these entries.
      const urlPattern = /\{url:"([^"]+)"/g
      const integrityMap: Record<string, string> = {}
      let match: RegExpExecArray | null

      while ((match = urlPattern.exec(swContent)) !== null) {
        const url = match[1]
        const filePath = join(outDir, url)
        const sri = computeSRI(filePath)
        if (sri) {
          integrityMap[url] = sri
        }
      }

      if (Object.keys(integrityMap).length === 0) return

      // Inject the integrity map and fetch wrapper at the top of sw.js
      const injection = `// SRI integrity map (auto-generated)
const __SRI_MAP=${JSON.stringify(integrityMap)};
const __origFetch=self.fetch;
self.fetch=function(input,init){try{let pathname;if(typeof input==='string'||input instanceof URL){const url=String(input);pathname=url.startsWith('/')?url.slice(1):new URL(url,self.location.origin).pathname.slice(1)}else if(input instanceof Request){pathname=new URL(input.url).pathname.slice(1)}if(pathname){const integrity=__SRI_MAP[pathname];if(integrity){init=Object.assign({},init,{integrity})}}return __origFetch.call(self,input,init)}catch(e){return __origFetch.call(self,input,init)}};
`

      swContent = injection + swContent
      writeFileSync(swPath, swContent, 'utf-8')
    },
  }
}
