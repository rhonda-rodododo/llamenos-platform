/**
 * Mock @tauri-apps/plugin-stronghold for Playwright test builds.
 * Uses localStorage as the backing store, mirroring the Stronghold store API.
 *
 * In tests, the PBKDF2 password derivation and encrypted vault are skipped —
 * this mock provides the same get/set/remove interface using localStorage.
 */

class MockStrongholdStore {
  private prefix: string

  constructor(clientName: string) {
    this.prefix = `stronghold:${clientName}:`
  }

  async get(key: string): Promise<number[]> {
    const raw = localStorage.getItem(this.prefix + key)
    if (raw === null) return []
    return JSON.parse(raw) as number[]
  }

  async insert(key: string, value: number[]): Promise<void> {
    localStorage.setItem(this.prefix + key, JSON.stringify(value))
  }

  async remove(key: string): Promise<void> {
    localStorage.removeItem(this.prefix + key)
  }
}

class MockClient {
  private clientName: string

  constructor(clientName: string) {
    this.clientName = clientName
  }

  getStore(): MockStrongholdStore {
    return new MockStrongholdStore(this.clientName)
  }
}

class MockStronghold {
  async loadClient(name: string): Promise<MockClient> {
    return new MockClient(name)
  }

  async createClient(name: string): Promise<MockClient> {
    return new MockClient(name)
  }

  async save(): Promise<void> {
    // No-op — localStorage persists automatically
  }
}

export const Stronghold = {
  async load(_path: string, _password: string): Promise<MockStronghold> {
    return new MockStronghold()
  },
}
