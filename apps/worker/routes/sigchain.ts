/**
 * Sigchain API routes — Phase 6 key management.
 *
 * GET  /api/users/:targetPubkey/sigchain — Fetch full sigchain (admin or self).
 * POST /api/users/:targetPubkey/sigchain — Append a signed link (self only).
 */
import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import { z } from 'zod'
import type { AppEnv } from '../types'
import { requirePermission, checkPermission } from '../middleware/permission-guard'
import { authErrors, notFoundError } from '../openapi/helpers'
import { CryptoKeyError } from '../services/crypto-keys'

const sigchainRoutes = new Hono<AppEnv>()

// ---------------------------------------------------------------------------
// Zod schemas (inline — small surface, not worth a separate protocol file yet)
// ---------------------------------------------------------------------------

const sigchainLinkSchema = z.object({
  id: z.string(),
  userPubkey: z.string(),
  seqNo: z.number().int().nonnegative(),
  linkType: z.string(),
  payload: z.unknown(),
  signature: z.string(),
  prevHash: z.string(),
  hash: z.string(),
  createdAt: z.string(),
})

const sigchainResponseSchema = z.object({
  links: z.array(sigchainLinkSchema),
})

const appendLinkBodySchema = z.object({
  seqNo: z.number().int().nonnegative(),
  linkType: z.enum(['genesis', 'device_add', 'device_remove', 'key_rotate', 'puk_epoch']),
  payload: z.record(z.string(), z.unknown()),
  /** Ed25519 signature over canonical(prevHash || linkType || seqNo || payload), hex. */
  signature: z.string().regex(/^[0-9a-f]{128}$/i, 'Must be 64-byte Ed25519 signature in hex'),
  /** SHA-256 hash of the previous link (hex). Empty string for genesis. */
  prevHash: z.string().regex(/^([0-9a-f]{64}|)$/i, 'Must be SHA-256 hex or empty string'),
  /** SHA-256 hash of this link (hex). */
  hash: z.string().regex(/^[0-9a-f]{64}$/i, 'Must be SHA-256 hex'),
})

// ---------------------------------------------------------------------------
// GET /api/users/:targetPubkey/sigchain
// ---------------------------------------------------------------------------

sigchainRoutes.get('/',
  describeRoute({
    tags: ['Sigchain'],
    summary: 'Fetch full sigchain for a user',
    description: 'Admins may fetch any user\'s sigchain. Volunteers may only fetch their own.',
    responses: {
      200: {
        description: 'Sigchain links ordered by seqNo ascending',
        content: {
          'application/json': {
            schema: resolver(sigchainResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('users:read'),
  async (c) => {
    const callerPubkey = c.get('pubkey')
    const permissions = c.get('permissions')
    const targetPubkey = c.req.param('targetPubkey') ?? ''

    if (!targetPubkey) return c.json({ error: 'Missing targetPubkey' }, 400)

    // Admins (users:read-all permission via '*') can see any sigchain.
    // Volunteers may only see their own.
    const isAdmin = checkPermission(permissions, '*')
    if (!isAdmin && callerPubkey !== targetPubkey) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    const services = c.get('services')
    const links = await services.cryptoKeys.getSigchain(targetPubkey)
    return c.json({ links })
  },
)

// ---------------------------------------------------------------------------
// POST /api/users/:targetPubkey/sigchain
// ---------------------------------------------------------------------------

sigchainRoutes.post('/',
  describeRoute({
    tags: ['Sigchain'],
    summary: 'Append a signed sigchain link',
    description: 'Users may only append to their own sigchain. The server validates hash-chain continuity.',
    responses: {
      201: {
        description: 'Link appended',
        content: {
          'application/json': {
            schema: resolver(sigchainLinkSchema),
          },
        },
      },
      409: { description: 'Hash-chain continuity violation (seqNo or prevHash mismatch)' },
      ...authErrors,
    },
  }),
  validator('json', appendLinkBodySchema),
  async (c) => {
    const callerPubkey = c.get('pubkey')
    const targetPubkey = c.req.param('targetPubkey') ?? ''

    if (!targetPubkey) return c.json({ error: 'Missing targetPubkey' }, 400)

    // Users may only append to their own sigchain
    if (callerPubkey !== targetPubkey) {
      return c.json({ error: 'Forbidden: cannot write to another user\'s sigchain' }, 403)
    }

    const body = c.req.valid('json')
    const services = c.get('services')

    try {
      const link = await services.cryptoKeys.appendSigchainLink(targetPubkey, body)
      return c.json(link, 201)
    } catch (err) {
      if (err instanceof CryptoKeyError) {
        return c.json({ error: err.message }, err.status)
      }
      throw err
    }
  },
)

export default sigchainRoutes
