import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server'
import type { AppEnv, WebAuthnCredential } from '../types'
import { getDOs } from '../lib/do-access'
import { uint8ArrayToBase64URL, checkRateLimit } from '../lib/helpers'
import { hashIP } from '../lib/crypto'
import { generateRegOptions, verifyRegResponse, generateAuthOptions, verifyAuthResponse } from '../lib/webauthn'
import { auth as authMiddleware } from '../middleware/auth'
import { audit } from '../services/audit'
import { authenticateBodySchema, addCredentialBodySchema, registerCredentialBodySchema } from '@protocol/schemas/webauthn'
import { publicErrors, authErrors } from '../openapi/helpers'

const webauthn = new Hono<AppEnv>()

// --- Public login routes (no auth) ---

webauthn.post('/login/options',
  describeRoute({
    tags: ['WebAuthn'],
    summary: 'Generate WebAuthn login challenge',
    responses: {
      200: { description: 'Authentication options with challenge' },
      429: { description: 'Rate limited' },
      ...publicErrors,
    },
  }),
  async (c) => {
    const dos = getDOs(c.env)
    // Rate limit WebAuthn login attempts to prevent challenge flooding
    const clientIp = c.req.header('CF-Connecting-IP') || 'unknown'
    const limited = await checkRateLimit(dos.settings, `webauthn:${hashIP(clientIp, c.env.HMAC_SECRET)}`, 10)
    if (limited) return c.json({ error: 'Too many requests. Try again later.' }, 429)
    const rpID = new URL(c.req.url).hostname
    const allCredsRes = await dos.identity.fetch(new Request('http://do/webauthn/all-credentials'))
    const { credentials } = await allCredsRes.json() as { credentials: Array<WebAuthnCredential & { ownerPubkey: string }> }
    const options = await generateAuthOptions(credentials, rpID)
    const challengeId = crypto.randomUUID()
    await dos.identity.fetch(new Request('http://do/webauthn/challenge', {
      method: 'POST',
      body: JSON.stringify({ id: challengeId, challenge: options.challenge }),
    }))
    return c.json({ ...options, challengeId })
  })

webauthn.post('/login/verify',
  describeRoute({
    tags: ['WebAuthn'],
    summary: 'Verify WebAuthn login assertion',
    responses: {
      ...publicErrors,
      200: { description: 'Login successful with session token' },
      400: { description: 'Invalid or expired challenge' },
      401: { description: 'Verification failed' },
      429: { description: 'Rate limited' },
    },
  }),
  validator('json', authenticateBodySchema),
  async (c) => {
    const dos = getDOs(c.env)
    // Rate limit verification attempts
    const clientIp = c.req.header('CF-Connecting-IP') || 'unknown'
    const verifyLimited = await checkRateLimit(dos.settings, `webauthn-verify:${hashIP(clientIp, c.env.HMAC_SECRET)}`, 10)
    if (verifyLimited) return c.json({ error: 'Too many requests. Try again later.' }, 429)
    const body = c.req.valid('json')
    const assertion = body.assertion as unknown as AuthenticationResponseJSON
    const origin = new URL(c.req.url).origin
    const rpID = new URL(c.req.url).hostname
    const challengeRes = await dos.identity.fetch(new Request(`http://do/webauthn/challenge/${body.challengeId}`))
    if (!challengeRes.ok) return c.json({ error: 'Invalid or expired challenge' }, 400)
    const { challenge } = await challengeRes.json() as { challenge: string }
    const allCredsRes = await dos.identity.fetch(new Request('http://do/webauthn/all-credentials'))
    const { credentials } = await allCredsRes.json() as { credentials: Array<WebAuthnCredential & { ownerPubkey: string }> }
    const matched = credentials.find(cr => cr.id === assertion.id)
    if (!matched) return c.json({ error: 'Unknown credential' }, 401)
    try {
      const verification = await verifyAuthResponse(assertion, matched, challenge, origin, rpID)
      if (!verification.verified) return c.json({ error: 'Verification failed' }, 401)
      await dos.identity.fetch(new Request('http://do/webauthn/credentials/update-counter', {
        method: 'POST',
        body: JSON.stringify({
          pubkey: matched.ownerPubkey,
          credId: matched.id,
          counter: verification.authenticationInfo.newCounter,
          lastUsedAt: new Date().toISOString(),
        }),
      }))
      const sessionRes = await dos.identity.fetch(new Request('http://do/sessions/create', {
        method: 'POST',
        body: JSON.stringify({ pubkey: matched.ownerPubkey }),
      }))
      const session = await sessionRes.json() as { token: string; pubkey: string }
      await audit(dos.records, 'webauthnLogin', matched.ownerPubkey, { credId: matched.id }, { request: c.req.raw, hmacSecret: c.env.HMAC_SECRET })
      return c.json({ token: session.token, pubkey: session.pubkey })
    } catch {
      return c.json({ error: 'Verification failed' }, 401)
    }
  })

