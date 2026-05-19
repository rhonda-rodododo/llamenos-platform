/**
 * Recovery Group API routes — EP09 Phase 2+3.
 *
 * Authenticated routes (permission-gated):
 *   POST   /enroll                  — Configure recovery group (recovery:manage)
 *   GET    /:hubId                  — Get recovery group config (recovery:view)
 *   POST   /session/:id/contribute  — Submit share contribution (recovery:hold-share)
 *   GET    /session/:id             — Get session status (recovery:view, hub-scoped)
 *   POST   /session/:id/emergency   — Emergency override (recovery:approve)
 *   POST   /session/:id/cancel      — Cancel session (auth required)
 *   POST   /user-envelope           — Store user recovery envelope (auth required)
 *   POST   /shares/liveness         — Submit liveness proof (recovery:hold-share)
 *
 * Unauthenticated routes (rate-limited):
 *   POST   /initiate                — Start recovery (Signal verification)
 *   POST   /initiate/verify         — Verify Signal code
 */
import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import type { AppEnv } from '../types'
import { requirePermission } from '../middleware/permission-guard'
import { checkPermission } from '../middleware/permission-guard'
import { authErrors, publicErrors, notFoundError } from '../openapi/helpers'
import { hashIP } from '../lib/crypto'
import { checkRateLimit } from '../lib/helpers'
import { RecoveryGroupError } from '../services/recovery-group'
import {
  recoveryGroupEnrollSchema,
  recoveryGroupInfoSchema,
  recoveryInitiateSchema,
  recoveryInitiateResponseSchema,
  recoveryInitiateVerifySchema,
  recoveryInitiateVerifyResponseSchema,
  recoveryContributeSchema,
  recoveryContributeResponseSchema,
  recoverySessionStatusResponseSchema,
  userRecoveryEnvelopeSchema,
  shareLivenessProofSchema,
  recoveryCancelResponseSchema,
  recoveryEmergencyOverrideSchema,
} from '@protocol/schemas/recovery-group'
import { okResponseSchema } from '@protocol/schemas/common'
import { safeFetch } from '../lib/safe-fetch'

// ---------------------------------------------------------------------------
// Authenticated routes
// ---------------------------------------------------------------------------

const authenticatedRoutes = new Hono<AppEnv>()

