import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type VerifiedRegistrationResponse,
  type VerifiedAuthenticationResponse,
} from '@simplewebauthn/server'
import type { WebAuthnCredential } from '../types'

export async function generateRegOptions(
  volunteer: { pubkey: string; name: string },
  existingCreds: WebAuthnCredential[],
  rpID: string,
  rpName: string,
) {
  return generateRegistrationOptions({
    rpName,
    rpID,
    userName: volunteer.name || volunteer.pubkey.slice(0, 16),
    userID: new TextEncoder().encode(volunteer.pubkey),
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'required',
    },
    excludeCredentials: existingCreds.map(c => ({
      id: c.id,
      transports: c.transports as AuthenticatorTransport[],
    })),
  })
}

export async function verifyRegResponse(
  response: any,
  challenge: string,
  origin: string,
  rpID: string,
): Promise<VerifiedRegistrationResponse> {
  return verifyRegistrationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
  })
}

export async function generateAuthOptions(
  credentials: WebAuthnCredential[],
  rpID: string,
) {
  return generateAuthenticationOptions({
    rpID,
    userVerification: 'required',
    allowCredentials: credentials.length > 0 ? credentials.map(c => ({
      id: c.id,
      transports: c.transports as AuthenticatorTransport[],
    })) : undefined,
  })
}

export async function verifyAuthResponse(
  response: any,
  credential: WebAuthnCredential,
  challenge: string,
  origin: string,
  rpID: string,
): Promise<VerifiedAuthenticationResponse> {
  return verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: {
      id: credential.id,
      publicKey: new Uint8Array(base64URLToUint8Array(credential.publicKey).buffer) as Uint8Array<ArrayBuffer>,
      counter: credential.counter,
      transports: credential.transports as AuthenticatorTransport[],
    },
  })
}

function base64URLToUint8Array(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const padding = '='.repeat((4 - base64.length % 4) % 4)
  const binary = atob(base64 + padding)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}