// --- Authenticated routes ---
webauthn.use('/register/*', authMiddleware)
webauthn.use('/credentials', authMiddleware)
webauthn.use('/credentials/*', authMiddleware)

webauthn.post('/register/options',
  describeRoute({
    tags: ['WebAuthn'],
    summary: 'Generate WebAuthn registration challenge',
    responses: {
      200: { description: 'Registration options with challenge' },
      ...authErrors,
    },
  }),
  validator('json', addCredentialBodySchema),
  async (c) => {
    const dos = getDOs(c.env)
    const pubkey = c.get('pubkey')
    const volunteer = c.get('volunteer')
    const body = c.req.valid('json')
    const rpID = new URL(c.req.url).hostname
    const rpName = c.env.HOTLINE_NAME || 'Hotline'
    const credsRes = await dos.identity.fetch(new Request(`http://do/webauthn/credentials?pubkey=${pubkey}`))
    const { credentials: existing } = await credsRes.json() as { credentials: WebAuthnCredential[] }
    const options = await generateRegOptions({ pubkey, name: volunteer.name }, existing, rpID, rpName)
    const challengeId = crypto.randomUUID()
    await dos.identity.fetch(new Request('http://do/webauthn/challenge', {
      method: 'POST',
      body: JSON.stringify({ id: challengeId, challenge: options.challenge }),
    }))
    return c.json({ ...options, challengeId })
  })

webauthn.post('/register/verify',
  describeRoute({
    tags: ['WebAuthn'],
    summary: 'Verify WebAuthn registration attestation',
    responses: {
      ...authErrors,
      200: { description: 'Registration successful' },
      400: { description: 'Invalid challenge or verification failed' },
    },
  }),
  validator('json', registerCredentialBodySchema),
  async (c) => {
    const dos = getDOs(c.env)
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')
    const attestation = body.attestation as unknown as RegistrationResponseJSON
    const origin = new URL(c.req.url).origin
    const rpID = new URL(c.req.url).hostname
    const challengeRes = await dos.identity.fetch(new Request(`http://do/webauthn/challenge/${body.challengeId}`))
    if (!challengeRes.ok) return c.json({ error: 'Invalid or expired challenge' }, 400)
    const { challenge } = await challengeRes.json() as { challenge: string }
    try {
      const verification = await verifyRegResponse(attestation, challenge, origin, rpID)
      if (!verification.verified || !verification.registrationInfo) return c.json({ error: 'Verification failed' }, 400)
      const { credential: regCred, credentialBackedUp } = verification.registrationInfo
      const newCred: WebAuthnCredential = {
        id: regCred.id,
        publicKey: uint8ArrayToBase64URL(regCred.publicKey),
        counter: regCred.counter,
        transports: attestation.response?.transports || [],
        backedUp: credentialBackedUp,
        label: body.label || 'Passkey',
        createdAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
      }
      await dos.identity.fetch(new Request('http://do/webauthn/credentials', {
        method: 'POST',
        body: JSON.stringify({ pubkey, credential: newCred }),
      }))
      await audit(dos.records, 'webauthnRegistered', pubkey, { credId: newCred.id, label: body.label }, { request: c.req.raw, hmacSecret: c.env.HMAC_SECRET })
      return c.json({ ok: true })
    } catch {
      return c.json({ error: 'Verification failed' }, 400)
    }
  })

webauthn.get('/credentials',
  describeRoute({
    tags: ['WebAuthn'],
    summary: 'List registered WebAuthn credentials',
    responses: {
      200: { description: 'List of credentials' },
      ...authErrors,
    },
  }),
  async (c) => {
    const dos = getDOs(c.env)
    const pubkey = c.get('pubkey')
    const credsRes = await dos.identity.fetch(new Request(`http://do/webauthn/credentials?pubkey=${pubkey}`))
    const { credentials } = await credsRes.json() as { credentials: WebAuthnCredential[] }
    return c.json({
      credentials: credentials.map(cr => ({
        id: cr.id,
        label: cr.label,
        backedUp: cr.backedUp,
        createdAt: cr.createdAt,
        lastUsedAt: cr.lastUsedAt,
      })),
    })
  })

webauthn.delete('/credentials/:credId',
  describeRoute({
    tags: ['WebAuthn'],
    summary: 'Delete a WebAuthn credential',
    responses: {
      ...authErrors,
      200: { description: 'Credential deleted' },
      400: { description: 'Invalid credential ID' },
    },
  }),
  async (c) => {
    const dos = getDOs(c.env)
    const pubkey = c.get('pubkey')
    const credId = decodeURIComponent(c.req.param('credId'))
    if (!credId) return c.json({ error: 'Invalid credential ID' }, 400)
    const res = await dos.identity.fetch(new Request(`http://do/webauthn/credentials/${encodeURIComponent(credId)}?pubkey=${pubkey}`, { method: 'DELETE' }))
    if (res.ok) await audit(dos.records, 'webauthnDeleted', pubkey, { credId }, { request: c.req.raw, hmacSecret: c.env.HMAC_SECRET })
    return res
  })

export default webauthn
