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

export async function loadBundledTemplates(): Promise<CaseManagementTemplate[]> {
  if (cachedTemplates) return cachedTemplates

  // Dynamic imports work in both Node.js and Cloudflare Workers bundled builds
  const templateFiles = [
    'general-hotline',
    'jail-support',
    'street-medic',
  ]

  const templates: CaseManagementTemplate[] = []
  for (const name of templateFiles) {
    try {
      // Use dynamic import for cross-runtime compatibility
      const mod = await import(`../../../packages/protocol/templates/${name}.json`)
      templates.push(mod.default ?? mod)
    } catch {
      // Template file not found — skip silently
    }
  }

  cachedTemplates = templates
  return templates
}
