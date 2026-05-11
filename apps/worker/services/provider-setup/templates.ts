import { eq, and, desc } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import type { Database } from '../../db'
import { providerTemplates } from '../../db/schema'
import type { ProviderTemplate } from '@protocol/schemas/provider-setup'
import { ProviderApiError } from './types'

/**
 * Detects if a credential hint value looks like a real secret.
 * Rejects base64-encoded strings, long values (>100 chars), and common secret patterns.
 */
function looksLikeSecret(value: string): boolean {
  if (value.length > 100) return true
  if (/^[A-Za-z0-9+/]{40,}={0,2}$/.test(value)) return true
  if (/^(sk-|sk_live_|sk_test_|pk-|AKIA|AC[0-9a-f]{32})/i.test(value)) return true
  return false
}

export class ProviderTemplateService {
  constructor(private readonly db: Database) {}

  async createTemplate(
    data: Omit<ProviderTemplate, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<ProviderTemplate> {
    const slug = data.slug.trim().toLowerCase()

    const [existing] = await this.db
      .select()
      .from(providerTemplates)
      .where(eq(providerTemplates.slug, slug))
      .limit(1)

    if (existing) {
      throw new ProviderApiError(
        `Template with slug "${slug}" already exists`,
        409,
        'Slug already exists',
      )
    }

    for (const [key, value] of Object.entries(data.credentialHints ?? {})) {
      if (typeof value === 'string' && looksLikeSecret(value)) {
        throw new ProviderApiError(
          `credentialHints["${key}"] appears to contain a real secret. Use placeholder descriptions only.`,
          400,
          'Invalid credential hint',
        )
      }
    }

    const now = new Date().toISOString()
    const id = randomUUID()

    await this.db.insert(providerTemplates).values({
      id,
      name: data.name,
      slug,
      description: data.description ?? null,
      providerType: data.providerType,
      defaultChannels: data.defaultChannels ?? [],
      credentialHints: data.credentialHints ?? {},
      recommendedSettings: data.recommendedSettings ?? {},
      allowSubAccounts: data.allowSubAccounts ?? false,
      isActive: data.isActive ?? true,
      createdBy: data.createdBy,
      createdAt: now,
      updatedAt: now,
    })

    return {
      id,
      name: data.name,
      slug,
      description: data.description,
      providerType: data.providerType,
      defaultChannels: data.defaultChannels ?? [],
      credentialHints: data.credentialHints ?? {},
      recommendedSettings: data.recommendedSettings ?? {},
      allowSubAccounts: data.allowSubAccounts ?? false,
      isActive: data.isActive ?? true,
      createdBy: data.createdBy,
      createdAt: now,
      updatedAt: now,
    }
  }

  async updateTemplate(
    id: string,
    data: Partial<Omit<ProviderTemplate, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<ProviderTemplate> {
    const [existing] = await this.db
      .select()
      .from(providerTemplates)
      .where(eq(providerTemplates.id, id))
      .limit(1)

    if (!existing) {
      throw new ProviderApiError('Template not found', 404, 'Not found')
    }

    if (data.slug) {
      const slug = data.slug.trim().toLowerCase()
      if (slug !== existing.slug) {
        const [duplicate] = await this.db
          .select()
          .from(providerTemplates)
          .where(eq(providerTemplates.slug, slug))
          .limit(1)
        if (duplicate) {
          throw new ProviderApiError(
            `Template with slug "${slug}" already exists`,
            409,
            'Slug already exists',
          )
        }
      }
    }

    if (data.credentialHints) {
      for (const [key, value] of Object.entries(data.credentialHints)) {
        if (typeof value === 'string' && looksLikeSecret(value)) {
          throw new ProviderApiError(
            `credentialHints["${key}"] appears to contain a real secret. Use placeholder descriptions only.`,
            400,
            'Invalid credential hint',
          )
        }
      }
    }

    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() }
    if (data.name !== undefined) updates.name = data.name
    if (data.slug !== undefined) updates.slug = data.slug.trim().toLowerCase()
    if (data.description !== undefined) updates.description = data.description
    if (data.providerType !== undefined) updates.providerType = data.providerType
    if (data.defaultChannels !== undefined) updates.defaultChannels = data.defaultChannels
    if (data.credentialHints !== undefined) updates.credentialHints = data.credentialHints
    if (data.recommendedSettings !== undefined) updates.recommendedSettings = data.recommendedSettings
    if (data.allowSubAccounts !== undefined) updates.allowSubAccounts = data.allowSubAccounts
    if (data.isActive !== undefined) updates.isActive = data.isActive

    await this.db
      .update(providerTemplates)
      .set(updates)
      .where(eq(providerTemplates.id, id))

    const [updated] = await this.db
      .select()
      .from(providerTemplates)
      .where(eq(providerTemplates.id, id))
      .limit(1)

    return this.toTemplate(updated)
  }

  async deactivateTemplate(id: string): Promise<ProviderTemplate> {
    return this.updateTemplate(id, { isActive: false })
  }

  async listTemplates(activeOnly = true): Promise<ProviderTemplate[]> {
    const where = activeOnly
      ? eq(providerTemplates.isActive, true)
      : undefined

    const rows = where
      ? await this.db
          .select()
          .from(providerTemplates)
          .where(where)
          .orderBy(desc(providerTemplates.createdAt))
      : await this.db
          .select()
          .from(providerTemplates)
          .orderBy(desc(providerTemplates.createdAt))

    return rows.map((r) => this.toTemplate(r))
  }

  async getTemplate(id: string): Promise<ProviderTemplate | null> {
    const [row] = await this.db
      .select()
      .from(providerTemplates)
      .where(eq(providerTemplates.id, id))
      .limit(1)
    return row ? this.toTemplate(row) : null
  }

  async getTemplateBySlug(slug: string): Promise<ProviderTemplate | null> {
    const [row] = await this.db
      .select()
      .from(providerTemplates)
      .where(eq(providerTemplates.slug, slug))
      .limit(1)
    return row ? this.toTemplate(row) : null
  }

  private toTemplate(
    row: typeof providerTemplates.$inferSelect,
  ): ProviderTemplate {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description ?? undefined,
      providerType: row.providerType as ProviderTemplate['providerType'],
      defaultChannels: (row.defaultChannels as string[]) ?? [],
      credentialHints: (row.credentialHints as Record<string, string>) ?? {},
      recommendedSettings:
        (row.recommendedSettings as Record<string, unknown>) ?? {},
      allowSubAccounts: row.allowSubAccounts ?? false,
      isActive: row.isActive ?? true,
      createdBy: row.createdBy,
      createdAt: row.createdAt?.toISOString(),
      updatedAt: row.updatedAt?.toISOString(),
    }
  }
}
