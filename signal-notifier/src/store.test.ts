import { describe, expect, test } from 'vitest'
import { unlinkSync } from 'node:fs'
import { IdentifierStore } from './store'

const TEST_SECRET = 'test-encryption-secret-for-signal-notifier-store'

function withStore(suffix: string, fn: (store: IdentifierStore) => void): void {
  const path = `./test-notifier-${suffix}.db`
  const store = new IdentifierStore(path, TEST_SECRET)
  try {
    fn(store)
  } finally {
    store.close()
    try { unlinkSync(path) } catch {}
  }
}

describe('IdentifierStore', () => {
  test('register + lookup roundtrips with encryption', () => {
    withStore('roundtrip', (store) => {
      store.register('hash1', '+15551234567', 'phone')
      const result = store.lookup('hash1')
      expect(result?.plaintext).toBe('+15551234567')
      expect(result?.type).toBe('phone')
    })
  })

  test('lookup returns null for unknown hash', () => {
    withStore('unknown', (store) => {
      expect(store.lookup('missing')).toBeNull()
    })
  })

  test('register replaces existing entry', () => {
    withStore('replace', (store) => {
      store.register('hash1', '+15551111111', 'phone')
      store.register('hash1', '+15552222222', 'phone')
      expect(store.lookup('hash1')?.plaintext).toBe('+15552222222')
    })
  })

  test('remove deletes entry', () => {
    withStore('remove', (store) => {
      store.register('hash1', '+15551111111', 'phone')
      store.remove('hash1')
      expect(store.lookup('hash1')).toBeNull()
    })
  })

  test('count returns registered entry total', () => {
    withStore('count', (store) => {
      expect(store.count()).toBe(0)
      store.register('hash1', '+15551111111', 'phone')
      store.register('hash2', '@signal.user', 'username')
      expect(store.count()).toBe(2)
      store.remove('hash1')
      expect(store.count()).toBe(1)
    })
  })

  test('isRegistered returns true for existing hash without decrypting', () => {
    withStore('isRegistered', (store) => {
      store.register('hash1', '+15551111111', 'phone')
      expect(store.isRegistered('hash1')).toBe(true)
      expect(store.isRegistered('hash2')).toBe(false)
    })
  })

  test('plaintext is encrypted at rest', () => {
    withStore('encrypted', (store) => {
      store.register('hash1', '+15551234567', 'phone')
      const raw = store.lookup('hash1')
      expect(raw?.plaintext).toBe('+15551234567')

      const store2 = new IdentifierStore('./test-notifier-encrypted.db', 'wrong-secret')
      try {
        const result = store2.lookup('hash1')
        expect(result).toBeNull()
      } finally {
        store2.close()
        try { unlinkSync('./test-notifier-encrypted.db') } catch {}
      }
    })
  })
})
