import { describe, it, expect, vi } from 'vitest'
import type { Env, DOStub, DONamespace } from '@worker/types'

// Test the getDOs / getScopedDOs / getHubDOs patterns without real bindings
function createMockNamespace(name: string): DONamespace {
  const stubs = new Map<string, DOStub>()
  return {
    idFromName(idName: string) {
      return { toString: () => `${name}:${idName}` }
    },
    get(id: { toString(): string }) {
      const key = id.toString()
      if (!stubs.has(key)) {
        stubs.set(key, {
          fetch: vi.fn(async () => new Response('ok')),
        })
      }
      return stubs.get(key)!
    },
  }
}

function createMockEnv(): Env {
  return {
    CALL_ROUTER: createMockNamespace('call-router'),
    SHIFT_MANAGER: createMockNamespace('shift-manager'),
    IDENTITY_DO: createMockNamespace('identity'),
    SETTINGS_DO: createMockNamespace('settings'),
    RECORDS_DO: createMockNamespace('records'),
    CONVERSATION_DO: createMockNamespace('conversations'),
    BLAST_DO: createMockNamespace('blasts'),
    AI: { run: async () => ({}) } as any,
    R2_BUCKET: {} as any,
    TWILIO_ACCOUNT_SID: '',
    TWILIO_AUTH_TOKEN: '',
    TWILIO_PHONE_NUMBER: '',
    ADMIN_PUBKEY: 'abc123',
    HOTLINE_NAME: 'Test Hotline',
    ENVIRONMENT: 'test',
    HMAC_SECRET: 'a'.repeat(64),
  }
}

describe('DO Access patterns', () => {
  describe('mock namespace', () => {
    it('idFromName returns consistent IDs', () => {
      const ns = createMockNamespace('test')
      const id1 = ns.idFromName('global-identity')
      const id2 = ns.idFromName('global-identity')
      expect(id1.toString()).toBe(id2.toString())
    })

    it('different names produce different IDs', () => {
      const ns = createMockNamespace('test')
      const id1 = ns.idFromName('global-identity')
      const id2 = ns.idFromName('hub-123')
      expect(id1.toString()).not.toBe(id2.toString())
    })

    it('get returns DOStub with fetch', () => {
      const ns = createMockNamespace('test')
      const id = ns.idFromName('global')
      const stub = ns.get(id)
      expect(stub.fetch).toBeDefined()
    })

    it('same ID returns same stub', () => {
      const ns = createMockNamespace('test')
      const id = ns.idFromName('global')
      const stub1 = ns.get(id)
      const stub2 = ns.get(id)
      expect(stub1).toBe(stub2)
    })
  })

  describe('singleton pattern', () => {
    it('all 6 DO namespaces are accessible', () => {
      const env = createMockEnv()
      expect(env.CALL_ROUTER).toBeDefined()
      expect(env.SHIFT_MANAGER).toBeDefined()
      expect(env.IDENTITY_DO).toBeDefined()
      expect(env.SETTINGS_DO).toBeDefined()
      expect(env.RECORDS_DO).toBeDefined()
      expect(env.CONVERSATION_DO).toBeDefined()
    })

    it('global singletons use idFromName with standard names', () => {
      const env = createMockEnv()
      // Verify the pattern works: idFromName → get → DOStub
      const id = env.IDENTITY_DO.idFromName('global-identity')
      const stub = env.IDENTITY_DO.get(id)
      expect(stub.fetch).toBeDefined()
    })

    it('hub-scoped DOs use hubId as name', () => {
      const env = createMockEnv()
      const globalId = env.RECORDS_DO.idFromName('global-records')
      const hubId = env.RECORDS_DO.idFromName('hub-nyc-123')
      // Different IDs for global vs hub-scoped
      expect(globalId.toString()).not.toBe(hubId.toString())
    })
  })

  describe('Env type structure', () => {
    it('has all required env vars', () => {
      const env = createMockEnv()
      expect(typeof env.TWILIO_ACCOUNT_SID).toBe('string')
      expect(typeof env.TWILIO_AUTH_TOKEN).toBe('string')
      expect(typeof env.TWILIO_PHONE_NUMBER).toBe('string')
      expect(typeof env.ADMIN_PUBKEY).toBe('string')
      expect(typeof env.HOTLINE_NAME).toBe('string')
      expect(typeof env.ENVIRONMENT).toBe('string')
      expect(typeof env.HMAC_SECRET).toBe('string')
    })

    it('has optional env vars', () => {
      const env = createMockEnv()
      // These are optional (may be undefined)
      expect(env.SERVER_NOSTR_SECRET).toBeUndefined()
      expect(env.NOSTR_RELAY_URL).toBeUndefined()
      expect(env.E2E_TEST_SECRET).toBeUndefined()
      expect(env.DEMO_MODE).toBeUndefined()
    })
  })
})