// POST /enroll — Configure recovery group
authenticatedRoutes.post('/enroll',
  describeRoute({
    tags: ['Recovery Group'],
    summary: 'Configure or rotate a recovery group for a hub',
    description: 'Creates or replaces the recovery group with new Shamir shares. Requires recovery:manage permission.',
    responses: {
      200: {
        description: 'Recovery group enrolled',
        content: {
          'application/json': {
            schema: resolver(okResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('recovery:manage'),
  validator('json', recoveryGroupEnrollSchema),
  async (c) => {
    const body = c.req.valid('json')
    const services = c.get('services')

    try {
      await services.recoveryGroup.enrollHub({
        hubId: body.hubId,
        threshold: body.threshold,
        totalShares: body.totalShares,
        groupPublicKey: body.groupPublicKey,
        shareEnvelopes: body.shareEnvelopes,
        shareCommitments: body.shareCommitments,
        duressCommitments: body.duressCommitments,
        sigchainLinkHash: body.sigchainLinkHash,
        delayHours: body.delayHours,
        emergencyFloorHours: body.emergencyFloorHours,
      })
      return c.json({ ok: true })
    } catch (err) {
      if (err instanceof RecoveryGroupError) {
        return c.json({ error: err.message }, err.status)
      }
      throw err
    }
  },
)

// GET /:hubId — Get recovery group config
authenticatedRoutes.get('/:hubId',
  describeRoute({
    tags: ['Recovery Group'],
    summary: 'Get recovery group configuration for a hub',
    responses: {
      200: {
        description: 'Recovery group info',
        content: {
          'application/json': {
            schema: resolver(recoveryGroupInfoSchema),
          },
        },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('recovery:view'),
  async (c) => {
    const hubId = c.req.param('hubId')
    const services = c.get('services')

    try {
      const group = await services.recoveryGroup.getGroup(hubId)
      return c.json(group)
    } catch (err) {
      if (err instanceof RecoveryGroupError) {
        return c.json({ error: err.message }, err.status)
      }
      throw err
    }
  },
)

// POST /session/:id/contribute — Submit encrypted share contribution
authenticatedRoutes.post('/session/:id/contribute',
  describeRoute({
    tags: ['Recovery Group'],
    summary: 'Submit an encrypted share contribution to a recovery session',
    description: 'Share holder HPKE-seals their Shamir share to the new device pubkey. If threshold met, session transitions to active.',
    responses: {
      200: {
        description: 'Contribution accepted',
        content: {
          'application/json': {
            schema: resolver(recoveryContributeResponseSchema),
          },
        },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('recovery:hold-share'),
  validator('json', recoveryContributeSchema),
  async (c) => {
    const sessionId = c.req.param('id')
    const contributorPubkey = c.get('pubkey')
    const body = c.req.valid('json')
    const services = c.get('services')

    try {
      const result = await services.recoveryGroup.contributeShare({
        sessionId,
        contributorPubkey,
        encryptedShare: body.encryptedShare,
        contributorSignature: body.contributorSignature,
      })
      return c.json(result)
    } catch (err) {
      if (err instanceof RecoveryGroupError) {
        return c.json({ error: err.message }, err.status)
      }
      throw err
    }
  },
)

// GET /session/:id — Get recovery session status
authenticatedRoutes.get('/session/:id',
  describeRoute({
    tags: ['Recovery Group'],
    summary: 'Get recovery session status',
    description: 'Returns session state, contribution count, delay remaining. HPKE ciphertext only released after delay elapsed.',
    responses: {
      200: {
        description: 'Session status',
        content: {
          'application/json': {
            schema: resolver(recoverySessionStatusResponseSchema),
          },
        },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('recovery:view'),
  async (c) => {
    const sessionId = c.req.param('id')
    const user = c.get('user')
    const services = c.get('services')

    try {
      const session = await services.recoveryGroup.getSession(sessionId)

      // Enforce hub-scoping: caller must be a member of the session's hub.
      // Global admins (no hubRoles) have unrestricted access.
      const hubRoles = user.hubRoles ?? []
      if (hubRoles.length > 0 && !hubRoles.some((hr) => hr.hubId === session.hubId)) {
        return c.json({ error: 'Session not found' }, 404)
      }

      return c.json(session)
    } catch (err) {
      if (err instanceof RecoveryGroupError) {
        return c.json({ error: err.message }, err.status)
      }
      throw err
    }
  },
)

// POST /session/:id/emergency — Emergency override (shortcut delay timer)
authenticatedRoutes.post('/session/:id/emergency',
  describeRoute({
    tags: ['Recovery Group'],
    summary: 'Apply emergency override to a recovery session',
    description: 'An approver with recovery:approve permission can bypass the delay timer. Requires a valid Ed25519 signature from the approver over the sessionId. Approver must not be the recovering user.',
    responses: {
      200: {
        description: 'Emergency override applied',
        content: {
          'application/json': {
            schema: resolver(okResponseSchema),
          },
        },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('recovery:approve'),
  validator('json', recoveryEmergencyOverrideSchema),
  async (c) => {
    const sessionId = c.req.param('id')
    const body = c.req.valid('json')
    const services = c.get('services')

    try {
      await services.recoveryGroup.applyEmergencyOverride({
        sessionId,
        approverPubkey: body.approverPubkey,
        justification: body.justification,
        signature: body.signature,
      })
      return c.json({ ok: true })
    } catch (err) {
      if (err instanceof RecoveryGroupError) {
        return c.json({ error: err.message }, err.status)
      }
      throw err
    }
  },
)

// POST /session/:id/cancel — Cancel a recovery session
authenticatedRoutes.post('/session/:id/cancel',
  describeRoute({
    tags: ['Recovery Group'],
    summary: 'Cancel a recovery session',
    description: 'The recovering user (from another device) or a user with recovery:manage can cancel.',
    responses: {
      200: {
        description: 'Session cancelled',
        content: {
          'application/json': {
            schema: resolver(recoveryCancelResponseSchema),
          },
        },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  async (c) => {
    const sessionId = c.req.param('id')
    const callerPubkey = c.get('pubkey')
    const permissions = c.get('permissions')
    const services = c.get('services')

    const hasManagePermission = checkPermission(permissions, 'recovery:manage')

    try {
      await services.recoveryGroup.cancelSession({
        sessionId,
        cancelledBy: callerPubkey,
        callerPubkey,
        hasManagePermission,
      })
      return c.json({ ok: true })
    } catch (err) {
      if (err instanceof RecoveryGroupError) {
        return c.json({ error: err.message }, err.status)
      }
      throw err
    }
  },
)

// POST /user-envelope — Store/update user recovery envelope
authenticatedRoutes.post('/user-envelope',
  describeRoute({
    tags: ['Recovery Group'],
    summary: 'Store or update user recovery envelope',
    description: 'Upserts the HPKE-encrypted PUK seed envelope for the authenticated user in a specific hub.',
    responses: {
      200: {
        description: 'Envelope stored',
        content: {
          'application/json': {
            schema: resolver(okResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  validator('json', userRecoveryEnvelopeSchema),
  async (c) => {
    const userPubkey = c.get('pubkey')
    const body = c.req.valid('json')
    const services = c.get('services')

    try {
      await services.recoveryGroup.putUserEnvelope({
        userPubkey,
        hubId: body.hubId,
        envelope: body.envelope,
      })
      return c.json({ ok: true })
    } catch (err) {
      if (err instanceof RecoveryGroupError) {
        return c.json({ error: err.message }, err.status)
      }
      throw err
    }
  },
)

// POST /shares/liveness — Submit share liveness proof
authenticatedRoutes.post('/shares/liveness',
  describeRoute({
    tags: ['Recovery Group'],
    summary: 'Submit a share liveness proof',
    description: 'Share holder proves they can still decrypt their share without revealing it. Updates lastLivenessProof timestamp.',
    responses: {
      200: {
        description: 'Proof accepted',
        content: {
          'application/json': {
            schema: resolver(okResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('recovery:hold-share'),
  validator('json', shareLivenessProofSchema),
  async (c) => {
    const holderPubkey = c.get('pubkey')
    const body = c.req.valid('json')
    const services = c.get('services')

    try {
      await services.recoveryGroup.submitLivenessProof({
        hubId: body.hubId,
        holderPubkey,
        proof: body.proof,
      })
      return c.json({ ok: true })
    } catch (err) {
      if (err instanceof RecoveryGroupError) {
        return c.json({ error: err.message }, err.status)
      }
      throw err
    }
  },
)

// ---------------------------------------------------------------------------
// Unauthenticated routes (rate-limited)
// ---------------------------------------------------------------------------

const publicRoutes = new Hono<AppEnv>()

// POST /initiate — Start account recovery
publicRoutes.post('/initiate',
  describeRoute({
    tags: ['Recovery Group'],
    summary: 'Initiate account recovery (unauthenticated)',
    description: 'Starts recovery process. Sends Signal verification code. Rate limited: 10 req / 5 min per IP. Response shape identical whether user exists or not (anti-enumeration).',
    responses: {
      200: {
        description: 'Recovery initiation response',
        content: {
          'application/json': {
            schema: resolver(recoveryInitiateResponseSchema),
          },
        },
      },
      429: { description: 'Rate limited' },
      ...publicErrors,
    },
  }),
  validator('json', recoveryInitiateSchema),
  async (c) => {
    // Rate limit: 10 req / 5 min per IP
    const clientIp = c.req.header('CF-Connecting-IP') ||
      c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ||
      'unknown'
    const services = c.get('services')

    const limited = await checkRateLimit(
      services.settings,
      `recovery-initiate:${hashIP(clientIp, c.env.HMAC_SECRET)}`,
      2, // 2 per minute = 10 per 5 min
    )
    if (limited) {
      return c.json({ error: 'Too many requests. Please wait a few minutes.' }, 429)
    }

    const body = c.req.valid('json')

    // Signal notifier function — sends verification code via sidecar
    const signalNotifierFn = async (identifierHash: string, code: string): Promise<boolean> => {
      const notifierUrl = c.env.SIGNAL_NOTIFIER_URL || 'http://localhost:3100'
      const notifierToken = c.env.SIGNAL_NOTIFIER_BEARER_TOKEN || ''

      try {
        const res = await safeFetch(`${notifierUrl}/api/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${notifierToken}`,
          },
          body: JSON.stringify({
            identifierHash,
            message: `Your Llamenos recovery verification code is: ${code}\n\nIf you did not request account recovery, please contact your administrator immediately.`,
          }),
          timeoutMs: 10_000,
        })
        return res.ok
      } catch {
        return false
      }
    }

    try {
      const result = await services.recoveryGroup.initiateRecovery({
        hubId: body.hubId,
        userIdentifier: body.userIdentifier,
        newDevicePubkey: body.newDevicePubkey,
        signalNotifierFn,
        hmacSecret: c.env.HMAC_SECRET || '',
      })
      return c.json(result)
    } catch (err) {
      if (err instanceof RecoveryGroupError) {
        return c.json({ error: err.message }, err.status)
      }
      throw err
    }
  },
)

// POST /initiate/verify — Confirm Signal verification code
publicRoutes.post('/initiate/verify',
  describeRoute({
    tags: ['Recovery Group'],
    summary: 'Verify Signal verification code',
    description: 'Confirms the verification code sent via Signal. On success, session advances to verified and delay timer starts. 5 attempts max per session.',
    responses: {
      200: {
        description: 'Verification result',
        content: {
          'application/json': {
            schema: resolver(recoveryInitiateVerifyResponseSchema),
          },
        },
      },
      ...publicErrors,
    },
  }),
  validator('json', recoveryInitiateVerifySchema),
  async (c) => {
    const body = c.req.valid('json')
    const services = c.get('services')

    try {
      const result = await services.recoveryGroup.verifyInitiation({
        sessionId: body.sessionId,
        verificationCode: body.verificationCode,
        hmacSecret: c.env.HMAC_SECRET || '',
      })
      return c.json(result)
    } catch (err) {
      if (err instanceof RecoveryGroupError) {
        return c.json({ error: err.message }, err.status)
      }
      throw err
    }
  },
)

// ---------------------------------------------------------------------------
// Export both route groups
// ---------------------------------------------------------------------------

export default {
  authenticated: authenticatedRoutes,
  public: publicRoutes,
}
