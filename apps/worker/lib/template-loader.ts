/**
 * Template loader — loads bundled case management templates.
 *
 * Templates are JSON files in packages/protocol/templates/ that are
 * statically imported at build time. For Node.js runtime, they're
 * loaded via require(). For Cloudflare Workers, they're bundled.
 */
import type { CaseManagementTemplate } from '../../../packages/protocol/template-types'

// Templates will be loaded dynamically to avoid import issues
// across different runtimes (Node.js vs Cloudflare Workers)
let cachedTemplates: CaseManagementTemplate[] | null = null

export async function loadBundledTemplates(
  importFn: (path: string) => Promise<unknown> = (path) => import(path),
): Promise<CaseManagementTemplate[]> {
  if (cachedTemplates) return cachedTemplates

  // Dynamic imports work in both Node.js and Cloudflare Workers bundled builds
  const templateFiles = [
    'general-hotline',
    'jail-support',
    'street-medic',
    'ice-rapid-response',
    'bail-fund',
    'dv-crisis',
    'anti-trafficking',
    'hate-crime-reporting',
    'copwatch',
    'tenant-organizing',
    'mutual-aid',
    'missing-persons',
    'kyr-training',
  ]

  const templates: CaseManagementTemplate[] = []
  for (const name of templateFiles) {
    try {
      const mod = await importFn(`../../../packages/protocol/templates/${name}.json`)
      const template = (mod as Record<string, unknown>).default ?? mod
      templates.push(template as CaseManagementTemplate)
    } catch {
      // Template file not found — skip silently
    }
  }

  cachedTemplates = templates
  return templates
}
