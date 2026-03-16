import { z } from 'zod'

// --- Input schemas ---

export const authenticateBodySchema = z.looseObject({
  assertion: z.record(z.string(), z.unknown()),
  challengeId: z.string().min(1),
})

export const addCredentialBodySchema = z.looseObject({
  label: z.string().min(1).max(100),
})

export const registerCredentialBodySchema = z.looseObject({
  attestation: z.record(z.string(), z.unknown()),
  label: z.string().min(1).max(100),
  challengeId: z.string().min(1),
})

// --- Response schemas ---

export const webauthnCredentialResponseSchema = z.object({
  id: z.string(),
  publicKey: z.string(),
  counter: z.number(),
  name: z.string().optional(),
  createdAt: z.string().optional(),
  lastUsedAt: z.string().optional(),
})

export const webauthnChallengeResponseSchema = z.object({
  challenge: z.string(),
})
